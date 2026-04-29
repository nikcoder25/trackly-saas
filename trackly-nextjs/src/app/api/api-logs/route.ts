/**
 * GET /api/api-logs
 *
 * Per-call breakdown of `tenant_cost_events` for the signed-in user,
 * shaped for the "API Call Logs" tab on /dashboard/activity. Reads the
 * same source-of-truth ledger the Credit Ledger page (see
 * /api/credits/ledger and PRs #454/#457) reads from, so the count of
 * rows visible in the API Call Logs tab equals the count of
 * `tenant_cost_events` in the same window.
 *
 * Replaces the old BYOK-era `api_logs` table reader, which returned 0
 * rows on tenants that had migrated to managed keys (#459).
 *
 * Query parameters (all optional, mirror /api/credits/ledger):
 *   from        ISO timestamp - inclusive lower bound on created_at.
 *               Defaults to current UTC-month start.
 *   to          ISO timestamp - exclusive upper bound on created_at.
 *               Defaults to "now".
 *   platform    Repeat or comma-separated. Case-insensitive. Omit for
 *               "all platforms".
 *   limit       Page size, 1..200. Default 200 — the activity page
 *               renders all rows for the window, no client paging today.
 *
 * Response shape:
 *   {
 *     logs: ApiLogRow[],
 *     totals: { count: number, ok: number, errors: number, tokens: number },
 *     window: { from: string, to: string, platforms: string[] },
 *   }
 *
 * Note: `tenant_cost_events` only stores successfully-dispatched calls,
 * so `errors` is always 0 today and `status` is always 'ok'. The fields
 * are carried so the UI can render a status badge without a wire change
 * if/when failed rows start landing on the ledger.
 *
 * Provider USD cost is intentionally NOT returned — see #459 scope 2:
 * end-user pages should not surface dollar provider cost. The
 * `usd_cost` column in `tenant_cost_events` is preserved.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth, verifyRequestAuth } from '@/lib/auth';
import { currentMonthStart } from '@/lib/credits';
import { ensureCostEventsTable } from '@/lib/cost-tracker';

export interface ApiLogRow {
  id: string;
  timestamp: string;
  platform: string;
  model: string;
  status: 'ok';
  tokens: number;
  runId: string | null;
  query: string | null;
}

export interface ApiLogsResponse {
  logs: ApiLogRow[];
  totals: { count: number; ok: number; errors: number; tokens: number };
  window: { from: string; to: string; platforms: string[] };
}

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 200;

function parseDate(raw: string | null, fallback: Date): Date {
  if (!raw) return fallback;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return fallback;
  return new Date(t);
}

function clampLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, n);
}

export async function GET(request: Request): Promise<Response> {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const url = new URL(request.url);
  const now = new Date();
  const fromDate = parseDate(url.searchParams.get('from'), currentMonthStart(now));
  const toDate = parseDate(url.searchParams.get('to'), now);
  const platformsRaw = url.searchParams.getAll('platform');
  const platforms = Array.from(new Set(
    platformsRaw
      .flatMap((v) => v.split(','))
      .map((v) => v.trim())
      .filter((v) => v.length > 0),
  ));
  const limit = clampLimit(url.searchParams.get('limit'));

  try {
    await ensureCostEventsTable();
  } catch {
    // Best effort; if migration fails the most likely cause is that the
    // table already exists on a managed DB.
  }

  const where: string[] = ['tenant_id = $1', 'created_at >= $2', 'created_at < $3'];
  const params: unknown[] = [user.id, fromDate.toISOString(), toDate.toISOString()];
  if (platforms.length) {
    params.push(platforms.map((p) => p.toLowerCase()));
    where.push(`LOWER(platform) = ANY($${params.length}::text[])`);
  }

  const pageParams = [...params, limit];
  const pageSql = `
    SELECT id, run_id, platform, model, tokens_in, tokens_out, created_at
      FROM tenant_cost_events
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC, id DESC
     LIMIT $${pageParams.length}
  `;

  // COUNT(*) over the same window — guarantees the contract from #459:
  // "logs.length equals tenant_cost_events count for the same window".
  const totalsSql = `
    SELECT COUNT(*)::int AS count,
           COALESCE(SUM(tokens_in + tokens_out), 0)::bigint AS tokens
      FROM tenant_cost_events
     WHERE ${where.join(' AND ')}
  `;

  let pageRows: Array<{
    id: string | number;
    run_id: string | null;
    platform: string;
    model: string;
    tokens_in: number | string;
    tokens_out: number | string;
    created_at: string;
  }>;
  let totals: { count: number; tokens: number | string };
  try {
    const [pageRes, totalsRes] = await Promise.all([
      pool.query(pageSql, pageParams),
      pool.query(totalsSql, params),
    ]);
    pageRows = pageRes.rows as typeof pageRows;
    totals = (totalsRes.rows[0] as typeof totals) || { count: 0, tokens: 0 };
  } catch (e) {
    return Response.json({
      error: 'Failed to load API call logs',
      detail: (e as Error).message,
    }, { status: 500 });
  }

  // Resolve run → first-prompt label in one round-trip so each row can
  // show *something* in the Query column without going through N+1.
  const runIds = Array.from(
    new Set(pageRows.map((r) => r.run_id).filter((v): v is string => !!v)),
  );
  const runQuery = new Map<string, string>();
  if (runIds.length) {
    try {
      const runRes = await pool.query(
        `SELECT id, queries FROM active_runs WHERE id = ANY($1::text[])`,
        [runIds],
      );
      for (const r of runRes.rows as Array<{ id: string; queries: unknown }>) {
        let queries: string[] = [];
        if (Array.isArray(r.queries)) queries = r.queries as string[];
        else if (typeof r.queries === 'string') {
          try { queries = JSON.parse(r.queries) || []; } catch { queries = []; }
        }
        if (queries.length) runQuery.set(r.id, queries[0]);
      }
    } catch {
      // active_runs may be missing in a fresh DB — degrade to null query.
    }
  }

  const logs: ApiLogRow[] = pageRows.map((r) => ({
    id: String(r.id),
    timestamp: new Date(r.created_at).toISOString(),
    platform: r.platform,
    model: r.model,
    status: 'ok',
    tokens: (Number(r.tokens_in) || 0) + (Number(r.tokens_out) || 0),
    runId: r.run_id,
    query: r.run_id ? runQuery.get(r.run_id) || null : null,
  }));

  const totalCount = Number(totals.count) || 0;
  const totalTokens = Number(totals.tokens) || 0;
  const body: ApiLogsResponse = {
    logs,
    totals: { count: totalCount, ok: totalCount, errors: 0, tokens: totalTokens },
    window: {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      platforms,
    },
  };

  return Response.json(body, {
    headers: { 'Cache-Control': 'private, max-age=15' },
  });
}

export async function DELETE(request: Request) {
  // Legacy clear-logs surface from the BYOK-era `api_logs` table. The new
  // logs view is just a projection of `tenant_cost_events`, which is the
  // billing ledger and must not be mutated by user clicks. Keep the
  // endpoint responding 410 so old clients see a clear "gone" rather than
  // a silent 200 against a now-irrelevant table.
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });
  return Response.json(
    { error: 'API logs are now backed by the billing ledger and cannot be cleared.' },
    { status: 410 },
  );
}
