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
 *   runShipVerifyPass()  — recently shipped fixes the instant auto-recheck
 *                         couldn't confirm (usually a CDN/page cache still
 *                         serving the old HTML) get re-verified on a spaced
 *                         retry until the ship window closes, so they flip
 *                         to 'verified' on their own once the cache clears.
 *
 * All are best-effort and bounded per tick.
 */

import { logger } from '@/lib/logger';
import {
  findFixesDueOutcome,
  findStaleVerifiedFixes,
  findUnverifiedShippedFixes,
  updateFix,
  logFixEvent,
} from './schema';
import { recheckFix, revertFix, getOwnerId } from './engine';
import { getModule } from './registry';
import { getAutomation } from './automation';
import { notifyBrand } from './notify';
import { fetchUrlMetricsLive, PAGE_METRICS_WINDOW_DAYS } from './page-metrics';

export const OUTCOME_WINDOW_DAYS = PAGE_METRICS_WINDOW_DAYS; // measure after a full comparable window
export const REGRESSION_AFTER_DAYS = 7;

// Ship-verify retry: space retries ≥30 min apart (recheckFix bumps
// updated_at) and keep trying for 2 days after the ship — long enough for
// any sane CDN TTL, bounded so an abandoned mismatch doesn't crawl forever.
export const SHIP_VERIFY_RETRY_MINUTES = 30;
export const SHIP_VERIFY_WINDOW_DAYS = 2;

// Measured auto-revert guards (deliberately stricter than measurement):
// only act on a large relative drop backed by real traffic in BOTH windows,
// so noise can't un-ship a fine change.
export const REVERT_CTR_DROP = -0.2;        // ≥20% relative CTR decline
export const REVERT_MIN_IMPRESSIONS = 300;  // per window

export interface OutcomeSummary { measured: number; improved: number; declined: number; reverted: number }

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
  let measured = 0, improved = 0, declined = 0, reverted = 0;
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

      // Guarded measured auto-revert (opt-in per brand): a big, well-fed
      // CTR decline on an auto-revertable module gets undone automatically.
      if (delta != null && delta <= REVERT_CTR_DROP && (await shouldAutoRevert(fix.brandId, fix.moduleKey, fix.gscBefore, gscAfter))) {
        try {
          const out = await revertFix(fix.id, fix.brandId, null);
          if (out.status === 'reverted') {
            reverted++;
            await logFixEvent(fix.id, fix.brandId, null, 'outcome.autoreverted', {
              ctrDelta: delta, module: fix.moduleKey, targetUrl: fix.targetUrl,
            });
            await notifyBrand(fix.brandId, {
              title: 'Fix Engine — a fix was auto-undone',
              description: `The ${fix.moduleKey} change on ${fix.targetUrl} measured CTR ${Math.round(delta * 100)}% after 28 days, so it was reverted to the previous version (Measured mode).`,
            }).catch(() => undefined);
          }
        } catch (e) {
          logger.warn('fix_engine.autorevert_failed', { fixId: fix.id, err: (e as Error).message });
        }
      }
    } catch (e) {
      logger.warn('fix_engine.outcome_pass_fix_failed', { fixId: fix.id, err: (e as Error).message });
    }
  }
  return { measured, improved, declined, reverted };
}

/** All auto-revert preconditions except the delta itself. */
async function shouldAutoRevert(
  brandId: string,
  moduleKey: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): Promise<boolean> {
  const mod = getModule(moduleKey);
  if (!mod || typeof mod.revert !== 'function') return false;
  const bi = Number((before as { impressions?: number } | null)?.impressions) || 0;
  const ai = Number((after as { impressions?: number }).impressions) || 0;
  if (bi < REVERT_MIN_IMPRESSIONS || ai < REVERT_MIN_IMPRESSIONS) return false;
  const auto = await getAutomation(brandId);
  return !!auto.measuredRevert;
}

export interface ShipVerifySummary { checked: number; verified: number }

/**
 * Retry verification for recently shipped fixes that aren't 'verified' yet.
 * The instant post-ship recheck can lose to a CDN still serving cached HTML;
 * this pass re-crawls on a spaced schedule so the fix flips to 'verified'
 * by itself once the cache expires — no manual Re-check needed. Fixes still
 * unverified when the window closes stay at 'shipped' (truthful) and remain
 * one manual Re-check away.
 */
export async function runShipVerifyPass(limit = 10): Promise<ShipVerifySummary> {
  const pending = await findUnverifiedShippedFixes(SHIP_VERIFY_RETRY_MINUTES, SHIP_VERIFY_WINDOW_DAYS, limit);
  let checked = 0, verified = 0;
  for (const fix of pending) {
    try {
      const after = await recheckFix(fix.id, fix.brandId, null);
      checked++;
      if (after.status === 'verified') verified++;
    } catch (e) {
      logger.warn('fix_engine.ship_verify_fix_failed', { fixId: fix.id, err: (e as Error).message });
    }
  }
  return { checked, verified };
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
