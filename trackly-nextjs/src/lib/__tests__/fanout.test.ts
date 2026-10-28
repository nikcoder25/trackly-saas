/**
 * Tests for src/lib/fanout.ts.
 *
 * persistFanout runs inside the run's persistence loop, so its two hard
 * requirements are that it never throws (a bookkeeping insert must not
 * fail a run that measured fine) and that it never writes junk rows (the
 * fan-out table is the entire evidence base for the Fan-out page).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const queryMock = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const errorMock = vi.fn();

vi.mock('../db', () => ({ pool: { query: queryMock } }));
vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: errorMock },
}));
vi.mock('../helpers', () => ({ uid: () => 'test-id' }));

const { normalizeFanoutQuery, persistFanout, __resetFanoutSchemaCache } =
  await import('../fanout');

beforeEach(() => {
  queryMock.mockClear();
  errorMock.mockClear();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  __resetFanoutSchemaCache();
});

function insertCall() {
  return queryMock.mock.calls.find(c => String(c[0]).includes('INSERT INTO prompt_fanout'));
}

describe('normalizeFanoutQuery', () => {
  it('trims and collapses internal whitespace', () => {
    expect(normalizeFanoutQuery('  hvac   auburn  ')).toBe('hvac auburn');
  });

  it('rejects entries too short to be a query', () => {
    expect(normalizeFanoutQuery('a')).toBeNull();
    expect(normalizeFanoutQuery('')).toBeNull();
  });

  it('truncates an over-long query rather than dropping it', () => {
    expect(normalizeFanoutQuery('x'.repeat(400))!.length).toBe(300);
  });
});

describe('persistFanout', () => {
  const row = (queries: string[]) => ({
    promptRunId: 'run-1', brandId: 'b1', prompt: 'best hvac', platform: 'Gemini', queries,
  });

  it('writes nothing when there are no rows', async () => {
    await persistFanout([]);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('writes nothing when every query is unusable', async () => {
    await persistFanout([row(['', ' ', 'a'])]);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('inserts one row per distinct sub-query with 1-based positions', async () => {
    await persistFanout([row(['hvac auburn', 'ac repair auburn'])]);
    const call = insertCall();
    expect(call).toBeDefined();
    const params = call![1] as unknown[];
    // 7 params per row × 2 rows
    expect(params).toHaveLength(14);
    expect(params[5]).toBe('hvac auburn');
    expect(params[6]).toBe(1);
    expect(params[12]).toBe('ac repair auburn');
    expect(params[13]).toBe(2);
  });

  it('deduplicates case-insensitively within one result', async () => {
    await persistFanout([row(['HVAC Auburn', 'hvac auburn'])]);
    expect((insertCall()![1] as unknown[])).toHaveLength(7);
  });

  it('caps the number of sub-queries stored per result', async () => {
    const many = Array.from({ length: 40 }, (_, i) => `query number ${i}`);
    await persistFanout([row(many)]);
    // 20 max × 7 params
    expect((insertCall()![1] as unknown[])).toHaveLength(140);
  });

  it('ignores duplicate inserts so a replayed batch is harmless', async () => {
    await persistFanout([row(['hvac auburn'])]);
    expect(insertCall()![0]).toContain('ON CONFLICT (prompt_run_id, fanout_query) DO NOTHING');
  });

  it('swallows and logs a database failure instead of failing the run', async () => {
    queryMock.mockRejectedValue(new Error('db down'));
    await expect(persistFanout([row(['hvac auburn'])])).resolves.toBeUndefined();
    expect(errorMock).toHaveBeenCalledWith('fanout.persist_failed', expect.anything());
  });
});
