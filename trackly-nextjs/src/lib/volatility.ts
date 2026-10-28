/**
 * AI Volatility Index - how much AI answers moved, per engine, per day.
 *
 * WHY THIS IS BUILT THE WAY IT IS
 *
 * The obvious way to build a volatility index is the MozCast way: pick a
 * fixed panel of prompts and re-run them every day forever. That is a
 * permanent daily API bill attached to no customer, and it needs to be
 * large to be stable.
 *
 * We do not need it. Every tenant's runs already re-ask the same prompts on
 * the same engines day after day, and all of it lands in `prompt_runs`. In
 * aggregate that corpus is a panel - a bigger one than we would ever pay to
 * maintain - and reading it costs a query.
 *
 * The catch, and the reason most of the code below exists: our panel is not
 * fixed. Tenants add prompts, remove prompts, change plans, and run on
 * different schedules, so the raw set of prompts differs between any two
 * days. A naive day-over-day diff would report panel churn as engine churn
 * and the index would be noise.
 *
 * The fix is a same-prompt cohort. For each engine we compare only the
 * (prompt, engine) pairs that were measured on BOTH days, so composition
 * changes cancel out and what is left is genuine movement in the answers.
 * Days whose cohort is too small to mean anything are reported as null
 * rather than as a number nobody should trust.
 *
 * WHAT "MOVEMENT" MEANS
 *
 * Three independent signals, each 0..1, combined into a 0..100 score:
 *
 *   Source churn (60%) - Jaccard distance between the sets of domains the
 *     engine cited for that prompt yesterday and today. This is the
 *     strongest signal: when an engine changes its retrieval, the sources
 *     move before the prose does. Only counted for pairs where at least
 *     one of the two days actually produced citations.
 *
 *   Mention flips (25%) - the share of the cohort where a brand went from
 *     mentioned to not, or back. This is what a customer feels.
 *
 *   Position moves (15%) - mean absolute change in list position, softly
 *     normalized. Weakest weight because plenty of answers carry no list
 *     at all.
 *
 * The weights are a judgement call, not a fitted model, and they are
 * exported so they can be argued with.
 */

import { pool } from './db';
import { logger } from './logger';

/** Below this many comparable pairs, a day's score is not reported. */
export const MIN_COHORT = Number(process.env.VOLATILITY_MIN_COHORT) || 30;

/**
 * Minimum comparable pairs for a single brand's own series. One tenant tracks
 * tens of prompts, not thousands, so the market-wide floor of 30 would leave
 * almost every brand permanently unscored ("needs 2 days of runs").
 */
export const MIN_BRAND_COHORT = Number(process.env.VOLATILITY_MIN_BRAND_COHORT) || 3;

export const WEIGHTS = { sources: 0.6, mentions: 0.25, positions: 0.15 };

/**
 * Engine names as the dashboard shows them. prompt_runs.platform is written
 * as the display name ('ChatGPT'), but provider keys ('openai') and casing
 * variants split one engine into separate series that each look too young
 * to score. Everything here keys on the canonical name.
 */
const PLATFORM_ALIASES: Record<string, string> = {
  chatgpt: 'ChatGPT', openai: 'ChatGPT', gpt: 'ChatGPT',
  claude: 'Claude', anthropic: 'Claude',
  gemini: 'Gemini', google: 'Gemini',
  perplexity: 'Perplexity',
  grok: 'Grok', xai: 'Grok',
};

export function canonicalPlatform(platform: string | null | undefined): string {
  const raw = String(platform || '').trim();
  return PLATFORM_ALIASES[raw.toLowerCase()] || raw;
}

/** Position deltas are divided by this before clamping to 0..1. */
const POSITION_SCALE = 5;

export interface VolatilityPoint {
  day: string;
  platform: string;
  /** 0..100, or null when the cohort was too small to score. */
  score: number | null;
  cohortSize: number;
}

let schemaEnsured = false;
export async function ensureVolatilitySchema(): Promise<void> {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_volatility_daily (
      day          DATE NOT NULL,
      platform     TEXT NOT NULL,
      score        DOUBLE PRECISION,
      cohort_size  INT NOT NULL DEFAULT 0,
      source_churn DOUBLE PRECISION,
      mention_flip DOUBLE PRECISION,
      position_move DOUBLE PRECISION,
      computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (day, platform)
    );
    CREATE INDEX IF NOT EXISTS ai_volatility_day_idx
      ON ai_volatility_daily (day DESC);
  `);
  schemaEnsured = true;
}

/** Test seam: forget that the schema was ensured. */
export function __resetVolatilitySchemaCache(): void {
  schemaEnsured = false;
}

export interface DayObservation {
  prompt: string;
  platform: string;
  mentioned: boolean;
  listPosition: number | null;
  /** Distinct cited domains for this (prompt, platform) on this day. */
  domains: string[];
}

/**
 * Jaccard distance between two domain sets: 0 = identical sources,
 * 1 = no overlap at all.
 *
 * Two empty sets are "identical" in the set-theory sense, but for our
 * purposes an answer that cited nothing on both days tells us nothing about
 * whether the engine moved, so the caller filters those pairs out before
 * they reach here rather than letting them dilute the average with zeros.
 */
export function jaccardDistance(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const v of setA) if (setB.has(v)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : 1 - intersection / union;
}

export interface ScoreBreakdown {
  score: number | null;
  cohortSize: number;
  sourceChurn: number | null;
  mentionFlip: number | null;
  positionMove: number | null;
}

/**
 * Score one engine's movement between two days from their observations.
 *
 * Both inputs are one day's observations for a single platform. Pairing is
 * on the prompt text, so only prompts present on both days contribute.
 */
export function scoreDay(
  prev: DayObservation[],
  curr: DayObservation[],
  minCohort: number = MIN_COHORT,
): ScoreBreakdown {
  const prevByPrompt = new Map(prev.map(o => [o.prompt, o]));
  const pairs: Array<[DayObservation, DayObservation]> = [];
  for (const c of curr) {
    const p = prevByPrompt.get(c.prompt);
    if (p) pairs.push([p, c]);
  }

  const cohortSize = pairs.length;
  if (cohortSize < minCohort) {
    return { score: null, cohortSize, sourceChurn: null, mentionFlip: null, positionMove: null };
  }

  // Source churn: only over pairs where at least one side had citations.
  // Including citation-free pairs would drag the mean toward zero on
  // engines that rarely cite, making them look stable when we simply
  // cannot see whether they moved.
  let churnSum = 0;
  let churnCount = 0;
  for (const [p, c] of pairs) {
    if (p.domains.length === 0 && c.domains.length === 0) continue;
    churnSum += jaccardDistance(p.domains, c.domains);
    churnCount++;
  }
  const sourceChurn = churnCount > 0 ? churnSum / churnCount : null;

  // Mention flips.
  let flips = 0;
  for (const [p, c] of pairs) if (p.mentioned !== c.mentioned) flips++;
  const mentionFlip = flips / cohortSize;

  // Position moves, over pairs that had a position on both days.
  let posSum = 0;
  let posCount = 0;
  for (const [p, c] of pairs) {
    if (p.listPosition == null || c.listPosition == null) continue;
    posSum += Math.min(1, Math.abs(p.listPosition - c.listPosition) / POSITION_SCALE);
    posCount++;
  }
  const positionMove = posCount > 0 ? posSum / posCount : null;

  // Re-normalize over the components we actually have, so an engine that
  // never cites is scored on flips and positions rather than being
  // silently penalised with a zero for the missing 60%.
  let weighted = 0;
  let weightUsed = 0;
  if (sourceChurn !== null) { weighted += sourceChurn * WEIGHTS.sources; weightUsed += WEIGHTS.sources; }
  weighted += mentionFlip * WEIGHTS.mentions; weightUsed += WEIGHTS.mentions;
  if (positionMove !== null) { weighted += positionMove * WEIGHTS.positions; weightUsed += WEIGHTS.positions; }

  const score = weightUsed > 0 ? Math.round((weighted / weightUsed) * 100) : null;
  return { score, cohortSize, sourceChurn, mentionFlip, positionMove };
}

/**
 * Read one UTC day's observations across every tenant, per platform.
 *
 * Deliberately cross-tenant: the index is a market signal, not a per-brand
 * one, and no tenant's own prompt set is large enough to produce a stable
 * number. Nothing tenant-identifying leaves this function - it returns
 * prompt text, engine, and outcome only, which is what the aggregate
 * needs.
 */
export async function loadDay(day: string): Promise<Map<string, DayObservation[]>> {
  const res = await pool.query(
    `SELECT pr.platform,
            pr.prompt,
            BOOL_OR(pr.mentioned)                       AS mentioned,
            MIN(pr.list_position)                       AS list_position,
            COALESCE(
              ARRAY_AGG(DISTINCT c.domain) FILTER (WHERE c.domain IS NOT NULL),
              '{}'
            )                                           AS domains
       FROM prompt_runs pr
       LEFT JOIN citations c ON c.prompt_run_id = pr.id
      WHERE pr.created_at >= $1::date
        AND pr.created_at <  $1::date + INTERVAL '1 day'
        AND pr.success = true
        AND COALESCE(pr.cache_hit, false) = false
      GROUP BY pr.platform, pr.prompt`,
    [day],
  );

  const byPlatform = new Map<string, DayObservation[]>();
  for (const row of res.rows) {
    const platform = canonicalPlatform(row.platform);
    const list = byPlatform.get(platform) || [];
    // Two aliases of one engine on the same prompt collapse to one
    // observation, so the cohort is not double-counted.
    if (list.some(o => o.prompt === row.prompt)) continue;
    list.push({
      prompt: row.prompt,
      platform,
      mentioned: !!row.mentioned,
      listPosition: row.list_position == null ? null : Number(row.list_position),
      domains: (row.domains || []).filter(Boolean),
    });
    byPlatform.set(platform, list);
  }
  return byPlatform;
}

/**
 * Compute and store volatility for one day (compared against the day
 * before). Returns one row per platform that had any data.
 */
export async function computeVolatilityForDay(day: string): Promise<VolatilityPoint[]> {
  await ensureVolatilitySchema();

  const prevDay = new Date(`${day}T00:00:00Z`);
  prevDay.setUTCDate(prevDay.getUTCDate() - 1);
  const prevDayStr = prevDay.toISOString().slice(0, 10);

  const [currByPlatform, prevByPlatform] = await Promise.all([
    loadDay(day),
    loadDay(prevDayStr),
  ]);

  const out: VolatilityPoint[] = [];
  for (const [platform, curr] of currByPlatform) {
    const prev = prevByPlatform.get(platform) || [];
    const breakdown = scoreDay(prev, curr);
    out.push({ day, platform, score: breakdown.score, cohortSize: breakdown.cohortSize });

    await pool.query(
      `INSERT INTO ai_volatility_daily
         (day, platform, score, cohort_size, source_churn, mention_flip, position_move, computed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (day, platform) DO UPDATE SET
         score         = EXCLUDED.score,
         cohort_size   = EXCLUDED.cohort_size,
         source_churn  = EXCLUDED.source_churn,
         mention_flip  = EXCLUDED.mention_flip,
         position_move = EXCLUDED.position_move,
         computed_at   = NOW()`,
      [
        day, platform, breakdown.score, breakdown.cohortSize,
        breakdown.sourceChurn, breakdown.mentionFlip, breakdown.positionMove,
      ],
    );
  }

  logger.info('volatility.computed', {
    day,
    platforms: out.length,
    scored: out.filter(p => p.score !== null).length,
  });
  return out;
}

export interface VolatilitySeries {
  platform: string;
  points: Array<{ day: string; score: number | null; cohortSize: number }>;
  latest: number | null;
}

/** Read the stored index for the last `days` days, grouped by engine. */
export async function getVolatilitySeries(days = 90): Promise<VolatilitySeries[]> {
  try {
    await ensureVolatilitySchema();
    const res = await pool.query(
      `SELECT day, platform, score, cohort_size
         FROM ai_volatility_daily
        WHERE day >= (CURRENT_DATE - ($1::int - 1))
        ORDER BY platform, day`,
      [days],
    );
    const byPlatform = new Map<string, VolatilitySeries>();
    for (const row of res.rows) {
      const key = canonicalPlatform(row.platform);
      const entry: VolatilitySeries =
        byPlatform.get(key) || { platform: key, points: [], latest: null };
      const day = new Date(row.day).toISOString().slice(0, 10);
      // Rows stored under an alias before canonicalisation: keep one per day.
      if (entry.points.some(p => p.day === day)) continue;
      entry.points.push({
        day: new Date(row.day).toISOString().slice(0, 10),
        score: row.score == null ? null : Math.round(Number(row.score)),
        cohortSize: row.cohort_size ?? 0,
      });
      byPlatform.set(key, entry);
    }
    for (const entry of byPlatform.values()) {
      // "Latest" means the most recent day that produced a real number,
      // not the most recent row - a thin final day should not blank out
      // the headline figure.
      for (let i = entry.points.length - 1; i >= 0; i--) {
        if (entry.points[i].score !== null) { entry.latest = entry.points[i].score; break; }
      }
    }
    return [...byPlatform.values()].sort((a, b) => (b.latest ?? -1) - (a.latest ?? -1));
  } catch (e) {
    logger.error('volatility.series_failed', { errorMessage: (e as Error).message });
    return [];
  }
}

// ── Per-brand series ────────────────────────────────────────────

export interface BrandDayRow {
  /** UTC day, YYYY-MM-DD. */
  day: string;
  platform: string;
  prompt: string;
  mentioned: boolean;
  listPosition: number | null;
  domains: string[];
}

/**
 * Build one brand's volatility series from its own runs.
 *
 * Differs from the market index in the ways that matter for one brand:
 *
 *   - Only that brand's rows go in, and days before `since` (the later of
 *     the brand's creation day and the window start) are dropped, so the
 *     chart never shows dates the brand did not exist for. Reading the
 *     cross-tenant table is how Claude showed August for a brand created in
 *     September.
 *   - Each measured day is compared with the PREVIOUS MEASURED day for that
 *     engine, not the calendar day before. A plan that scans every 2 days,
 *     or a scan that lands either side of midnight UTC, otherwise never has
 *     two consecutive calendar days and every point stays null.
 *
 * The first measured day of each engine has nothing to compare against and
 * is reported with a null score.
 */
export function buildBrandVolatilitySeries(
  rows: BrandDayRow[],
  opts: { since: string; minCohort?: number },
): VolatilitySeries[] {
  const minCohort = opts.minCohort ?? MIN_BRAND_COHORT;
  const byPlatform = new Map<string, Map<string, Map<string, DayObservation>>>();
  for (const r of rows) {
    if (!r.day || r.day < opts.since) continue;
    const platform = canonicalPlatform(r.platform);
    if (!platform) continue;
    const days = byPlatform.get(platform) || new Map<string, Map<string, DayObservation>>();
    const prompts = days.get(r.day) || new Map<string, DayObservation>();
    const existing = prompts.get(r.prompt);
    if (existing) {
      // Same prompt twice in a day (two scans, or an alias): merge the way
      // loadDay's GROUP BY does.
      existing.mentioned = existing.mentioned || !!r.mentioned;
      if (r.listPosition != null) {
        existing.listPosition = existing.listPosition == null
          ? r.listPosition
          : Math.min(existing.listPosition, r.listPosition);
      }
      existing.domains = [...new Set([...existing.domains, ...r.domains.filter(Boolean)])];
    } else {
      prompts.set(r.prompt, {
        prompt: r.prompt,
        platform,
        mentioned: !!r.mentioned,
        listPosition: r.listPosition,
        domains: [...new Set(r.domains.filter(Boolean))],
      });
    }
    days.set(r.day, prompts);
    byPlatform.set(platform, days);
  }

  const out: VolatilitySeries[] = [];
  for (const [platform, days] of byPlatform) {
    const ordered = [...days.keys()].sort();
    const points: VolatilitySeries['points'] = [];
    for (let i = 0; i < ordered.length; i++) {
      if (i === 0) {
        points.push({ day: ordered[i], score: null, cohortSize: 0 });
        continue;
      }
      const prev = [...days.get(ordered[i - 1])!.values()];
      const curr = [...days.get(ordered[i])!.values()];
      const b = scoreDay(prev, curr, minCohort);
      points.push({ day: ordered[i], score: b.score, cohortSize: b.cohortSize });
    }
    let latest: number | null = null;
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].score !== null) { latest = points[i].score; break; }
    }
    out.push({ platform, points, latest });
  }
  return out.sort((a, b) => (b.latest ?? -1) - (a.latest ?? -1) || a.platform.localeCompare(b.platform));
}

/** The later of the brand's creation day and the first day of the window (UTC). */
export function brandSeriesSince(
  brandCreatedAt: string | Date | null | undefined,
  days: number,
  now: Date = new Date(),
): string {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const windowStart = start.toISOString().slice(0, 10);
  const created = brandCreatedAt ? new Date(brandCreatedAt) : null;
  if (!created || isNaN(created.getTime())) return windowStart;
  const createdDay = created.toISOString().slice(0, 10);
  return createdDay > windowStart ? createdDay : windowStart;
}

/**
 * One brand's volatility series, read live from that brand's own successful
 * runs. Scoped by brand_id: the caller must already have checked access.
 */
export async function getBrandVolatilitySeries(
  brandId: string,
  brandCreatedAt: string | Date | null | undefined,
  days = 90,
): Promise<{ series: VolatilitySeries[]; since: string }> {
  const since = brandSeriesSince(brandCreatedAt, days);
  try {
    const res = await pool.query(
      `SELECT to_char(pr.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
              pr.platform,
              pr.prompt,
              BOOL_OR(pr.mentioned)                       AS mentioned,
              MIN(pr.list_position)                       AS list_position,
              COALESCE(
                ARRAY_AGG(DISTINCT c.domain) FILTER (WHERE c.domain IS NOT NULL),
                '{}'
              )                                           AS domains
         FROM prompt_runs pr
         LEFT JOIN citations c ON c.prompt_run_id = pr.id
        WHERE pr.brand_id = $1
          AND pr.success = true
          AND pr.created_at >= ($2::date)::timestamp AT TIME ZONE 'UTC'
        GROUP BY 1, pr.platform, pr.prompt`,
      [brandId, since],
    );
    const rows: BrandDayRow[] = (res.rows as Array<{
      day: string; platform: string; prompt: string; mentioned: boolean;
      list_position: number | null; domains: string[] | null;
    }>).map(row => ({
      day: row.day,
      platform: row.platform,
      prompt: row.prompt,
      mentioned: !!row.mentioned,
      listPosition: row.list_position == null ? null : Number(row.list_position),
      domains: (row.domains || []).filter(Boolean),
    }));
    return { series: buildBrandVolatilitySeries(rows, { since }), since };
  } catch (e) {
    logger.error('volatility.brand_series_failed', { brandId, errorMessage: (e as Error).message });
    return { series: [], since };
  }
}
