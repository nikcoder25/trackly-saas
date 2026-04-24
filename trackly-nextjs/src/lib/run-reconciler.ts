/**
 * Shared watchdog for stuck `active_runs` rows.
 *
 * Problem it solves: a run can start, write a few progress rows, then
 * stall forever (e.g. acquirePlatformSlot semaphore leak, provider fetch
 * that never resolves, host drops the Next.js after() callback). The
 * `active_runs` row stays at `status='running'`, `brands.data.runs` is
 * never appended, and the dashboard "Last Run" clock freezes even though
 * we have partial results sitting in memory / in `active_runs.results`.
 *
 * This module finalizes stale rows: flips them to `'error'`, appends a
 * minimal "partial" entry to `brands.data.runs` so Last Run reflects the
 * attempt, and releases the /run 10-min lock.
 *
 * Idempotent: a second call is a no-op (the UPDATE only matches rows
 * still in `running`, and the brands.runs append is keyed by runId).
 *
 * Called from two places:
 *   - /api/cron (hourly tick, reaps anything > stale threshold)
 *   - /api/brands/[id]/run-status/[runId] (defensive, per-request, only
 *     reconciles the exact runId being polled so a stuck run surfaces
 *     as 'error' within the 10-min threshold regardless of cron cadence)
 */
import { pool } from './db';
import { logger } from './logger';

// Staleness threshold. A row is considered stuck if `updated_at`
// (bumped by flushProgress() on every 3rd result) has not advanced
// within this window. Default 10 min per the brief.
export function getStaleRunMinutes(): number {
  const raw = parseInt(process.env.RUN_WATCHDOG_STALE_MINUTES || '', 10);
  return Number.isFinite(raw) && raw > 0 ? Math.min(120, raw) : 10;
}

interface ActiveRunColumns {
  hasCompletedAt: boolean;
  hasFinishedAt: boolean;
  errorCol: 'error' | 'error_message' | null;
  hasUpdatedAt: boolean;
}

async function introspectActiveRunsColumns(): Promise<ActiveRunColumns | null> {
  try {
    const res = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'active_runs'`
    );
    const cols = new Set((res.rows as { column_name: string }[]).map(r => r.column_name));
    if (!cols.has('status') || !cols.has('started_at') || !cols.has('brand_id')) return null;
    return {
      hasCompletedAt: cols.has('completed_at'),
      hasFinishedAt: cols.has('finished_at'),
      errorCol: cols.has('error_message') ? 'error_message'
        : cols.has('error') ? 'error'
        : null,
      hasUpdatedAt: cols.has('updated_at'),
    };
  } catch {
    return null;
  }
}

interface StaleRow {
  id: string;
  brand_id: string;
  received: number | null;
  found_count: number | null;
  error_count: number | null;
  total_expected: number | null;
  results: unknown;
  started_at: string | Date;
  last_progress_at: string | Date | null;
  queries: unknown;
  platforms: unknown;
}

interface ReconcileOptions {
  // Scope: if brandId is set, only reconcile rows for that brand.
  // If runId is set, only reconcile that specific run (and only if
  // it's actually stale by the threshold). If neither set, reconcile
  // all stale rows across the system.
  brandId?: string;
  runId?: string;
  // Reason string written to the active_runs.error column and to
  // brands.runs[...].crashError.
  reason?: string;
}

export interface ReconcileResult {
  count: number;
  brandIds: string[];
  runIds: string[];
}

/**
 * Select stale 'running' rows and return them without mutating state.
 * Split from the write phase so tests can assert the query without a
 * running worker.
 */
async function selectStaleRuns(
  cols: ActiveRunColumns,
  staleMinutes: number,
  scope: ReconcileOptions,
): Promise<StaleRow[]> {
  // Use updated_at as last_progress_at when available. Older schemas
  // (pre-PR #367) only have started_at; in those deployments the
  // watchdog effectively becomes a "stuck since start" reaper.
  const progressExpr = cols.hasUpdatedAt
    ? 'COALESCE(updated_at, started_at)'
    : 'started_at';

  const where: string[] = [
    `status = 'running'`,
    `${progressExpr} < NOW() - INTERVAL '${staleMinutes} minutes'`,
  ];
  const params: unknown[] = [];
  if (scope.brandId) {
    params.push(scope.brandId);
    where.push(`brand_id = $${params.length}`);
  }
  if (scope.runId) {
    params.push(scope.runId);
    where.push(`id = $${params.length}`);
  }

  const sql = `
    SELECT id, brand_id, received, found_count, error_count, total_expected,
           results, started_at, ${progressExpr} AS last_progress_at,
           queries, platforms
    FROM active_runs
    WHERE ${where.join(' AND ')}
    FOR UPDATE SKIP LOCKED
  `;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(sql, params);
    // Lock rows but release transaction; downstream updates re-acquire.
    await client.query('COMMIT');
    return res.rows as StaleRow[];
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    logger.warn('watchdog.select_failed', {
      error: (e as Error).message,
      scope,
    });
    return [];
  } finally {
    client.release();
  }
}

/**
 * Mark one row errored and append a minimal partial entry to
 * brands.data.runs. Idempotent: the brands.runs append checks for
 * an existing entry with the same runId and skips if present.
 */
async function finalizeStaleRow(
  row: StaleRow,
  cols: ActiveRunColumns,
  reason: string,
): Promise<boolean> {
  const sets: string[] = [`status = 'error'`];
  if (cols.hasCompletedAt) sets.push(`completed_at = NOW()`);
  else if (cols.hasFinishedAt) sets.push(`finished_at = NOW()`);
  if (cols.hasUpdatedAt) sets.push(`updated_at = NOW()`);
  const updateParams: unknown[] = [row.id];
  if (cols.errorCol) {
    updateParams.push(reason);
    sets.push(`${cols.errorCol} = COALESCE(${cols.errorCol}, $${updateParams.length})`);
  }

  // Only flip rows that are still 'running' so repeated calls no-op.
  const updateRes = await pool.query(
    `UPDATE active_runs SET ${sets.join(', ')}
     WHERE id = $1 AND status = 'running'
     RETURNING id`,
    updateParams,
  );
  if (!updateRes.rowCount) return false;

  // Append a minimal run entry so the dashboard "Last Run" clock moves.
  // Must be done in a single transaction: SELECT FOR UPDATE + UPDATE on
  // separate pool connections releases the lock between them and two
  // concurrent reconcilers silently clobber each other.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const brandRes = await client.query(
      'SELECT data FROM brands WHERE id = $1 FOR UPDATE',
      [row.brand_id],
    );
    if (!brandRes.rows.length) {
      await client.query('COMMIT');
      return true;
    }
    let data: {
      runs?: Array<{ id?: string; [k: string]: unknown }>;
      updatedAt?: string;
      [k: string]: unknown;
    } = brandRes.rows[0]?.data || {};
    if (typeof data === 'string') {
      try { data = JSON.parse(data as unknown as string); } catch { data = {}; }
    }
    if (!Array.isArray(data.runs)) data.runs = [];

    // Idempotency: skip if this runId is already recorded.
    if (data.runs.some(r => r && r.id === row.id)) {
      await client.query('COMMIT');
      return true;
    }

    const resultsArr = Array.isArray(row.results) ? (row.results as Array<Record<string, unknown>>) : [];
    const received = Number(row.received || 0);
    const errorCount = Number(row.error_count || 0);
    const foundCount = Number(row.found_count || 0);
    const nowIso = new Date().toISOString();
    const totalExpected = Number(row.total_expected || 0);
    data.runs.push({
      id: row.id,
      date: nowIso.split('T')[0],
      time: nowIso,
      sov: 0,
      totalQ: received,
      totalM: foundCount,
      newMentions: foundCount,
      activePlatforms: Array.isArray(row.platforms) ? (row.platforms as string[]) : [],
      queries: Array.isArray(row.queries) ? (row.queries as string[]) : [],
      allResults: resultsArr.slice(0, 200),
      errorCount,
      totalExpected,
      emergencySave: true,
      watchdogReap: true,
      crashError: reason,
    });
    if (data.runs.length > 30) data.runs = data.runs.slice(-30);
    data.updatedAt = nowIso;

    await client.query(
      'UPDATE brands SET data = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(data), row.brand_id],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    logger.warn('watchdog.brand_append_failed', {
      run_id: row.id,
      brand_id: row.brand_id,
      error: (e as Error).message,
    });
    // Row is already flipped to 'error' so the /run lock is released even
    // if the brand append failed; user will see the status change.
  } finally {
    client.release();
  }
  return true;
}

export async function reconcileStaleRuns(
  opts: ReconcileOptions = {},
): Promise<ReconcileResult> {
  const staleMinutes = getStaleRunMinutes();
  const reason = opts.reason
    || `watchdog reaped: no progress for >${staleMinutes}min`;
  const cols = await introspectActiveRunsColumns();
  if (!cols) return { count: 0, brandIds: [], runIds: [] };

  const rows = await selectStaleRuns(cols, staleMinutes, opts);
  if (!rows.length) return { count: 0, brandIds: [], runIds: [] };

  const brandIds = new Set<string>();
  const runIds: string[] = [];
  let count = 0;
  for (const row of rows) {
    const ok = await finalizeStaleRow(row, cols, reason);
    if (ok) {
      count++;
      brandIds.add(row.brand_id);
      runIds.push(row.id);
    }
  }
  if (count > 0) {
    logger.info('watchdog.reconciled', {
      count,
      threshold_minutes: staleMinutes,
      brand_ids: Array.from(brandIds).slice(0, 20),
      run_ids: runIds.slice(0, 20),
      scope: opts,
    });
  }
  return { count, brandIds: Array.from(brandIds), runIds };
}
