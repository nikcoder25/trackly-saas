/**
 * Rule-based recommendation engine shared by the recommendations route
 * (Generate button) and the post-run refresh in the run route and worker.
 * Uses relative imports so the BullMQ worker (tsx + tsconfig.worker.json)
 * can load it.
 */
import { pool } from './db';
import { uid } from './helpers';
import { getPlanLimits, getEffectivePlan } from './constants';
import { logger } from './logger';

// Recommendation thresholds (mirrors Express config/constants.js)
export const THRESHOLDS = {
  lowVisibility: 0.2,
  criticalVisibility: 0.05,
  competitorDomination: 0.3,
  competitorMultiplier: 2,
  negativeSentiment: 0.3,
  criticalNegativeSentiment: 0.5,
  visibilityDecline: -20,
  missingCitationMinRate: 0.1,
  platformGapMultiplier: 0.3,
  poorRankPosition: 5,
  poorRankMinMentionRate: 0.2,
  queryBlindSpotMinRuns: 3,
};

/** How many of the brand's most recent scans the rules judge. */
const RECENT_SCANS = 7;

// ── Analytics gathering from prompt_runs ──

export interface AnalyticsData {
  overallMentionRate: number;
  avgRank: number | null;
  sentimentDistribution: { positive: number; neutral: number; negative: number };
  topCompetitors: Array<{ name: string; mentionRate: number }>;
  platformBreakdown: Record<string, { mentionRate: number; runs: number; mentions: number }>;
  queryBreakdown: Record<string, { runs: number; mentions: number }>;
  mentionedWithoutCitation: number;
  trend: { direction: string; changePercent: number } | null;
}

/** Lower-cased set of a brand's tracked strings, or null when none are set. */
export function trackedSet(list: unknown): Set<string> | null {
  if (!Array.isArray(list)) return null;
  const set = new Set(list.filter((v): v is string => typeof v === 'string' && !!v.trim()).map(v => v.trim().toLowerCase()));
  return set.size > 0 ? set : null;
}

export async function gatherAnalytics(brandId: string, brand?: { platforms?: unknown; queries?: unknown }): Promise<AnalyticsData> {
  // Only engines and prompts the brand still tracks count; old runs for
  // removed prompts or untracked engines must not produce recommendations.
  const trackedPlatforms = trackedSet(brand?.platforms);
  const trackedQueries = trackedSet(brand?.queries);

  // Judge the brand's last few scans (newest first, within 30 days) rather
  // than the whole window, so advice tracks how the brand performs now.
  const batchResult = await pool.query(
    `SELECT batch_id
       FROM prompt_runs
      WHERE brand_id = $1 AND created_at >= NOW() - INTERVAL '30 days' AND batch_id IS NOT NULL
      GROUP BY batch_id
      ORDER BY MAX(created_at) DESC
      LIMIT ${RECENT_SCANS}`,
    [brandId]
  );
  const batchIds: string[] = batchResult.rows.map((r: { batch_id: string }) => r.batch_id);

  // Overall mention rate from the recent scans
  const statsResult = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN mentioned THEN 1 ELSE 0 END) AS mentions,
       AVG(CASE WHEN mentioned AND list_position IS NOT NULL THEN list_position ELSE NULL END) AS avg_rank
     FROM prompt_runs
     WHERE brand_id = $1 AND batch_id = ANY($2) AND success = true`,
    [brandId, batchIds]
  );
  const stats = statsResult.rows[0];
  const total = parseInt(stats.total, 10) || 0;
  const mentions = parseInt(stats.mentions, 10) || 0;
  const overallMentionRate = total > 0 ? mentions / total : 0;
  const avgRank = stats.avg_rank ? parseFloat(stats.avg_rank) : null;

  // Sentiment distribution
  const sentResult = await pool.query(
    `SELECT sentiment, COUNT(*)::int AS cnt
     FROM prompt_runs
     WHERE brand_id = $1 AND batch_id = ANY($2) AND success = true AND mentioned = true
     GROUP BY sentiment`,
    [brandId, batchIds]
  );
  const sentimentDistribution = { positive: 0, neutral: 0, negative: 0 };
  for (const row of sentResult.rows) {
    const key = (row.sentiment || 'neutral') as keyof typeof sentimentDistribution;
    if (key in sentimentDistribution) sentimentDistribution[key] = row.cnt;
  }

  // Competitor mentions
  const compResult = await pool.query(
    `SELECT comp_name, COUNT(*)::int AS cnt
     FROM (
       SELECT jsonb_array_elements_text(competitor_mentions) AS comp_name
       FROM prompt_runs
       WHERE brand_id = $1 AND batch_id = ANY($2) AND success = true
     ) sub
     GROUP BY comp_name ORDER BY cnt DESC LIMIT 10`,
    [brandId, batchIds]
  );
  const topCompetitors = compResult.rows.map((r: { comp_name: string; cnt: number }) => ({
    name: r.comp_name,
    mentionRate: total > 0 ? r.cnt / total : 0,
  }));

  // Platform breakdown
  const platResult = await pool.query(
    `SELECT platform, COUNT(*)::int AS runs, SUM(CASE WHEN mentioned THEN 1 ELSE 0 END)::int AS mentions
     FROM prompt_runs
     WHERE brand_id = $1 AND batch_id = ANY($2) AND success = true
     GROUP BY platform`,
    [brandId, batchIds]
  );
  const platformBreakdown: Record<string, { mentionRate: number; runs: number; mentions: number }> = {};
  for (const row of platResult.rows) {
    if (trackedPlatforms && !trackedPlatforms.has(String(row.platform || '').toLowerCase())) continue;
    platformBreakdown[row.platform] = {
      runs: row.runs,
      mentions: row.mentions,
      mentionRate: row.runs > 0 ? row.mentions / row.runs : 0,
    };
  }

  // Query breakdown
  const queryResult = await pool.query(
    `SELECT prompt, COUNT(*)::int AS runs, SUM(CASE WHEN mentioned THEN 1 ELSE 0 END)::int AS mentions
     FROM prompt_runs
     WHERE brand_id = $1 AND batch_id = ANY($2) AND success = true
     GROUP BY prompt`,
    [brandId, batchIds]
  );
  const queryBreakdown: Record<string, { runs: number; mentions: number }> = {};
  for (const row of queryResult.rows) {
    if (trackedQueries && !trackedQueries.has(String(row.prompt || '').trim().toLowerCase())) continue;
    queryBreakdown[row.prompt] = { runs: row.runs, mentions: row.mentions };
  }

  // Mentions without citations, counted only on engines that can cite
  // (Perplexity, Gemini, or a search model).
  const citResult = await pool.query(
    `SELECT COUNT(*)::int AS cnt
     FROM prompt_runs
     WHERE brand_id = $1 AND batch_id = ANY($2) AND success = true
       AND mentioned = true AND (citations IS NULL OR citations = '[]'::jsonb)
       AND (LOWER(platform) IN ('perplexity', 'gemini') OR LOWER(COALESCE(model, '')) LIKE '%search%')`,
    [brandId, batchIds]
  );
  const mentionedWithoutCitation = citResult.rows[0]?.cnt || 0;

  // SOV trend from brand data
  let trend: { direction: string; changePercent: number } | null = null;
  try {
    const brandResult = await pool.query('SELECT data FROM brands WHERE id = $1', [brandId]);
    const data = brandResult.rows[0]?.data;
    if (data?.sovHistory && data.sovHistory.length >= 2) {
      const history = data.sovHistory as Array<{ date: string; overall: number }>;
      const recent = history.slice(-7);
      if (recent.length >= 2) {
        const first = recent[0].overall;
        const last = recent[recent.length - 1].overall;
        const changePercent = first > 0 ? ((last - first) / first) * 100 : 0;
        trend = {
          direction: changePercent > 5 ? 'improving' : changePercent < -5 ? 'declining' : 'stable',
          changePercent: Math.round(changePercent),
        };
      }
    }
  } catch { /* ignore trend calculation errors */ }

  return {
    overallMentionRate, avgRank, sentimentDistribution,
    topCompetitors, platformBreakdown, queryBreakdown,
    mentionedWithoutCitation, trend,
  };
}

// ── Rule-based recommendation generation ──

export interface Recommendation {
  type: string;
  prompt?: string;
  severity: string;
  title: string;
  description: string;
  playbook_id: string;
  payload: Record<string, unknown>;
}

export async function generateRecommendations(brandId: string, analytics: AnalyticsData): Promise<Recommendation[]> {
  const recommendations: Recommendation[] = [];

  // Get existing open recommendations to refresh instead of duplicating
  const existing = await pool.query(
    "SELECT type, prompt FROM recommendations WHERE brand_id = $1 AND status = 'open'",
    [brandId]
  );
  const existingKeys = new Set(existing.rows.map((r: { type: string; prompt: string | null }) => `${r.type}:${r.prompt || ''}`));
  // Every rule records the key it still stands behind, whether or not it
  // inserts a new row, so stale open rows can be retired below.
  const currentKeys = new Set<string>();
  const existingTypes = { has(key: string) { currentKeys.add(key); return existingKeys.has(key); } };
  // A rule that still holds refreshes its open row with the latest numbers
  // instead of skipping it; only keys with no open row insert a new one.
  const updates: Recommendation[] = [];
  const emit = (key: string, rec: Recommendation) => {
    if (existingTypes.has(key)) updates.push(rec);
    else recommendations.push(rec);
  };

  // Rule 1: Low visibility
  if (analytics.overallMentionRate < THRESHOLDS.lowVisibility) {
    const key = 'low_visibility:';
    emit(key, {
      type: 'low_visibility',
      severity: analytics.overallMentionRate < THRESHOLDS.criticalVisibility ? 'critical' : 'high',
      title: `Low AI visibility: ${(analytics.overallMentionRate * 100).toFixed(1)}% mention rate`,
      description: "Your brand appears in fewer than 20% of AI responses. Most potential customers asking AI for recommendations won't see your brand.",
      playbook_id: 'not_in_top_list',
      payload: { mentionRate: analytics.overallMentionRate },
    });
  }

  // Rule 2: Competitor domination
  if (analytics.topCompetitors.length > 0) {
    // One new competitor row per run, but every qualifying rival is checked
    // so its existing row counts as current.
    let addedCompetitor = false;
    for (const comp of analytics.topCompetitors) {
      if (comp.mentionRate > analytics.overallMentionRate * THRESHOLDS.competitorMultiplier && comp.mentionRate > THRESHOLDS.competitorDomination) {
        const key = `competitor_domination:${comp.name}`;
        const rec: Recommendation = {
          type: 'competitor_domination',
          prompt: comp.name,
          severity: 'high',
          title: `Competitor "${comp.name}" dominates with ${(comp.mentionRate * 100).toFixed(0)}% visibility`,
          description: `"${comp.name}" appears in ${(comp.mentionRate * 100).toFixed(0)}% of AI responses while your brand appears in ${(analytics.overallMentionRate * 100).toFixed(0)}%.`,
          playbook_id: 'competitor_domination',
          payload: { competitor: comp.name, competitorRate: comp.mentionRate, ownRate: analytics.overallMentionRate },
        };
        if (existingTypes.has(key)) updates.push(rec);
        else if (!addedCompetitor) { recommendations.push(rec); addedCompetitor = true; }
      }
    }
  }

  // Rule 3: Negative sentiment spike
  const sentTotal = analytics.sentimentDistribution.positive + analytics.sentimentDistribution.neutral + analytics.sentimentDistribution.negative;
  if (sentTotal > 0) {
    const negRate = analytics.sentimentDistribution.negative / sentTotal;
    if (negRate > THRESHOLDS.negativeSentiment) {
      const key = 'negative_sentiment:';
      emit(key, {
        type: 'negative_sentiment',
        severity: negRate > THRESHOLDS.criticalNegativeSentiment ? 'critical' : 'high',
        title: `${(negRate * 100).toFixed(0)}% of AI mentions have negative sentiment`,
        description: 'A significant portion of AI responses about your brand contain negative sentiment.',
        playbook_id: 'negative_sentiment_spike',
        payload: { negativeRate: negRate, distribution: analytics.sentimentDistribution },
      });
    }
  }

  // Rule 4: Visibility declining
  if (analytics.trend && analytics.trend.direction === 'declining' && analytics.trend.changePercent < THRESHOLDS.visibilityDecline) {
    const key = 'visibility_declining:';
    emit(key, {
      type: 'visibility_declining',
      severity: 'high',
      title: `Visibility declined ${Math.abs(analytics.trend.changePercent)}% over the tracking period`,
      description: 'Your share of voice is consistently decreasing. This may indicate competitors gaining ground or changes in AI model training.',
      playbook_id: 'visibility_declining',
      payload: { trend: analytics.trend },
    });
  }

  // Rule 5: Mentions without citations
  if (analytics.mentionedWithoutCitation > 0 && analytics.overallMentionRate > THRESHOLDS.missingCitationMinRate) {
    const key = 'missing_citations:';
    emit(key, {
      type: 'missing_citations',
      severity: 'medium',
      title: `${analytics.mentionedWithoutCitation} mentions without citations to your site`,
      description: "AI platforms mention your brand but don't link to your website. Adding structured data and improving your web presence can help AI include citations.",
      playbook_id: 'low_citation_authority',
      payload: { count: analytics.mentionedWithoutCitation },
    });
  }

  // Rule 6: Platform-specific weakness
  const platforms = Object.entries(analytics.platformBreakdown);
  if (platforms.length >= 2) {
    const avgRate = platforms.reduce((s, [, d]) => s + d.mentionRate, 0) / platforms.length;
    let addedGap = false;
    for (const [platform, data] of platforms) {
      if (data.mentionRate < avgRate * THRESHOLDS.platformGapMultiplier && avgRate > THRESHOLDS.missingCitationMinRate) {
        const key = `platform_gap:${platform}`;
        const rec: Recommendation = {
          type: 'platform_gap',
          prompt: platform,
          severity: 'medium',
          title: `Low visibility on ${platform} (${(data.mentionRate * 100).toFixed(0)}% vs ${(avgRate * 100).toFixed(0)}% average)`,
          description: `Your brand performs significantly worse on ${platform} compared to other platforms.`,
          playbook_id: 'not_in_top_list',
          payload: { platform, rate: data.mentionRate, avgRate },
        };
        if (existingTypes.has(key)) updates.push(rec);
        else if (!addedGap) { recommendations.push(rec); addedGap = true; }
      }
    }
  }

  // Rule 7: Query-level blind spots
  const zeroQueries = Object.entries(analytics.queryBreakdown)
    .filter(([, d]) => d.runs >= THRESHOLDS.queryBlindSpotMinRuns && d.mentions === 0)
    .map(([q]) => q);
  if (zeroQueries.length > 0 && analytics.overallMentionRate > THRESHOLDS.missingCitationMinRate) {
    const key = `query_blind_spot:${zeroQueries[0]}`;
    emit(key, {
      type: 'query_blind_spot',
      prompt: zeroQueries[0],
      severity: 'medium',
      title: `Never mentioned for "${zeroQueries[0]}"${zeroQueries.length > 1 ? ` (+${zeroQueries.length - 1} more)` : ''}`,
      description: `Your brand has never appeared in AI responses for ${zeroQueries.length} tracked ${zeroQueries.length === 1 ? 'query' : 'queries'} despite multiple runs.`,
      playbook_id: 'not_in_top_list',
      payload: { queries: zeroQueries.slice(0, 5), count: zeroQueries.length },
    });
  }

  // Rule 8: Poor ranking position
  if (analytics.avgRank && analytics.avgRank > THRESHOLDS.poorRankPosition && analytics.overallMentionRate > THRESHOLDS.poorRankMinMentionRate) {
    const key = 'low_rank:';
    emit(key, {
      type: 'low_rank',
      severity: 'medium',
      title: `Average list position is #${analytics.avgRank.toFixed(1)} - aim for top 3`,
      description: 'Your brand appears in AI responses but is typically ranked low. Top-3 positions get significantly more user attention.',
      playbook_id: 'low_citation_authority',
      payload: { avgRank: analytics.avgRank },
    });
  }

  // Persist new recommendations
  for (const rec of recommendations) {
    try {
      await pool.query(
        `INSERT INTO recommendations (id, brand_id, prompt, type, severity, title, description, playbook_id, payload, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open')`,
        [uid(), brandId, rec.prompt || null, rec.type, rec.severity, rec.title, rec.description, rec.playbook_id || null, JSON.stringify(rec.payload || {})]
      );
    } catch { /* skip individual insert failures */ }
  }

  // Refresh open rows whose rule still holds
  for (const rec of updates) {
    try {
      await pool.query(
        `UPDATE recommendations
            SET severity = $1, title = $2, description = $3, payload = $4, updated_at = NOW()
          WHERE brand_id = $5 AND status = 'open' AND type = $6 AND COALESCE(prompt, '') = $7`,
        [rec.severity, rec.title, rec.description, JSON.stringify(rec.payload || {}), brandId, rec.type, rec.prompt || ''],
      );
    } catch { /* skip individual update failures */ }
  }

  // Retire superseded rows: an open recommendation from one of these rules
  // whose condition no longer holds (e.g. a blind spot for a prompt that is
  // no longer tracked) is marked done and flagged, so only current advice
  // shows. Skipped when there is no run data to judge against. Rows a user
  // moved to in progress or ignored are left alone.
  if (Object.keys(analytics.platformBreakdown).length > 0) {
    const stale = existing.rows
      .map((r: { type: string; prompt: string | null }) => ({ type: r.type, prompt: r.prompt || '', key: `${r.type}:${r.prompt || ''}` }))
      .filter((r: { type: string; key: string }) => GENERATED_TYPES.has(r.type) && !currentKeys.has(r.key));
    for (const r of stale) {
      try {
        await pool.query(
          `UPDATE recommendations
              SET status = 'done', updated_at = NOW(),
                  payload = COALESCE(payload, '{}'::jsonb) || '{"superseded": true}'::jsonb
            WHERE brand_id = $1 AND status = 'open' AND type = $2 AND COALESCE(prompt, '') = $3`,
          [brandId, r.type, r.prompt],
        );
      } catch { /* best effort */ }
    }
  }

  return recommendations;
}

/** Rule types owned by generateRecommendations (eligible for superseding). */
const GENERATED_TYPES = new Set([
  'low_visibility', 'competitor_domination', 'negative_sentiment', 'visibility_declining',
  'missing_citations', 'platform_gap', 'query_blind_spot', 'low_rank',
]);

/**
 * Re-run the recommendation rules after a scan lands so open rows carry the
 * latest numbers and resolved ones retire without anyone pressing Generate.
 * Skipped for plans without recommendations. Never throws.
 */
export async function refreshRecommendationsAfterRun(brandId: string): Promise<void> {
  try {
    const brandResult = await pool.query('SELECT user_id, data FROM brands WHERE id = $1', [brandId]);
    const row = brandResult.rows[0];
    if (!row) return;
    const planResult = await pool.query('SELECT plan, trial_ends_at FROM users WHERE id = $1', [row.user_id]);
    const plan = getEffectivePlan(planResult.rows[0]?.plan || 'free', planResult.rows[0]?.trial_ends_at);
    if (!getPlanLimits(plan).sentiment) return;

    let data = row.data || {};
    if (typeof data === 'string') data = JSON.parse(data);
    const analytics = await gatherAnalytics(brandId, data);
    await generateRecommendations(brandId, analytics);
  } catch (err) {
    logger.error('recommendations.refresh_after_run_failed', {
      brandId,
      err: err instanceof Error ? { name: err.name, message: err.message } : String(err),
    });
  }
}
