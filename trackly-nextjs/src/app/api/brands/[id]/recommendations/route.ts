import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess, uid } from '@/lib/helpers';
import { getPlanLimits } from '@/lib/constants';

// Recommendation thresholds (mirrors Express config/constants.js)
const THRESHOLDS = {
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

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const { id } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

  // Check plan allows sentiment/recommendations
  const ownerId = access.brand.userId || user.id;
  const planResult = await pool.query('SELECT plan FROM users WHERE id = $1', [ownerId]);
  const plan = planResult.rows[0]?.plan || 'free';
  const limits = getPlanLimits(plan);
  if (!limits.sentiment) {
    return Response.json({ error: 'Recommendations are available on Starter plans and above. Upgrade to access.', planLimit: true }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const severity = url.searchParams.get('severity');

    let query = `SELECT id, brand_id, prompt, type, title, description, severity, category, status, playbook_id, payload, created_at
                 FROM recommendations WHERE brand_id = $1`;
    const values: unknown[] = [id];
    let idx = 2;

    if (status) {
      query += ` AND status = $${idx}`;
      values.push(status);
      idx++;
    }
    if (severity) {
      query += ` AND severity = $${idx}`;
      values.push(severity);
      idx++;
    }

    query += ` ORDER BY
       CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       created_at DESC LIMIT 100`;

    const result = await pool.query(query, values);
    return Response.json({ recommendations: result.rows });
  } catch {
    return Response.json({ error: 'Failed to load recommendations' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const { id } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

  // Check plan allows sentiment/recommendations
  const ownerId = access.brand.userId || user.id;
  const planResult = await pool.query('SELECT plan FROM users WHERE id = $1', [ownerId]);
  const plan = planResult.rows[0]?.plan || 'free';
  const limits = getPlanLimits(plan);
  if (!limits.sentiment) {
    return Response.json({ error: 'Recommendations are available on Starter plans and above. Upgrade to access.', planLimit: true }, { status: 403 });
  }

  try {
    // Gather analytics data from prompt_runs for this brand
    const analytics = await gatherAnalytics(id);

    // Generate recommendations based on rules
    const newRecs = await generateRecommendations(id, analytics);

    return Response.json({
      generated: newRecs.length,
      recommendations: newRecs,
    });
  } catch {
    return Response.json({ error: 'Failed to generate recommendations' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const { id: brandId } = await params;
  const access = await getBrandWithAccess(brandId, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

  const body = await request.json();
  const { id: recId, status } = body;
  if (!recId || !status) return Response.json({ error: 'Missing id or status' }, { status: 400 });

  const validStatuses = ['open', 'in_progress', 'done', 'ignored'];
  if (!validStatuses.includes(status)) return Response.json({ error: 'Invalid status' }, { status: 400 });

  try {
    const result = await pool.query(
      'UPDATE recommendations SET status = $1, updated_at = NOW() WHERE id = $2 AND brand_id = $3 RETURNING id, status',
      [status, recId, brandId]
    );
    if (!result.rows.length) return Response.json({ error: 'Recommendation not found' }, { status: 404 });
    return Response.json({ success: true, recommendation: result.rows[0] });
  } catch {
    return Response.json({ error: 'Failed to update recommendation' }, { status: 500 });
  }
}

// ── Analytics gathering from prompt_runs ──

interface AnalyticsData {
  overallMentionRate: number;
  avgRank: number | null;
  sentimentDistribution: { positive: number; neutral: number; negative: number };
  topCompetitors: Array<{ name: string; mentionRate: number }>;
  platformBreakdown: Record<string, { mentionRate: number; runs: number; mentions: number }>;
  queryBreakdown: Record<string, { runs: number; mentions: number }>;
  mentionedWithoutCitation: number;
  trend: { direction: string; changePercent: number } | null;
}

async function gatherAnalytics(brandId: string): Promise<AnalyticsData> {
  // Overall mention rate from recent runs (last 30 days)
  const statsResult = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN mentioned THEN 1 ELSE 0 END) AS mentions,
       AVG(CASE WHEN mentioned AND list_position IS NOT NULL THEN list_position ELSE NULL END) AS avg_rank
     FROM prompt_runs
     WHERE brand_id = $1 AND created_at >= NOW() - INTERVAL '30 days' AND success = true`,
    [brandId]
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
     WHERE brand_id = $1 AND created_at >= NOW() - INTERVAL '30 days' AND success = true AND mentioned = true
     GROUP BY sentiment`,
    [brandId]
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
       WHERE brand_id = $1 AND created_at >= NOW() - INTERVAL '30 days' AND success = true
     ) sub
     GROUP BY comp_name ORDER BY cnt DESC LIMIT 10`,
    [brandId]
  );
  const topCompetitors = compResult.rows.map((r: { comp_name: string; cnt: number }) => ({
    name: r.comp_name,
    mentionRate: total > 0 ? r.cnt / total : 0,
  }));

  // Platform breakdown
  const platResult = await pool.query(
    `SELECT platform, COUNT(*)::int AS runs, SUM(CASE WHEN mentioned THEN 1 ELSE 0 END)::int AS mentions
     FROM prompt_runs
     WHERE brand_id = $1 AND created_at >= NOW() - INTERVAL '30 days' AND success = true
     GROUP BY platform`,
    [brandId]
  );
  const platformBreakdown: Record<string, { mentionRate: number; runs: number; mentions: number }> = {};
  for (const row of platResult.rows) {
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
     WHERE brand_id = $1 AND created_at >= NOW() - INTERVAL '30 days' AND success = true
     GROUP BY prompt`,
    [brandId]
  );
  const queryBreakdown: Record<string, { runs: number; mentions: number }> = {};
  for (const row of queryResult.rows) {
    queryBreakdown[row.prompt] = { runs: row.runs, mentions: row.mentions };
  }

  // Mentions without citations
  const citResult = await pool.query(
    `SELECT COUNT(*)::int AS cnt
     FROM prompt_runs
     WHERE brand_id = $1 AND created_at >= NOW() - INTERVAL '30 days' AND success = true
       AND mentioned = true AND (citations IS NULL OR citations = '[]'::jsonb)`,
    [brandId]
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

interface Recommendation {
  type: string;
  prompt?: string;
  severity: string;
  title: string;
  description: string;
  playbook_id: string;
  payload: Record<string, unknown>;
}

async function generateRecommendations(brandId: string, analytics: AnalyticsData): Promise<Recommendation[]> {
  const recommendations: Recommendation[] = [];

  // Get existing open recommendations to avoid duplicates
  const existing = await pool.query(
    "SELECT type, prompt FROM recommendations WHERE brand_id = $1 AND status = 'open'",
    [brandId]
  );
  const existingTypes = new Set(existing.rows.map((r: { type: string; prompt: string | null }) => `${r.type}:${r.prompt || ''}`));

  // Rule 1: Low visibility
  if (analytics.overallMentionRate < THRESHOLDS.lowVisibility) {
    const key = 'low_visibility:';
    if (!existingTypes.has(key)) {
      recommendations.push({
        type: 'low_visibility',
        severity: analytics.overallMentionRate < THRESHOLDS.criticalVisibility ? 'critical' : 'high',
        title: `Low AI visibility: ${(analytics.overallMentionRate * 100).toFixed(1)}% mention rate`,
        description: "Your brand appears in fewer than 20% of AI responses. Most potential customers asking AI for recommendations won't see your brand.",
        playbook_id: 'not_in_top_list',
        payload: { mentionRate: analytics.overallMentionRate },
      });
    }
  }

  // Rule 2: Competitor domination
  if (analytics.topCompetitors.length > 0) {
    for (const comp of analytics.topCompetitors) {
      if (comp.mentionRate > analytics.overallMentionRate * THRESHOLDS.competitorMultiplier && comp.mentionRate > THRESHOLDS.competitorDomination) {
        const key = `competitor_domination:${comp.name}`;
        if (!existingTypes.has(key)) {
          recommendations.push({
            type: 'competitor_domination',
            prompt: comp.name,
            severity: 'high',
            title: `Competitor "${comp.name}" dominates with ${(comp.mentionRate * 100).toFixed(0)}% visibility`,
            description: `"${comp.name}" appears in ${(comp.mentionRate * 100).toFixed(0)}% of AI responses while your brand appears in ${(analytics.overallMentionRate * 100).toFixed(0)}%.`,
            playbook_id: 'competitor_domination',
            payload: { competitor: comp.name, competitorRate: comp.mentionRate, ownRate: analytics.overallMentionRate },
          });
          break;
        }
      }
    }
  }

  // Rule 3: Negative sentiment spike
  const sentTotal = analytics.sentimentDistribution.positive + analytics.sentimentDistribution.neutral + analytics.sentimentDistribution.negative;
  if (sentTotal > 0) {
    const negRate = analytics.sentimentDistribution.negative / sentTotal;
    if (negRate > THRESHOLDS.negativeSentiment) {
      const key = 'negative_sentiment:';
      if (!existingTypes.has(key)) {
        recommendations.push({
          type: 'negative_sentiment',
          severity: negRate > THRESHOLDS.criticalNegativeSentiment ? 'critical' : 'high',
          title: `${(negRate * 100).toFixed(0)}% of AI mentions have negative sentiment`,
          description: 'A significant portion of AI responses about your brand contain negative sentiment.',
          playbook_id: 'negative_sentiment_spike',
          payload: { negativeRate: negRate, distribution: analytics.sentimentDistribution },
        });
      }
    }
  }

  // Rule 4: Visibility declining
  if (analytics.trend && analytics.trend.direction === 'declining' && analytics.trend.changePercent < THRESHOLDS.visibilityDecline) {
    const key = 'visibility_declining:';
    if (!existingTypes.has(key)) {
      recommendations.push({
        type: 'visibility_declining',
        severity: 'high',
        title: `Visibility declined ${Math.abs(analytics.trend.changePercent)}% over the tracking period`,
        description: 'Your share of voice is consistently decreasing. This may indicate competitors gaining ground or changes in AI model training.',
        playbook_id: 'visibility_declining',
        payload: { trend: analytics.trend },
      });
    }
  }

  // Rule 5: Mentions without citations
  if (analytics.mentionedWithoutCitation > 0 && analytics.overallMentionRate > THRESHOLDS.missingCitationMinRate) {
    const key = 'missing_citations:';
    if (!existingTypes.has(key)) {
      recommendations.push({
        type: 'missing_citations',
        severity: 'medium',
        title: `${analytics.mentionedWithoutCitation} mentions without citations to your site`,
        description: "AI platforms mention your brand but don't link to your website. Adding structured data and improving your web presence can help AI include citations.",
        playbook_id: 'low_citation_authority',
        payload: { count: analytics.mentionedWithoutCitation },
      });
    }
  }

  // Rule 6: Platform-specific weakness
  const platforms = Object.entries(analytics.platformBreakdown);
  if (platforms.length >= 2) {
    const avgRate = platforms.reduce((s, [, d]) => s + d.mentionRate, 0) / platforms.length;
    for (const [platform, data] of platforms) {
      if (data.mentionRate < avgRate * THRESHOLDS.platformGapMultiplier && avgRate > THRESHOLDS.missingCitationMinRate) {
        const key = `platform_gap:${platform}`;
        if (!existingTypes.has(key)) {
          recommendations.push({
            type: 'platform_gap',
            prompt: platform,
            severity: 'medium',
            title: `Low visibility on ${platform} (${(data.mentionRate * 100).toFixed(0)}% vs ${(avgRate * 100).toFixed(0)}% average)`,
            description: `Your brand performs significantly worse on ${platform} compared to other platforms.`,
            playbook_id: 'not_in_top_list',
            payload: { platform, rate: data.mentionRate, avgRate },
          });
          break;
        }
      }
    }
  }

  // Rule 7: Query-level blind spots
  const zeroQueries = Object.entries(analytics.queryBreakdown)
    .filter(([, d]) => d.runs >= THRESHOLDS.queryBlindSpotMinRuns && d.mentions === 0)
    .map(([q]) => q);
  if (zeroQueries.length > 0 && analytics.overallMentionRate > THRESHOLDS.missingCitationMinRate) {
    const key = `query_blind_spot:${zeroQueries[0]}`;
    if (!existingTypes.has(key)) {
      recommendations.push({
        type: 'query_blind_spot',
        prompt: zeroQueries[0],
        severity: 'medium',
        title: `Never mentioned for "${zeroQueries[0]}"${zeroQueries.length > 1 ? ` (+${zeroQueries.length - 1} more)` : ''}`,
        description: `Your brand has never appeared in AI responses for ${zeroQueries.length} tracked ${zeroQueries.length === 1 ? 'query' : 'queries'} despite multiple runs.`,
        playbook_id: 'not_in_top_list',
        payload: { queries: zeroQueries.slice(0, 5), count: zeroQueries.length },
      });
    }
  }

  // Rule 8: Poor ranking position
  if (analytics.avgRank && analytics.avgRank > THRESHOLDS.poorRankPosition && analytics.overallMentionRate > THRESHOLDS.poorRankMinMentionRate) {
    const key = 'low_rank:';
    if (!existingTypes.has(key)) {
      recommendations.push({
        type: 'low_rank',
        severity: 'medium',
        title: `Average list position is #${analytics.avgRank.toFixed(1)} — aim for top 3`,
        description: 'Your brand appears in AI responses but is typically ranked low. Top-3 positions get significantly more user attention.',
        playbook_id: 'low_citation_authority',
        payload: { avgRank: analytics.avgRank },
      });
    }
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

  return recommendations;
}
