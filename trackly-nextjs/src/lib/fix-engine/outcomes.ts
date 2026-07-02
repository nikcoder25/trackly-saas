/**
 * Fix Engine - post-ship outcome measurement + regression watch.
 *
 * Two cron passes (run from /api/cron/fix-engine-worker):
 *
 *   runOutcomePass()    — fixes shipped ≥28 days ago with a GSC baseline get
 *                         their "after" window measured; the CTR delta is
 *                         recorded on the fix + as an `outcome.measured`
 *                         event. This is per-fix proof-of-work.
 *
 *   runRegressionWatch() — verified fixes not re-confirmed in N days get a
 *                         recheck; ones that come back un-verified (a CMS
 *                         edit / theme change wiped them) are flagged with a
 *                         `regression.detected` event and surface in the
 *                         needs-attention banner.
 *
 * Both are best-effort and bounded per tick.
 */

import { logger } from '@/lib/logger';
import {
  findFixesDueOutcome,
  findStaleVerifiedFixes,
  updateFix,
  logFixEvent,
} from './schema';
import { recheckFix, getOwnerId } from './engine';
import { fetchUrlMetricsLive, PAGE_METRICS_WINDOW_DAYS } from './page-metrics';

export const OUTCOME_WINDOW_DAYS = PAGE_METRICS_WINDOW_DAYS; // measure after a full comparable window
export const REGRESSION_AFTER_DAYS = 7;

export interface OutcomeSummary { measured: number; improved: number; declined: number }

/** Relative CTR change, null when the baseline is too thin to be meaningful. */
export function ctrDelta(
  before: { ctr?: number; impressions?: number } | null,
  after: { ctr?: number; impressions?: number } | null,
  minImpressions = 100,
): number | null {
  if (!before || !after) return null;
  const bi = Number(before.impressions) || 0;
  const ai = Number(after.impressions) || 0;
  const bc = Number(before.ctr) || 0;
  if (bi < minImpressions || ai < minImpressions || bc <= 0) return null;
  return (Number(after.ctr) - bc) / bc;
}

export async function runOutcomePass(limit = 20): Promise<OutcomeSummary> {
  const due = await findFixesDueOutcome(OUTCOME_WINDOW_DAYS, limit);
  let measured = 0, improved = 0, declined = 0;
  for (const fix of due) {
    try {
      if (!fix.targetUrl) continue;
      const ownerId = await getOwnerId(fix.brandId);
      if (!ownerId) continue;
      const after = await fetchUrlMetricsLive(fix.brandId, ownerId, fix.targetUrl);
      const gscAfter = after
        ? { clicks: after.clicks, impressions: after.impressions, ctr: after.ctr, position: after.position, at: new Date().toISOString() }
        : { unavailable: true, at: new Date().toISOString() };
      await updateFix(fix.id, { gscAfter });
      const delta = ctrDelta(fix.gscBefore as { ctr?: number; impressions?: number } | null, after);
      if (delta != null) { delta >= 0 ? improved++ : declined++; }
      measured++;
      await logFixEvent(fix.id, fix.brandId, null, 'outcome.measured', {
        ctrDelta: delta, before: fix.gscBefore, after: gscAfter,
      });
    } catch (e) {
      logger.warn('fix_engine.outcome_pass_fix_failed', { fixId: fix.id, err: (e as Error).message });
    }
  }
  return { measured, improved, declined };
}

export interface RegressionSummary { checked: number; regressed: number }

export async function runRegressionWatch(limit = 10): Promise<RegressionSummary> {
  const stale = await findStaleVerifiedFixes(REGRESSION_AFTER_DAYS, limit);
  let checked = 0, regressed = 0;
  for (const fix of stale) {
    try {
      const after = await recheckFix(fix.id, fix.brandId, null);
      checked++;
      // recheckFix flips a no-longer-live fix back to 'shipped'.
      if (after.status !== 'verified') {
        regressed++;
        await logFixEvent(fix.id, fix.brandId, null, 'regression.detected', {
          module: fix.moduleKey, targetUrl: fix.targetUrl,
        });
      }
    } catch (e) {
      logger.warn('fix_engine.regression_watch_fix_failed', { fixId: fix.id, err: (e as Error).message });
    }
  }
  return { checked, regressed };
}
