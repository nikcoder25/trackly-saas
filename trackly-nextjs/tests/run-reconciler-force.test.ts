/**
 * Behavioral tests for the `force` + `minAgeMinutes` options on
 * `reconcileStaleRuns`, added in PR-B for the admin reap endpoint.
 *
 * Contract:
 *
 *   force=true + runId  → bypass the staleness gate; the SELECT
 *                         FOR UPDATE has NO `< NOW() - INTERVAL`
 *                         clause and ONLY filters by `id = $N`
 *
 *   force=true + brandId → ignored (force is silently dropped); the
 *                          staleness gate is still applied. We
 *                          assert this defensively here even though
 *                          the admin route also rejects this shape
 *                          server-side, because the runtime guard
 *                          in run-reconciler.ts is the last line of
 *                          defense if a future caller bypasses the
 *                          route's body validation.
 *
 *   minAgeMinutes < envFloor → silently raised to envFloor. Bulk
 *                              reaps can be MORE conservative than
 *                              the env default but never less.
 *
 *   minAgeMinutes > envFloor → honored, the SELECT uses the larger
 *                              window.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { reconcileStaleRuns, getStaleRunMinutes } from '@/lib/run-reconciler';

beforeEach(() => {
  queryFn.mockReset();
  connectFn.mockReset();
});

interface ClientStub {
  client: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
  capturedSelect: () => { sql: string; params: unknown[] } | null;
}

function makeClient(rowsForSelect: Array<Record<string, unknown>>): ClientStub {
  let capturedSelect: { sql: string; params: unknown[] } | null = null;
  const client = {
    query: vi.fn((sql: string, params?: unknown[]) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return Promise.resolve({ rows: [] });
      }
      if (/FROM active_runs[\s\S]*FOR UPDATE SKIP LOCKED/.test(sql)) {
        capturedSelect = { sql, params: params || [] };
        return Promise.resolve({ rows: rowsForSelect });
      }
      // Brand-fetch + brand UPDATE inside finalizeStaleRow.
      if (/SELECT data FROM brands WHERE id = \$1 FOR UPDATE/.test(sql)) {
        return Promise.resolve({ rows: [{ data: { runs: [] } }] });
      }
      if (/^UPDATE brands SET data/.test(sql)) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.resolve({ rows: [] });
    }),
    release: vi.fn(),
  };
  return { client, capturedSelect: () => capturedSelect };
}

function introspectionResponder() {
  return (sql: string) => {
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
    // Top-level UPDATE that flips status to 'error'.
    if (/UPDATE active_runs SET[\s\S]*WHERE id = \$1 AND status = 'running'/.test(sql)) {
      return Promise.resolve({ rows: [{ id: 'r' }], rowCount: 1 });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  };
}

describe('reconcileStaleRuns({ force: true, runId })', () => {
  it('omits the staleness gate when force+runId are both supplied', async () => {
    queryFn.mockImplementation(introspectionResponder());
    const stub = makeClient([]);
    connectFn.mockResolvedValue(stub.client);

    await reconcileStaleRuns({ runId: 'fresh_run', force: true });

    const sel = stub.capturedSelect();
    expect(sel).not.toBeNull();
    // The temporal predicate must NOT be in the WHERE clause when
    // force-by-runId is in effect.
    expect(sel!.sql).not.toMatch(/< NOW\(\) - INTERVAL/);
    expect(sel!.sql).toMatch(/id = \$\d+/);
    expect(sel!.params).toContain('fresh_run');
  });

  it('reaps a 1-minute-old row when force=true + runId', async () => {
    // The mock will hand back a freshly-started row that the env-default
    // staleness gate would normally reject. With force, the SELECT has
    // no temporal filter, so the row is returned and finalized.
    queryFn.mockImplementation(introspectionResponder());
    const stub = makeClient([{
      id: 'fresh_run',
      brand_id: 'brand_X',
      received: 0,
      found_count: 0,
      error_count: 0,
      total_expected: 50,
      results: [],
      started_at: new Date(Date.now() - 60_000).toISOString(),
      last_progress_at: new Date(Date.now() - 60_000).toISOString(),
      queries: ['q1'],
      platforms: ['ChatGPT'],
    }]);
    connectFn.mockResolvedValue(stub.client);

    const out = await reconcileStaleRuns({ runId: 'fresh_run', force: true });
    expect(out.count).toBe(1);
    expect(out.runIds).toEqual(['fresh_run']);
    expect(out.brandIds).toEqual(['brand_X']);
  });
});

describe('reconcileStaleRuns - force is dropped without runId', () => {
  it('keeps the staleness gate even when force=true is set with brandId', async () => {
    queryFn.mockImplementation(introspectionResponder());
    const stub = makeClient([]);
    connectFn.mockResolvedValue(stub.client);

    // Bulk + force is the dangerous shape - would be a fleet-killer if
    // honored. The runtime guard inside run-reconciler must drop force
    // here. (The admin route also rejects this shape, but we test the
    // library layer separately.)
    await reconcileStaleRuns({ brandId: 'brand_X', force: true });

    const sel = stub.capturedSelect();
    expect(sel).not.toBeNull();
    // Temporal predicate must be present.
    expect(sel!.sql).toMatch(/< NOW\(\) - INTERVAL/);
    expect(sel!.sql).toMatch(/brand_id = \$\d+/);
    // No runId filter - only the brand scope. Use \b so the brand_id
    // match above doesn't false-positive this assertion (`_` is a
    // word char, so \bid doesn't match the `id` inside `brand_id`).
    expect(sel!.sql).not.toMatch(/\bid = \$\d+/);
  });

  it('keeps the staleness gate when force=true is set with no scope', async () => {
    queryFn.mockImplementation(introspectionResponder());
    const stub = makeClient([]);
    connectFn.mockResolvedValue(stub.client);

    await reconcileStaleRuns({ force: true });

    const sel = stub.capturedSelect();
    expect(sel).not.toBeNull();
    expect(sel!.sql).toMatch(/< NOW\(\) - INTERVAL/);
  });
});

describe('reconcileStaleRuns({ minAgeMinutes })', () => {
  it('uses an operator-supplied minAgeMinutes when greater than the env floor', async () => {
    queryFn.mockImplementation(introspectionResponder());
    const stub = makeClient([]);
    connectFn.mockResolvedValue(stub.client);

    const envFloor = getStaleRunMinutes();
    const requested = envFloor + 20;
    await reconcileStaleRuns({ minAgeMinutes: requested });

    const sel = stub.capturedSelect();
    expect(sel).not.toBeNull();
    expect(sel!.sql).toMatch(new RegExp(`< NOW\\(\\) - INTERVAL '${requested} minutes'`));
  });

  it("clamps minAgeMinutes UP to the env floor when caller asks for less", async () => {
    queryFn.mockImplementation(introspectionResponder());
    const stub = makeClient([]);
    connectFn.mockResolvedValue(stub.client);

    const envFloor = getStaleRunMinutes();
    // Even if caller asks for 1 minute, the actual SELECT must use envFloor.
    await reconcileStaleRuns({ minAgeMinutes: 1 });

    const sel = stub.capturedSelect();
    expect(sel).not.toBeNull();
    expect(sel!.sql).toMatch(new RegExp(`< NOW\\(\\) - INTERVAL '${envFloor} minutes'`));
  });
});
