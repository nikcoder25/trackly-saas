/**
 * Fix Engine — learning from measured outcomes.
 *
 * The engine has always measured what happened to a fix 28 days after it
 * shipped, and then done nothing with it. Every fix was generated as though
 * it were the first one ever: ranked by module impact and page impressions,
 * drafted by an LLM that had never been told which of its own past drafts
 * won. If `faq-schema` had failed on eleven straight HVAC sites, the twelfth
 * got the same treatment.
 *
 * This module closes that loop. It reads the outcome history already stored
 * on shipped fixes and turns it into a prior: per module, how often did this
 * actually help, and by how much — for this brand, for this industry, and
 * across every brand on the platform.
 *
 * ── Why it is this conservative ────────────────────────────────────────────
 *
 * A learning loop fed by noise gets confidently worse over time, and SEO
 * outcome data is unusually noisy: 28-day windows, small page counts,
 * seasonality, core updates, and the client's own unrelated edits. Three
 * deliberate guards:
 *
 *   1. It learns from the *baseline-adjusted* delta (see outcomes.ts), so a
 *      sitewide swing is not attributed to the fix.
 *   2. A module needs MIN_SAMPLE measured outcomes before it influences
 *      anything at all. Below that its prior is exactly neutral.
 *   3. Scores are shrunk toward neutral in proportion to how thin the
 *      evidence is, so eight wins out of ten never carries the weight of
 *      eighty out of a hundred.
 *
 * And it never blocks anything. The prior nudges ordering — what a customer
 * is shown first — and seeds generation with examples. A module that has
 * lost every time still gets offered; it just stops being offered first.
 */

import { pool } from '@/lib/db';
import { logger } from '@/lib/logger';

/** Below this many measured outcomes, a module's prior stays neutral. */
export const MIN_SAMPLE = 5;

/**
 * Shrinkage constant. The observed mean is pulled toward neutral by
 * PRIOR_STRENGTH / (PRIOR_STRENGTH + n), so at n = MIN_SAMPLE roughly half
 * the signal survives and by n = 40 almost all of it does.
 */
export const PRIOR_STRENGTH = 8;

/**
 * Fraction of fixes held out from the prior's influence, chosen by a stable
 * hash of the fix id rather than at random.
 *
 * Without this the loop only ever sees the fixes it already believed in:
 * modules it ranks low get shown less, get shipped less, produce fewer
 * outcomes, and stay low forever regardless of merit. The hold-out keeps a
 * trickle of unweighted evidence coming in for every module, so a prior can
 * be revised by reality instead of confirmed by its own past behaviour.
 */
export const HOLDOUT_FRACTION = 0.1;

export interface ModulePrior {
  moduleKey: string;
  /** Measured outcomes behind this prior. */
  samples: number;
  /** Share of measured outcomes with a non-negative adjusted delta, 0..1. */
  winRate: number;
  /** Mean baseline-adjusted relative CTR change. */
  meanDelta: number;
  /**
   * Ranking multiplier in [0.5, 1.5]; 1 = neutral / not enough evidence.
   * Applied to the existing impact × impressions score.
   */
  weight: number;
  /** Where the evidence came from, for the UI to be honest about. */
  basis: 'brand' | 'industry' | 'global' | 'none';
}

export const NEUTRAL_PRIOR: Omit<ModulePrior, 'moduleKey'> = {
  samples: 0, winRate: 0, meanDelta: 0, weight: 1, basis: 'none',
};

interface OutcomeRow { moduleKey: string; samples: number; wins: number; meanDelta: number }

/**
 * Is this fix held out of the prior's influence?
 *
 * Deterministic in the fix id so a fix does not drift in and out of the
 * hold-out between renders, and so the same decision is reached anywhere it
 * is asked without storing a flag.
 */
export function isHeldOut(fixId: string, fraction = HOLDOUT_FRACTION): boolean {
  let h = 2166136261;
  for (let i = 0; i < fixId.length; i++) {
    h ^= fixId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000 < fraction;
}

/** Shrink an observed mean toward neutral when the sample is thin. */
export function shrink(observed: number, samples: number, strength = PRIOR_STRENGTH): number {
  if (samples <= 0) return 0;
  return observed * (samples / (samples + strength));
}

/**
 * Turn a win rate and mean delta into a ranking multiplier.
 *
 * Centred on 1 and clamped to ±50%: enough to reorder a list, never enough
 * to bury a module the customer explicitly asked for. Win rate carries most
 * of the weight because it is the more robust of the two — a single outlier
 * page can dominate a mean, but not a count.
 */
export function priorWeight(winRate: number, meanDelta: number, samples: number): number {
  if (samples < MIN_SAMPLE) return 1;
  const winSignal = shrink(winRate - 0.5, samples) * 0.8;   // ±0.4 at most
  const deltaSignal = shrink(Math.max(-0.5, Math.min(0.5, meanDelta)), samples) * 0.2;
  return Math.max(0.5, Math.min(1.5, 1 + winSignal + deltaSignal));
}

let schemaEnsured = false;
async function ensureSchema(): Promise<void> {
  if (schemaEnsured) return;
  // Outcomes live on the fix row (gsc_before / gsc_after) and in the event
  // log. This index keeps the aggregate cheap as the table grows.
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_fix_outcomes_module
      ON fixes (module_key) WHERE gsc_after IS NOT NULL
  `).catch(() => undefined);
  schemaEnsured = true;
}

/**
 * Aggregate measured outcomes into per-module priors.
 *
 * Scope order is brand → industry → global: a brand's own history is the
 * best evidence about that brand, but it is also the thinnest, so we fall
 * back to broader pools until there is enough to say anything. `basis` on
 * the result records which pool actually answered.
 */
export async function getModulePriors(
  brandId: string,
  opts: { industry?: string | null } = {},
): Promise<Map<string, ModulePrior>> {
  await ensureSchema();
  const out = new Map<string, ModulePrior>();

  try {
    const brandRows = await aggregate({ brandId });
    for (const r of brandRows) out.set(r.moduleKey, toPrior(r, 'brand'));

    // Fill the gaps from wider pools — never overwrite brand-level evidence.
    if (opts.industry) {
      for (const r of await aggregate({ industry: opts.industry })) {
        const seen = out.get(r.moduleKey);
        if (!seen || seen.samples < MIN_SAMPLE) out.set(r.moduleKey, toPrior(r, 'industry'));
      }
    }
    for (const r of await aggregate({})) {
      const seen = out.get(r.moduleKey);
      if (!seen || seen.samples < MIN_SAMPLE) out.set(r.moduleKey, toPrior(r, 'global'));
    }
  } catch (e) {
    // A learning signal is an enrichment. If the aggregate fails the engine
    // must carry on ranking exactly as it did before.
    logger.warn('fix_engine.module_priors_failed', { brandId, err: (e as Error).message });
  }

  return out;
}

function toPrior(r: OutcomeRow, basis: ModulePrior['basis']): ModulePrior {
  const winRate = r.samples > 0 ? r.wins / r.samples : 0;
  return {
    moduleKey: r.moduleKey,
    samples: r.samples,
    winRate,
    meanDelta: r.meanDelta,
    weight: priorWeight(winRate, r.meanDelta, r.samples),
    basis: r.samples >= MIN_SAMPLE ? basis : 'none',
  };
}

/**
 * Read measured outcomes out of the event log.
 *
 * `outcome.measured` events carry the adjusted delta that outcomes.ts
 * computed, which is the number worth learning from — the fix row only
 * keeps the raw before/after snapshots.
 */
async function aggregate(scope: { brandId?: string; industry?: string }): Promise<OutcomeRow[]> {
  const where: string[] = [`e.event = 'outcome.measured'`, `(e.detail->>'ctrDelta') IS NOT NULL`];
  const values: unknown[] = [];
  let i = 1;

  if (scope.brandId) { where.push(`f.brand_id = $${i++}`); values.push(scope.brandId); }
  // Industry lives inside the brand's `data` JSONB, not as a column.
  if (scope.industry) { where.push(`b.data->>'industry' = $${i++}`); values.push(scope.industry); }

  const res = await pool.query(
    `SELECT f.module_key                                              AS module_key,
            COUNT(*)                                                  AS samples,
            COUNT(*) FILTER (WHERE (e.detail->>'ctrDelta')::float >= 0) AS wins,
            AVG((e.detail->>'ctrDelta')::float)                       AS mean_delta
       FROM fix_events e
       JOIN fixes f  ON f.id = e.fix_id
       LEFT JOIN brands b ON b.id = f.brand_id
      WHERE ${where.join(' AND ')}
      GROUP BY f.module_key`,
    values,
  );

  return res.rows.map((r) => ({
    moduleKey: String(r.module_key),
    samples: Number(r.samples) || 0,
    wins: Number(r.wins) || 0,
    meanDelta: Number(r.mean_delta) || 0,
  }));
}

/**
 * The ranking multiplier for one fix.
 *
 * Held-out fixes always score neutral, so a slice of every module keeps
 * being surfaced on its own merits and keeps feeding the loop evidence it
 * did not choose.
 */
export function fixWeight(
  fixId: string,
  moduleKey: string,
  priors: Map<string, ModulePrior>,
): number {
  if (isHeldOut(fixId)) return 1;
  return priors.get(moduleKey)?.weight ?? 1;
}

export interface ModuleExample {
  targetUrl: string | null;
  delta: number;
  generated: Record<string, unknown> | null;
}

/**
 * Past winners and losers for a module, for seeding generation.
 *
 * Showing the model what actually worked on this brand beats any amount of
 * prompt engineering about what "good" looks like — and showing it the
 * losers matters just as much, because the failure modes are specific
 * (a title that got truncated, a meta description that read as spam).
 */
export async function getModuleExamples(
  brandId: string,
  moduleKey: string,
  limit = 3,
): Promise<{ winners: ModuleExample[]; losers: ModuleExample[] }> {
  try {
    const res = await pool.query(
      `SELECT f.target_url, f.generated, (e.detail->>'ctrDelta')::float AS delta
         FROM fix_events e
         JOIN fixes f ON f.id = e.fix_id
        WHERE e.event = 'outcome.measured'
          AND f.brand_id = $1
          AND f.module_key = $2
          AND (e.detail->>'ctrDelta') IS NOT NULL
        ORDER BY ABS((e.detail->>'ctrDelta')::float) DESC
        LIMIT $3`,
      [brandId, moduleKey, limit * 4],
    );
    const rows: ModuleExample[] = res.rows.map((r) => ({
      targetUrl: r.target_url ? String(r.target_url) : null,
      delta: Number(r.delta) || 0,
      generated: (r.generated as Record<string, unknown> | null) ?? null,
    }));
    return {
      winners: rows.filter((r) => r.delta > 0).slice(0, limit),
      losers: rows.filter((r) => r.delta < 0).slice(0, limit),
    };
  } catch (e) {
    logger.warn('fix_engine.module_examples_failed', { brandId, moduleKey, err: (e as Error).message });
    return { winners: [], losers: [] };
  }
}
