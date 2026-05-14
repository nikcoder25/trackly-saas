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
import { computeSovFromResults } from './run-sov';
import { aggregateCompetitorCounts } from './parser';
import { refundCredits } from './credits';

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
  hasKind: boolean;
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
      hasKind: cols.has('kind'),
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
  // 'auto' (cron) or 'manual' (user-triggered). NULL on rows inserted
  // before the kind column was added — treated as 'auto' downstream to
  // avoid over-refunding the manual daily counter for unknown rows.
  kind: 'auto' | 'manual' | null;
}

interface ReconcileOptions {
  // Scope: if brandId is set, only reconcile rows for that brand.
  // If runId is set, only reconcile that specific run. If neither is
  // set, reconcile all stale rows across the system.
  brandId?: string;
  runId?: string;
  // Reason string written to the active_runs.error column and to
  // brands.runs[...].crashError.
  reason?: string;
  // Override the staleness window for this single call. Used by the
  // admin "reap all stale" UI which lets the operator pick a more
  // conservative threshold (default 30 min) over the env default.
  // Hard floor at getStaleRunMinutes() — we never reap rows fresher
  // than the env-default watchdog threshold, even if the caller
  // passes a smaller number, because that risks killing healthy
  // runs that haven't yet had a chance to flush progress.
  minAgeMinutes?: number;
  // Bypass the staleness gate entirely. ONLY honored when paired
  // with an explicit `runId`. Combined with `brandId` or scope-wide
  // calls it is silently ignored — bulk operations always go
  // through the staleness gate. This shape is enforced server-side
  // in the admin reap route and re-validated here as defense in
  // depth so a future caller can't accidentally reap the fleet.
  force?: boolean;
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

  // Force is only honored when targeting a specific runId. Bulk
  // calls always go through the staleness gate — see the type
  // comment for why.
  const surgicalForce = !!(scope.force && scope.runId);

  const where: string[] = [`status = 'running'`];
  if (!surgicalForce) {
    where.push(`${progressExpr} < NOW() - INTERVAL '${staleMinutes} minutes'`);
  }
  const params: unknown[] = [];
  if (scope.brandId) {
    params.push(scope.brandId);
    where.push(`brand_id = $${params.length}`);
  }
  if (scope.runId) {
    params.push(scope.runId);
    where.push(`id = $${params.length}`);
  }

  const kindExpr = cols.hasKind ? 'kind' : 'NULL::text';
  const sql = `
    SELECT id, brand_id, received, found_count, error_count, total_expected,
           results, started_at, ${progressExpr} AS last_progress_at,
           queries, platforms, ${kindExpr} AS kind
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

  // Refund unused reserved credits to the brand owner. Mirrors the
  // /run handler's terminal `finally` block (route.ts:654-683): we
  // reserved `total_expected` up front; `received` is how many sub-
  // tasks the worker actually dispatched. Any gap is a sub-task that
  // never spent against the ledger, so it's safe — and necessary — to
  // return those credits to the owner's reservation counter. Without
  // this, every watchdog-reaped run permanently inflates
  // usage_counters.monthly_used until the monthly reset, eventually
  // pinning the cap gate even when the ledger shows plenty of headroom
  // remaining (issue: contractor-kingdom freeze, May 2026).
  //
  // Resolve the credit owner from the brand row directly — distinct
  // from active_runs.user_id, which for shared brands is the calling
  // team member, not the credit-holding account.
  const totalExpected = Number(row.total_expected || 0);
  const received = Number(row.received || 0);
  const unused = Math.max(0, totalExpected - received);
  if (unused > 0) {
    try {
      const ownerRes = await pool.query(
        'SELECT user_id FROM brands WHERE id = $1 LIMIT 1',
        [row.brand_id],
      );
      const ownerId = ownerRes.rows[0]?.user_id as string | undefined;
      if (ownerId) {
        // Default to 'auto' when kind is unknown (pre-migration rows):
        // refunds against 'auto' only touch monthly_used, so we never
        // over-refund the manual daily counter for runs whose kind
        // wasn't recorded.
        const kind: 'auto' | 'manual' = row.kind === 'manual' ? 'manual' : 'auto';
        await refundCredits(ownerId, unused, kind);
        logger.info('watchdog.credits_refunded', {
          run_id: row.id,
          brand_id: row.brand_id,
          owner_id: ownerId,
          kind,
          refunded: unused,
          received,
          total_expected: totalExpected,
        });
      }
    } catch (e) {
      logger.warn('watchdog.credit_refund_failed', {
        run_id: row.id,
        brand_id: row.brand_id,
        error: (e as Error).message,
      });
      // Don't bail — appending the brand entry still needs to happen so
      // the dashboard "Last Run" clock advances. A missed refund self-
      // heals on monthly reset and is recoverable via the drift sweeper
      // (src/lib/credits-sweeper.ts).
    }
  }

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

    // Truthful partial entry. Pre-PR-C-1 the reaper wrote sov:0
    // hardcoded and omitted platforms / durationMs / citations /
    // competitors entirely, which left the Overview dashboard
    // reading "0% SOV / 0/5 Platforms Active / Run Duration N/A"
    // even when the partial run contained 15 successful mentions.
    // Now we derive every dashboard-visible field from the data the
    // reaper already reads.
    const trimmedResults = resultsArr.slice(0, 200);

    // Per-platform stats — same shape and formula as run-worker.ts
    // computes on terminal success. For platforms that hadn't yet
    // run any queries when the worker died (worker progresses
    // platform-by-platform), `queries: 0` is honest "no data yet"
    // rather than the previous `activePlatforms: [...names]` string
    // array, which the dashboard couldn't read.
    const configuredPlatforms = Array.isArray(row.platforms) ? (row.platforms as string[]) : [];
    const platformStats: Record<string, { queries: number; mentions: number; sov: number; errors: number }> = {};
    for (const plat of configuredPlatforms) {
      const platResults = trimmedResults.filter(r => (r as { platform?: unknown }).platform === plat);
      const platTotal = platResults.length;
      const platMentions = platResults.filter(r => (r as { mentioned?: boolean }).mentioned).length;
      const platErrors = platResults.filter(r => (r as { error?: boolean }).error).length;
      platformStats[plat] = {
        queries: platTotal,
        mentions: platMentions,
        sov: platTotal > 0 ? Math.round((platMentions / platTotal) * 100) : 0,
        errors: platErrors,
      };
    }

    // Overall SOV — Mentions-page formula (found / non-error). When
    // received is 0 (worker died before any result was flushed) the
    // helper returns 0 by definition.
    const sov = computeSovFromResults(
      trimmedResults as Array<{ error?: boolean; mentioned?: boolean }>,
    );

    // Citations — replicate the run-worker domain-counting walk.
    const citationCounts: Record<string, number> = {};
    for (const r of trimmedResults) {
      const cites = ((r as { citations?: string[] }).citations) || [];
      for (const url of cites) {
        try {
          const domain = new URL(url).hostname.replace(/^www\./, '');
          citationCounts[domain] = (citationCounts[domain] || 0) + 1;
        } catch { /* skip invalid URLs */ }
      }
    }

    // Competitors — same util the worker uses on success.
    const competitorCounts = aggregateCompetitorCounts(
      trimmedResults as Array<{ competitorMentions?: string[] }>,
    );

    // Run duration — wall-clock from started_at to the reap moment.
    // Truthful: this is how long the run was alive before it died.
    let durationMs: number | null = null;
    const startedAtMs = new Date(row.started_at as string | Date).getTime();
    if (Number.isFinite(startedAtMs)) durationMs = Date.now() - startedAtMs;

    data.runs.push({
      id: row.id,
      date: nowIso.split('T')[0],
      time: nowIso,
      durationMs,
      sov,
      totalQ: received,
      totalM: foundCount,
      newMentions: foundCount,
      platforms: platformStats,
      activePlatforms: configuredPlatforms,
      queries: Array.isArray(row.queries) ? (row.queries as string[]) : [],
      allResults: trimmedResults,
      citations: citationCounts,
      competitors: competitorCounts,
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
  const envFloor = getStaleRunMinutes();
  // Operator-supplied minAgeMinutes can RAISE the threshold (be more
  // conservative) but never lower it past the env default. A more
  // aggressive bulk reap would risk killing healthy runs whose
  // workers simply haven't flushed progress in the last N minutes.
  const requestedAge = (typeof opts.minAgeMinutes === 'number' && Number.isFinite(opts.minAgeMinutes))
    ? Math.floor(opts.minAgeMinutes)
    : envFloor;
  const staleMinutes = Math.max(envFloor, requestedAge);
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
      // Audit fields so manual reaps from /api/admin/runs/reap show
      // up distinct from the autonomous cron reaper. `force` is the
      // surgical-runId path; tagged here so the operator action is
      // distinguishable in log queries.
      forced: !!(opts.force && opts.runId),
      brand_ids: Array.from(brandIds).slice(0, 20),
      run_ids: runIds.slice(0, 20),
      scope: opts,
    });
  }
  return { count, brandIds: Array.from(brandIds), runIds };
}
