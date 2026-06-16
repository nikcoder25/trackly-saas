/**
 * GET /api/credits/ledger
 *
 * Per-call breakdown of `tenant_cost_events` for the signed-in user -
 * the data layer behind the Credit Ledger page at
 * /dashboard/billing/ledger. Each row in the response represents one
 * dispatched LLM call (the same accounting `getCreditStatus.monthlyUsed`
 * counts), so summing `credits` across the visible window matches the
 * billing page's "credits used this period" tile to the unit. See #453
 * for the accounting fix this surface makes auditable.
 *
 * Query parameters (all optional):
 *   from        ISO timestamp - inclusive lower bound on created_at.
 *               Defaults to the current UTC-month start (the same window
 *               `monthlyUsed` counts).
 *   to          ISO timestamp - exclusive upper bound on created_at.
 *               Defaults to "now".
 *   platform    Filter to one or more platforms. Repeat the param for
 *               multi-select (`?platform=ChatGPT&platform=Claude`) or
 *               pass a comma-separated list. Case-insensitive match on
 *               the `platform` column. Omit for "all platforms".
 *   limit       Page size, 1..200. Default 50 - chosen to match the
 *               page-size #455 calls for; callers paging via cursor can
 *               override but the UI does not.
 *   cursor      Opaque keyset cursor returned in the previous response's
 *               `nextCursor`. Page-stable under concurrent inserts since
 *               we order by (created_at DESC, id DESC).
 *
 * Response shape:
 *   {
 *     rows: LedgerRow[],
 *     totals: { credits: number, usdCost: number, count: number },
 *     window: { from: string, to: string, platform: string | null },
 *     nextCursor: string | null,
 *   }
 *
 * Rows are ordered newest-first. `totals` is computed across the
 * (from, to, platform) window - *not* the current page - so the UI can
 * show "X credits in window" even while paging.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { currentMonthStart } from '@/lib/credits';
import { ensureCostEventsTable } from '@/lib/cost-tracker';

export interface LedgerRow {
  id: string;
  /** Always 'completed' today - only successful, dispatched LLM calls
   *  hit `tenant_cost_events`. Failed / refunded calls don't insert a
   *  row, so they contribute 0 credits to the visible total (which is
   *  what the acceptance criterion on #455 asks for). The field is
   *  carried in the response so the UI can render a status badge
   *  without re-deriving it, and so a future schema that records
   *  refund/failure rows on the ledger doesn't require a wire change. */
  status: 'completed' | 'refunded' | 'failed';
  /** UTC ISO timestamp of the call. */
  createdAt: string;
  /** active_runs.id for the run this call belonged to (or null for
   *  legacy rows recorded without a run id). */
  runId: string | null;
  platform: string;
  model: string;
  /** Comma-joinable list of prompts configured on the run. We can't
   *  attribute one ledger row to one specific prompt within a multi-
   *  prompt run (cost events only carry `run_id`, not `query_id`), so
   *  the UI shows the run's configured prompts; clicking the run id
   *  opens the run detail (where per-prompt results live). */
  prompts: string[];
  brandId: string | null;
  brandName: string | null;
  tokensIn: number;
  tokensOut: number;
  /** Provider-cost in USD as estimated from token counts at insert
   *  time. Surfaced for power users; the credit unit (1 row = 1 credit)
   *  is what bills against the plan. */
  usdCost: number;
  /** Always 1 today - see `status`. Carried as a field so the response
   *  shape is forward-compatible with rows that contribute a different
   *  delta. */
  credits: number;
}

export interface LedgerResponse {
  rows: LedgerRow[];
  totals: { credits: number; usdCost: number; count: number };
  window: { from: string; to: string; platforms: string[] };
  nextCursor: string | null;
}

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/** Encode (created_at, id) as a single opaque cursor. The keyset pair
 *  keeps pagination stable under concurrent inserts - appending a new
 *  event can only ever land *before* the cursor, never duplicate /
 *  skip a row. */
function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const sep = raw.indexOf('|');
    if (sep < 0) return null;
    const createdAt = raw.slice(0, sep);
    const id = raw.slice(sep + 1);
    if (!createdAt || !id) return null;
    if (Number.isNaN(Date.parse(createdAt))) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

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

  // Default window = current UTC-month - same boundary
  // `getCreditStatus.monthlyUsed` uses, so an unfiltered ledger sums to
  // the billing-page tile. Callers can override via ?from=&to=.
  const fromDate = parseDate(url.searchParams.get('from'), currentMonthStart(now));
  const toDate = parseDate(url.searchParams.get('to'), now);
  // Multi-platform filter. Accept either repeated `?platform=` params
  // or a single comma-separated list - pickers serialize either way.
  const platformsRaw = url.searchParams.getAll('platform');
  const platforms = Array.from(new Set(
    platformsRaw
      .flatMap((v) => v.split(','))
      .map((v) => v.trim())
      .filter((v) => v.length > 0),
  ));
  const limit = clampLimit(url.searchParams.get('limit'));
  const cursorRaw = url.searchParams.get('cursor');
  const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;

  // The cost-events table is created lazily in some environments. Make
  // sure it exists before we query it, otherwise a fresh DB returns a
  // misleading 500.
  try {
    await ensureCostEventsTable();
  } catch {
    // If the migration itself fails we still attempt the read - the
    // most likely cause is a permission error on a managed DB where
    // the table already exists.
  }

  // Build the filter clause incrementally; we want to share it between
  // the page query and the totals query so they always agree on the
  // window.
  const where: string[] = ['tenant_id = $1', 'created_at >= $2', 'created_at < $3'];
  const params: unknown[] = [user.id, fromDate.toISOString(), toDate.toISOString()];
  if (platforms.length) {
    // Lowercase both sides so the picker doesn't have to know the exact
    // canonicalization recordCostEvent stamped on the row.
    params.push(platforms.map((p) => p.toLowerCase()));
    where.push(`LOWER(platform) = ANY($${params.length}::text[])`);
  }

  // Page query: keyset pagination over (created_at DESC, id DESC).
  const pageWhere = [...where];
  const pageParams = [...params];
  if (cursor) {
    pageParams.push(cursor.createdAt, cursor.id);
    pageWhere.push(
      `(created_at, id) < ($${pageParams.length - 1}::timestamptz, $${pageParams.length}::bigint)`,
    );
  }
  // Fetch (limit + 1) rows so we can tell whether a next page exists
  // without a separate COUNT.
  pageParams.push(limit + 1);
  const pageSql = `
    SELECT id, run_id, platform, model, tokens_in, tokens_out, usd_cost, created_at
      FROM tenant_cost_events
     WHERE ${pageWhere.join(' AND ')}
     ORDER BY created_at DESC, id DESC
     LIMIT $${pageParams.length}
  `;

  // Totals query: SUM/COUNT across the same window (no cursor) - gives
  // the UI the "X credits in window" headline regardless of paging.
  const totalsSql = `
    SELECT COUNT(*)::int AS count,
           COALESCE(SUM(usd_cost), 0)::numeric AS usd_cost
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
    usd_cost: string | number;
    created_at: string;
  }>;
  let totals: { count: number; usd_cost: string | number };
  try {
    const [pageRes, totalsRes] = await Promise.all([
      pool.query(pageSql, pageParams),
      pool.query(totalsSql, params),
    ]);
    pageRows = pageRes.rows as typeof pageRows;
    totals = (totalsRes.rows[0] as typeof totals) || { count: 0, usd_cost: 0 };
  } catch (e) {
    return Response.json({
      error: 'Failed to load ledger',
      detail: (e as Error).message,
    }, { status: 500 });
  }

  let hasMore = false;
  if (pageRows.length > limit) {
    hasMore = true;
    pageRows = pageRows.slice(0, limit);
  }

  // Resolve run → brand + prompts in one round-trip. Most pages only
  // touch a handful of distinct runs, so a single ANY($1) lookup
  // beats N+1 joins and keeps the page query free to use its index.
  const runIds = Array.from(
    new Set(pageRows.map((r) => r.run_id).filter((v): v is string => !!v)),
  );
  const runInfo = new Map<string, { brandId: string; queries: string[] }>();
  if (runIds.length) {
    try {
      const runRes = await pool.query(
        `SELECT id, brand_id, queries FROM active_runs WHERE id = ANY($1::text[])`,
        [runIds],
      );
      for (const r of runRes.rows as Array<{
        id: string;
        brand_id: string;
        queries: unknown;
      }>) {
        let queries: string[] = [];
        if (Array.isArray(r.queries)) queries = r.queries as string[];
        else if (typeof r.queries === 'string') {
          try { queries = JSON.parse(r.queries) || []; } catch { queries = []; }
        }
        runInfo.set(r.id, { brandId: r.brand_id, queries });
      }
    } catch {
      // active_runs may be missing in a fresh DB - degrade to "no
      // prompts/brand" rather than failing the whole response.
    }
  }

  const brandIds = Array.from(
    new Set(Array.from(runInfo.values()).map((r) => r.brandId).filter(Boolean)),
  );
  const brandNames = new Map<string, string>();
  if (brandIds.length) {
    try {
      const brandRes = await pool.query(
        `SELECT id, name FROM brands WHERE id = ANY($1::text[]) AND user_id = $2`,
        [brandIds, user.id],
      );
      for (const b of brandRes.rows as Array<{ id: string; name: string }>) {
        brandNames.set(b.id, b.name);
      }
    } catch {
      // ditto - names are nice-to-have.
    }
  }

  const rows: LedgerRow[] = pageRows.map((r) => {
    const info = r.run_id ? runInfo.get(r.run_id) : undefined;
    const brandId = info?.brandId || null;
    return {
      id: String(r.id),
      status: 'completed',
      createdAt: new Date(r.created_at).toISOString(),
      runId: r.run_id,
      platform: r.platform,
      model: r.model,
      prompts: info?.queries || [],
      brandId,
      brandName: brandId ? brandNames.get(brandId) || null : null,
      tokensIn: Number(r.tokens_in) || 0,
      tokensOut: Number(r.tokens_out) || 0,
      usdCost: parseFloat(String(r.usd_cost)) || 0,
      credits: 1,
    };
  });

  let nextCursor: string | null = null;
  if (hasMore && rows.length) {
    const last = pageRows[pageRows.length - 1];
    nextCursor = encodeCursor(
      new Date(last.created_at).toISOString(),
      String(last.id),
    );
  }

  const totalCount = Number(totals.count) || 0;
  const totalUsd = parseFloat(String(totals.usd_cost)) || 0;
  const body: LedgerResponse = {
    rows,
    totals: { credits: totalCount, usdCost: totalUsd, count: totalCount },
    window: {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      platforms,
    },
    nextCursor,
  };

  return Response.json(body, {
    headers: { 'Cache-Control': 'private, max-age=15' },
  });
}
