/**
 * Drift sweeper for `usage_counters.monthly_used`.
 *
 * Companion to refundCredits + the watchdog refund. Defensive layer
 * that catches the residue when both of those miss - most commonly:
 *   - Serverless invocation killed mid-run before the /run handler's
 *     terminal `finally` ran AND before the watchdog could observe
 *     the row (e.g. host evicted the container, deploy mid-run).
 *   - A refund path itself errored (DB hiccup, transient connection
 *     loss) and the best-effort retry was never armed.
 *
 * Without this, usage_counters.monthly_used drifts upward over time:
 * the cap gate (credits.ts:512) pins the user as "out of credits"
 * even when the ledger (tenant_cost_events) shows plenty of headroom.
 * The dashboard "AI credits 5,324 / 8,000 (67% used)" sits next to a
 * banner reading "1 credit remaining" - same period, different
 * counters, neither one wrong on its own.
 *
 * Reconcile logic per user:
 *   expected_used = ledger_count_this_month + sum(total_expected
 *                      for active_runs.status='running' rows started
 *                      this month)
 *   If usage_counters.monthly_used > expected_used + tolerance,
 *   decrement monthly_used to expected_used. Never increase it.
 *
 * Tolerance: small slack (default 5) to absorb mid-flight reservations
 * whose ledger row is mid-INSERT. Tuneable via env if a deployment
 * sees drift below the floor.
 *
 * Scope: this only repairs the reservation counter. The ledger is
 * authoritative for billing and is never written here.
 */

import { pool } from './db';
import { logger } from './logger';
import { currentMonthStart } from './credits';

export interface SweepOptions {
  /** Optional: scope to a single user (used by admin tools / tests). */
  userId?: string;
  /** Tolerance below which a gap is left alone. Default 5. */
  tolerance?: number;
  /** Override "now" for tests. */
  now?: Date;
  /** Don't write - return what would be done. */
  dryRun?: boolean;
}

export interface SweepResult {
  scanned: number;
  reconciled: number;
  totalDecremented: number;
  /** Per-user audit trail for the rows we touched. */
  details: Array<{
    user_id: string;
    before: number;
    after: number;
    decremented: number;
  }>;
}

const DEFAULT_TOLERANCE = 5;

/**
 * Reconcile usage_counters.monthly_used toward the ledger for users
 * whose reservation counter has drifted upward beyond `tolerance`.
 * Idempotent: a second call against a freshly reconciled counter is
 * a no-op.
 */
export async function sweepUsageCounterDrift(
  opts: SweepOptions = {},
): Promise<SweepResult> {
  const now = opts.now ?? new Date();
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
  const monthStart = currentMonthStart(now).toISOString();
  const periodMonth = currentMonthStart(now).toISOString().slice(0, 10);

  // For each candidate user, compute:
  //   ledger_used = COUNT(tenant_cost_events this month)
  //   inflight    = SUM(total_expected) for active_runs still 'running'
  //                  that started this month (post-month-rollover stale
  //                  rows can't justify pre-rollover counter inflation)
  //   expected    = ledger_used + inflight
  // and surface only rows where monthly_used - expected > tolerance.
  //
  // Done in one query so the read is point-in-time consistent - a
  // run that completed between sub-queries would otherwise look like
  // drift and we'd over-refund.
  const userFilter = opts.userId ? 'AND uc.user_id = $3' : '';
  const params: unknown[] = [periodMonth, monthStart];
  if (opts.userId) params.push(opts.userId);

  let candidates: Array<{
    user_id: string;
    monthly_used: number;
    ledger_used: number;
    inflight: number;
  }>;
  try {
    const res = await pool.query(
      `
      WITH ledger AS (
        SELECT tenant_id AS user_id, COUNT(*)::int AS used
          FROM tenant_cost_events
         WHERE created_at >= $2
         GROUP BY tenant_id
      ),
      inflight AS (
        SELECT b.user_id, COALESCE(SUM(ar.total_expected), 0)::int AS reserved
          FROM active_runs ar
          JOIN brands b ON b.id = ar.brand_id
         WHERE ar.status = 'running'
           AND ar.started_at >= $2
         GROUP BY b.user_id
      )
      SELECT uc.user_id,
             uc.monthly_used,
             COALESCE(l.used, 0) AS ledger_used,
             COALESCE(i.reserved, 0) AS inflight
        FROM usage_counters uc
        LEFT JOIN ledger l   ON l.user_id = uc.user_id
        LEFT JOIN inflight i ON i.user_id = uc.user_id
       WHERE uc.period_month = $1
         AND uc.monthly_used > COALESCE(l.used, 0) + COALESCE(i.reserved, 0) + ${tolerance}
         ${userFilter}
      `,
      params,
    );
    candidates = res.rows as typeof candidates;
  } catch (e) {
    logger.warn('credits_sweeper.select_failed', {
      error: (e as Error).message,
    });
    return { scanned: 0, reconciled: 0, totalDecremented: 0, details: [] };
  }

  const details: SweepResult['details'] = [];
  let reconciled = 0;
  let totalDecremented = 0;

  for (const row of candidates) {
    const expected = row.ledger_used + row.inflight;
    const before = row.monthly_used;
    const after = expected;
    const decrement = before - after;
    if (decrement <= 0) continue;

    if (opts.dryRun) {
      details.push({ user_id: row.user_id, before, after, decremented: decrement });
      reconciled++;
      totalDecremented += decrement;
      continue;
    }

    try {
      // Guarded UPDATE: only write if the counter still matches what
      // we read, AND only ever decrement. Two safety properties:
      //   1) a reservation that landed between SELECT and UPDATE makes
      //      monthly_used != $2 and the WHERE filter drops the row -
      //      we skip rather than clobber.
      //   2) GREATEST(0, ...) prevents the (impossible-in-theory) case
      //      where ledger_used + inflight is somehow larger than
      //      monthly_used from going negative.
      const upd = await pool.query(
        `UPDATE usage_counters
            SET monthly_used = GREATEST(0, $3),
                updated_at   = NOW()
          WHERE user_id      = $1
            AND period_month = $4
            AND monthly_used = $2
          RETURNING monthly_used`,
        [row.user_id, before, after, periodMonth],
      );
      if (upd.rowCount) {
        reconciled++;
        totalDecremented += decrement;
        details.push({ user_id: row.user_id, before, after, decremented: decrement });
        logger.info('credits_sweeper.reconciled', {
          user_id: row.user_id,
          before,
          after,
          decremented: decrement,
          ledger_used: row.ledger_used,
          inflight: row.inflight,
        });
      } else {
        logger.info('credits_sweeper.raced', {
          user_id: row.user_id,
          expected_before: before,
        });
      }
    } catch (e) {
      logger.warn('credits_sweeper.update_failed', {
        user_id: row.user_id,
        error: (e as Error).message,
      });
    }
  }

  return {
    scanned: candidates.length,
    reconciled,
    totalDecremented,
    details,
  };
}
