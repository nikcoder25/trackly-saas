/**
 * Contract test for `reconcileStaleRuns({ brandId })` - the form
 * POST /api/brands/[id]/run now calls at the top to clear a stale
 * 'running' row that would otherwise reject the new trigger via the
 * partial unique index on (brand_id) WHERE status='running'.
 *
 * Two layers of coverage:
 *
 *  1. Behavioral: with a brandId scope, the reconciler must select
 *     ONLY rows for that brand and finalize them as 'error'. This
 *     pins the SQL contract the run route depends on.
 *
 *  2. Source-level: the run route must import + call
 *     reconcileStaleRuns somewhere. This is a cheap regression guard
 *     - if a future refactor silently drops the call, the dashboard
 *     freeze bug returns. A higher-fidelity end-to-end test would
 *     have to mock 15+ heavy modules (AI platforms, credits, cron,
 *     queue, fairness, etc.); the cost/value tradeoff isn't worth
 *     it for a 5-line call site that's already covered by the
 *     behavioral test of the reconciler itself.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const { queryFn, connectFn } = vi.hoisted(() => ({
  queryFn: vi.fn(),
  connectFn: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  pool: {
    query: (sql: string, params: unknown[] = []) => queryFn(sql, params),
    connect: () => connectFn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  },
}));

import { reconcileStaleRuns } from '@/lib/run-reconciler';

beforeEach(() => {
  queryFn.mockReset();
  connectFn.mockReset();
});

function makeClientFor(rows: Array<Record<string, unknown>>) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const client = {
    query: vi.fn((sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return Promise.resolve({ rows: [] });
      }
      // The SELECT FOR UPDATE phase inside the reconciler hits the
      // dedicated client. Hand back the staged stale rows here.
      if (/FROM active_runs[\s\S]*FOR UPDATE SKIP LOCKED/.test(sql)) {
        return Promise.resolve({ rows });
      }
      // Brand-fetch inside finalizeStaleRow.
      if (/SELECT data FROM brands WHERE id = \$1 FOR UPDATE/.test(sql)) {
        return Promise.resolve({ rows: [{ data: { runs: [] } }] });
      }
      // Brand UPDATE inside finalizeStaleRow.
      if (/^UPDATE brands SET data/.test(sql)) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.resolve({ rows: [] });
    }),
    release: vi.fn(),
  };
  return { client, calls };
}

describe('reconcileStaleRuns({ brandId }) - contract used by POST /run entry', () => {
  it('passes the brandId into the SELECT FOR UPDATE WHERE clause', async () => {
    // Top-level introspection query.
    queryFn.mockImplementation((sql: string) => {
      if (/FROM information_schema\.columns/.test(sql)) {
        return Promise.resolve({
          rows: [
            { column_name: 'status' },
            { column_name: 'started_at' },
            { column_name: 'brand_id' },
            { column_name: 'updated_at' },
            { column_name: 'completed_at' },
            { column_name: 'error' },
          ],
        });
      }
      // Default: row not stale → no-op return path.
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const { client, calls } = makeClientFor([]); // no stale rows
    connectFn.mockResolvedValue(client);

    const out = await reconcileStaleRuns({ brandId: 'brand_X' });
    expect(out.count).toBe(0);

    // The SELECT FOR UPDATE must have been issued with the brandId
    // bound as a positional parameter - not interpolated, not
    // unscoped. Otherwise the reconciler would sweep the fleet on
    // every /run click.
    const selectCall = calls.find(c => /FOR UPDATE SKIP LOCKED/.test(c.sql));
    expect(selectCall).toBeTruthy();
    expect(selectCall!.sql).toMatch(/brand_id = \$\d+/);
    expect(selectCall!.params).toEqual(['brand_X']);
  });

  it('finalizes a stale running row and reports the brandId in the result', async () => {
    queryFn.mockImplementation((sql: string) => {
      if (/FROM information_schema\.columns/.test(sql)) {
        return Promise.resolve({
          rows: [
            { column_name: 'status' },
            { column_name: 'started_at' },
            { column_name: 'brand_id' },
            { column_name: 'updated_at' },
            { column_name: 'completed_at' },
            { column_name: 'error' },
          ],
        });
      }
      // Top-level UPDATE that flips the row to 'error'. The reconciler
      // requires rowCount > 0 to proceed to the brands.runs append.
      if (/UPDATE active_runs SET[\s\S]*WHERE id = \$1 AND status = 'running'/.test(sql)) {
        return Promise.resolve({ rows: [{ id: 'run_stuck' }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const { client } = makeClientFor([{
      id: 'run_stuck',
      brand_id: 'brand_X',
      received: 7,
      found_count: 2,
      error_count: 1,
      total_expected: 50,
      results: [],
      started_at: new Date(Date.now() - 30 * 60_000).toISOString(),
      last_progress_at: new Date(Date.now() - 30 * 60_000).toISOString(),
      queries: ['q1'],
      platforms: ['ChatGPT'],
    }]);
    connectFn.mockResolvedValue(client);

    const out = await reconcileStaleRuns({
      brandId: 'brand_X',
      reason: 'reconciled at /run entry: stale running row blocked new trigger',
    });
    expect(out.count).toBe(1);
    expect(out.brandIds).toEqual(['brand_X']);
    expect(out.runIds).toEqual(['run_stuck']);
  });
});

describe('regression guard - POST /run still calls reconcileStaleRuns at entry', () => {
  it('imports and invokes reconcileStaleRuns({ brandId: id }) before the lock-check INSERT', () => {
    const routePath = join(__dirname, '..', 'src', 'app', 'api', 'brands', '[id]', 'run', 'route.ts');
    const src = readFileSync(routePath, 'utf8');

    // 1. Import is present.
    expect(src).toMatch(/from\s+['"]@\/lib\/run-reconciler['"]/);

    // 2. A call exists with brandId scoping. Whitespace-tolerant.
    expect(src).toMatch(/reconcileStaleRuns\s*\(\s*\{[^}]*brandId\s*:\s*id/);

    // 3. The call lands BEFORE the lock-check INSERT INTO active_runs.
    //    (If a refactor moves it after, the partial unique index will
    //    reject the INSERT before the reconciler can free it - which
    //    is exactly the bug PR-A is preventing.)
    const reconcileIdx = src.search(/reconcileStaleRuns\s*\(/);
    const insertIdx = src.search(/INSERT\s+INTO\s+active_runs/);
    expect(reconcileIdx).toBeGreaterThan(0);
    expect(insertIdx).toBeGreaterThan(0);
    expect(reconcileIdx).toBeLessThan(insertIdx);
  });
});
