/**
 * Tests for the watchdog-reap entry written by
 * src/lib/run-reconciler.ts::finalizeStaleRow (PR-C-1).
 *
 * Pre-PR-C-1 the reaper hardcoded `sov: 0` and omitted `platforms`
 * (Record), `durationMs`, `citations`, `competitors` entirely. The
 * Overview dashboard reads those fields directly so a partial run
 * with 15 successful mentions across 18 queries rendered as "0% SOV
 * / 0/5 Platforms Active / Run Duration N/A". This test pins the
 * fix: when received > 0 the reaper now derives every dashboard-
 * visible field from the data it already reads, and when received
 * === 0 sov stays at 0 (no zero-divide, no false positives).
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

import { reconcileStaleRuns } from '@/lib/run-reconciler';

beforeEach(() => {
  queryFn.mockReset();
  connectFn.mockReset();
});

interface CapturedWrite {
  data: Record<string, unknown> | null;
}

/**
 * Build a pool-client stub that responds to the reconciler's transactional
 * walk. Captures the JSONB the reaper writes to `brands.data` so the
 * test can assert on the run entry's exact shape.
 *
 * - The SELECT FOR UPDATE returns `staleRows` (the rows the reconciler
 *   should reap)
 * - The brand-fetch returns `existingBrandData` so we can prove the
 *   reaper appends to existing runs without clobbering them
 * - The brand UPDATE captures the post-write JSONB into `captured.data`
 */
function makeClient(opts: {
  staleRows: Array<Record<string, unknown>>;
  existingBrandData?: Record<string, unknown>;
}): { client: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }; captured: CapturedWrite } {
  const captured: CapturedWrite = { data: null };
  const client = {
    query: vi.fn((sql: string, params?: unknown[]) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return Promise.resolve({ rows: [] });
      }
      if (/FROM active_runs[\s\S]*FOR UPDATE SKIP LOCKED/.test(sql)) {
        return Promise.resolve({ rows: opts.staleRows });
      }
      if (/SELECT data FROM brands WHERE id = \$1 FOR UPDATE/.test(sql)) {
        return Promise.resolve({
          rows: [{ data: opts.existingBrandData ?? { runs: [] } }],
        });
      }
      if (/^UPDATE brands SET data/.test(sql)) {
        // Params: [JSON string, brand_id]
        try {
          captured.data = JSON.parse(params?.[0] as string);
        } catch {
          captured.data = null;
        }
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.resolve({ rows: [] });
    }),
    release: vi.fn(),
  };
  return { client, captured };
}

function topLevelResponder() {
  // Top-level pool.query (not the client) hits introspection + the
  // single-row UPDATE that flips status='running' to 'error'. Both
  // need to succeed for the reconciler to enter the brand-append phase.
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
    if (/UPDATE active_runs SET[\s\S]*WHERE id = \$1 AND status = 'running'/.test(sql)) {
      return Promise.resolve({ rows: [{ id: 'r' }], rowCount: 1 });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  };
}

describe('reaper truthful partial entry - received > 0', () => {
  it('writes sov/platforms/durationMs/citations/competitors all from allResults', async () => {
    queryFn.mockImplementation(topLevelResponder());

    // Simulated 15-of-18 partial: 18 results processed across two
    // platforms, 15 mentioned (one error, two non-mentions). Two
    // platforms configured but only one has results yet (worker died
    // before it got to Claude) - the unrun platform must still
    // appear in `platforms` with zero counts so "Platforms Active"
    // can render honestly instead of falling back to 0/5.
    const allResults: Array<Record<string, unknown>> = [];
    for (let i = 0; i < 12; i++) {
      allResults.push({
        platform: 'ChatGPT',
        query: `q${i}`,
        mentioned: i < 10,                        // 10 mentioned
        error: i === 11,                          // 1 errored
        citations: i === 0 ? ['https://example.com/a', 'https://www.foo.com/b'] : [],
        competitorMentions: i === 0 ? ['Acme Corp'] : (i === 5 ? ['Acme Corp', 'Beta Inc'] : []),
      });
    }
    for (let i = 0; i < 6; i++) {
      allResults.push({
        platform: 'Perplexity',
        query: `q${i}`,
        mentioned: i < 5,                         // 5 mentioned
        error: false,
        citations: [],
        competitorMentions: [],
      });
    }
    // 18 results, 15 mentioned, 1 errored, 17 ok. SOV by Mentions
    // formula: 15 / 17 = 88.2 → 88.

    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    const stub = makeClient({
      staleRows: [{
        id: 'run_partial',
        brand_id: 'brand_X',
        received: 18,
        found_count: 15,
        error_count: 1,
        total_expected: 36,
        results: allResults,
        started_at: fiveMinAgo,
        last_progress_at: fiveMinAgo,
        queries: ['q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11'],
        platforms: ['ChatGPT', 'Perplexity', 'Claude'],
      }],
      existingBrandData: { runs: [{ id: 'older_run', sov: 50 }] },
    });
    connectFn.mockResolvedValue(stub.client);

    const out = await reconcileStaleRuns({});
    expect(out.count).toBe(1);

    const data = stub.captured.data!;
    expect(data).toBeTruthy();
    const runs = data.runs as Array<Record<string, unknown>>;
    // Older run preserved; new partial appended.
    expect(runs).toHaveLength(2);
    const partial = runs[1];
    expect(partial.id).toBe('run_partial');
    expect(partial.watchdogReap).toBe(true);
    expect(partial.emergencySave).toBe(true);

    // (1) sov is non-zero and reflects the Mentions-page formula.
    // 15 mentioned of 17 ok = 88 (rounded from 88.235…)
    expect(partial.sov).toBe(88);

    // (2) totalQ / totalM still mirror the columns for the "X/Y"
    // mentions display.
    expect(partial.totalQ).toBe(18);
    expect(partial.totalM).toBe(15);

    // (3) platforms is a Record keyed by platform with the
    // run-worker shape, including the not-yet-run platform.
    const platforms = partial.platforms as Record<string, { queries: number; mentions: number; sov: number; errors: number }>;
    expect(Object.keys(platforms).sort()).toEqual(['ChatGPT', 'Claude', 'Perplexity']);
    expect(platforms.ChatGPT.queries).toBe(12);
    expect(platforms.ChatGPT.mentions).toBe(10);
    expect(platforms.ChatGPT.errors).toBe(1);
    // Per-platform SOV uses queries (not non-error) - same as
    // run-worker's terminal write so the dashboard renders the same
    // number whether a run completed normally or got reaped.
    expect(platforms.ChatGPT.sov).toBe(83);   // 10 / 12 = 83
    expect(platforms.Perplexity.queries).toBe(6);
    expect(platforms.Perplexity.mentions).toBe(5);
    expect(platforms.Perplexity.errors).toBe(0);
    expect(platforms.Perplexity.sov).toBe(83);
    // Not-yet-run: zero counts, distinct from "active" but visible.
    expect(platforms.Claude).toEqual({ queries: 0, mentions: 0, sov: 0, errors: 0 });

    // (4) durationMs populated from started_at to reap moment.
    expect(typeof partial.durationMs).toBe('number');
    expect(partial.durationMs as number).toBeGreaterThan(0);
    // ~5 minutes; allow generous slack for test runtime.
    expect(partial.durationMs as number).toBeLessThan(10 * 60_000);

    // (5) citations aggregated by domain, www-stripped.
    const citations = partial.citations as Record<string, number>;
    expect(citations).toEqual({ 'example.com': 1, 'foo.com': 1 });

    // (6) competitors aggregated.
    const competitors = partial.competitors as Record<string, number>;
    expect(competitors).toEqual({ 'Acme Corp': 2, 'Beta Inc': 1 });

    // (7) activePlatforms preserved as a string[] so any consumer
    // that relied on the old shape still works.
    expect(partial.activePlatforms).toEqual(['ChatGPT', 'Perplexity', 'Claude']);
  });
});

describe('reaper truthful partial entry - received === 0', () => {
  it("writes sov: 0 with no platform stats and no zero-divide when nothing was processed", async () => {
    queryFn.mockImplementation(topLevelResponder());

    // Worker died before any flushProgress write; results array is
    // empty, received/foundCount are 0. The reaper still appends an
    // entry (so "Last Run" advances and the dashboard isn't stuck on
    // an in-progress spinner) but the entry must not pretend there
    // were mentions.
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    const stub = makeClient({
      staleRows: [{
        id: 'run_zero',
        brand_id: 'brand_Y',
        received: 0,
        found_count: 0,
        error_count: 0,
        total_expected: 36,
        results: [],
        started_at: fiveMinAgo,
        last_progress_at: fiveMinAgo,
        queries: ['q0', 'q1', 'q2'],
        platforms: ['ChatGPT', 'Perplexity'],
      }],
      existingBrandData: { runs: [] },
    });
    connectFn.mockResolvedValue(stub.client);

    const out = await reconcileStaleRuns({});
    expect(out.count).toBe(1);

    const data = stub.captured.data!;
    const runs = data.runs as Array<Record<string, unknown>>;
    expect(runs).toHaveLength(1);
    const partial = runs[0];

    expect(partial.sov).toBe(0);
    expect(partial.totalQ).toBe(0);
    expect(partial.totalM).toBe(0);

    // platforms still populated with all configured platforms but
    // each entry is the zero record - distinguishable from "we have
    // mentions but the sov field is broken".
    const platforms = partial.platforms as Record<string, { queries: number; mentions: number; sov: number; errors: number }>;
    expect(Object.keys(platforms).sort()).toEqual(['ChatGPT', 'Perplexity']);
    for (const stat of Object.values(platforms)) {
      expect(stat).toEqual({ queries: 0, mentions: 0, sov: 0, errors: 0 });
    }

    // No citations or competitors when there were no results.
    expect(partial.citations).toEqual({});
    expect(partial.competitors).toEqual({});

    // durationMs still populated - even a zero-progress run was alive
    // for a measurable amount of time.
    expect(typeof partial.durationMs).toBe('number');
  });
});
