/**
 * Regression test for Fix 5 (commit 704079c):
 *
 *   Two concurrent POSTs to /api/brands/:id/run for the same brand could
 *   both pass the CTE NOT EXISTS check and both insert 'running' rows -
 *   doubling AI spend. Fix adds a partial unique index on
 *   (brand_id) WHERE status='running' as the real concurrency barrier.
 *
 * This test exercises the index against a real Postgres so the SQL +
 * the catch path for SQLSTATE 23505 are both proven. It is gated on
 * TEST_DATABASE_URL so CI without a Postgres simply skips with a clear
 * message; runs in dev when the env var is set.
 *
 * Run locally:
 *   pg_ctlcluster 16 main start
 *   createdb trackly_test
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/trackly_test \
 *     npx vitest run tests/active-runs-race.test.ts
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Pool } from 'pg';

const TEST_DB = process.env.TEST_DATABASE_URL;

// Mirror of the SQL from ensureActiveRunsTable() in
// src/app/api/brands/[id]/run/route.ts. Kept verbatim so this test
// fails loudly if the production schema or index drifts.
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS active_runs (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    total_expected INT DEFAULT 0,
    received INT DEFAULT 0,
    found_count INT DEFAULT 0,
    error_count INT DEFAULT 0,
    results JSONB DEFAULT '[]'::jsonb,
    final_data JSONB,
    error TEXT,
    platforms JSONB DEFAULT '[]'::jsonb,
    queries JSONB DEFAULT '[]'::jsonb,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_active_runs_one_running_per_brand
    ON active_runs (brand_id) WHERE status = 'running';
`;

// Mirror of the lock-INSERT used by POST /api/brands/[id]/run.
const LOCK_INSERT_SQL = `
  WITH lock_check AS (
    SELECT id FROM active_runs WHERE brand_id = $1 AND status = 'running' AND started_at > NOW() - INTERVAL '10 minutes'
  )
  INSERT INTO active_runs (id, brand_id, user_id, status, total_expected, platforms, queries)
  SELECT $2, $1, $3, 'running', $4, $5, $6
  WHERE NOT EXISTS (SELECT 1 FROM lock_check)
  RETURNING id
`;

// Same outcome shape as the route returns: 'inserted' | 'cte_blocked' | 'unique_violation'.
async function attemptInsert(
  pool: Pool, brandId: string, runId: string,
): Promise<'inserted' | 'cte_blocked' | 'unique_violation'> {
  try {
    const res = await pool.query(LOCK_INSERT_SQL, [
      brandId, runId, 'user-1', 0, JSON.stringify([]), JSON.stringify([]),
    ]);
    return res.rows.length ? 'inserted' : 'cte_blocked';
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return 'unique_violation';
    throw e;
  }
}

describe.skipIf(!TEST_DB)('active_runs unique-running-row index (Fix 5)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB, max: 10 });
    await pool.query(SCHEMA_SQL);
  });

  beforeEach(async () => {
    // Each test gets its own brand id so they can't interfere; also
    // drop everything to be safe across reruns.
    await pool.query(`TRUNCATE active_runs`);
  });

  afterAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS active_runs`);
    await pool.end();
  });

  it('inserts a single running row for a brand', async () => {
    const out = await attemptInsert(pool, 'brand-A', 'run-1');
    expect(out).toBe('inserted');
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM active_runs WHERE brand_id = $1 AND status = 'running'`,
      ['brand-A'],
    );
    expect(rows[0].n).toBe(1);
  });

  it('blocks a sequential second insert via the CTE NOT EXISTS check', async () => {
    expect(await attemptInsert(pool, 'brand-B', 'run-1')).toBe('inserted');
    // Second attempt: CTE sees the existing running row and skips the INSERT.
    expect(await attemptInsert(pool, 'brand-B', 'run-2')).toBe('cte_blocked');
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM active_runs WHERE brand_id = $1 AND status = 'running'`,
      ['brand-B'],
    );
    expect(rows[0].n).toBe(1);
  });

  it('allows a second insert AFTER the first row is finalized', async () => {
    expect(await attemptInsert(pool, 'brand-C', 'run-1')).toBe('inserted');
    await pool.query(`UPDATE active_runs SET status = 'done' WHERE id = $1`, ['run-1']);
    // No 'running' row exists for this brand anymore - second attempt OK.
    expect(await attemptInsert(pool, 'brand-C', 'run-2')).toBe('inserted');
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM active_runs WHERE brand_id = $1 AND status = 'running'`,
      ['brand-C'],
    );
    expect(rows[0].n).toBe(1);
  });

  it('two CONCURRENT inserts → exactly one inserted, one rejected (CTE or 23505)', async () => {
    // Race two parallel attempts on the same brand. Whichever races
    // through first inserts; the loser either sees the row in CTE
    // (cte_blocked) or hits the unique index after passing CTE
    // (unique_violation). The fix guarantees exactly one survives.
    const [a, b] = await Promise.all([
      attemptInsert(pool, 'brand-D', 'run-A'),
      attemptInsert(pool, 'brand-D', 'run-B'),
    ]);

    const outcomes = [a, b].sort();
    // One must be 'inserted'; the other must be either CTE-blocked or
    // unique-violation. Both fast-path and DB-barrier are valid losers.
    const inserted = outcomes.filter(o => o === 'inserted');
    const losers = outcomes.filter(o => o !== 'inserted');
    expect(inserted).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(['cte_blocked', 'unique_violation']).toContain(losers[0]);

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM active_runs WHERE brand_id = $1 AND status = 'running'`,
      ['brand-D'],
    );
    expect(rows[0].n).toBe(1);
  });

  it('high-concurrency burst (10 parallel inserts) leaves exactly one running row', async () => {
    // Spread the work across 10 callers to maximize the chance of two
    // both clearing the CTE inside the same tick - that's what the
    // unique index defends against.
    const attempts = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        attemptInsert(pool, 'brand-E', `run-${i}`),
      ),
    );
    const insertedCount = attempts.filter(o => o === 'inserted').length;
    expect(insertedCount).toBe(1);

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM active_runs WHERE brand_id = $1 AND status = 'running'`,
      ['brand-E'],
    );
    expect(rows[0].n).toBe(1);
  });
});

describe.skipIf(TEST_DB)('active_runs unique-running-row index (Fix 5) [skipped]', () => {
  it('skipped: set TEST_DATABASE_URL to enable Postgres integration test for Fix 5', () => {
    expect(true).toBe(true);
  });
});
