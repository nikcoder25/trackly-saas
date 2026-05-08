import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Response-cache unit tests for the prod schema-mismatch hotfix.
 *
 * Production's `response_cache` table has 10 columns; pre-hotfix
 * `setCached` only INSERTed 5, leaving the NOT NULL `query` column
 * unsupplied and failing 100% of writes (`null value in column "query"
 * of relation "response_cache" violates not-null constraint`). These
 * tests pin the wire shape of the new INSERT so the regression cannot
 * silently recur, and verify the read path is unchanged.
 *
 * The DB pool is mocked so we can assert exact SQL/params without a
 * real Postgres. The logger is mocked because setCached writes a warn
 * line on failure that we don't want noising the test output.
 */
type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
const queryMock = vi.fn<Parameters<QueryFn>, ReturnType<QueryFn>>(async () => ({ rows: [] }));

vi.mock('../src/lib/db', () => ({
  pool: { query: (...args: Parameters<QueryFn>) => queryMock(...args) },
}));
vi.mock('../src/lib/logger', () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

import { getCached, setCached, __cacheStats } from '../src/lib/response-cache';

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockImplementation(async () => ({ rows: [] }));
  __cacheStats.hits = 0;
  __cacheStats.misses = 0;
  __cacheStats.writes = 0;
  __cacheStats.errors = 0;
  vi.unstubAllEnvs();
});

afterEach(() => { vi.clearAllMocks(); });

describe('setCached INSERT (prod schema)', () => {
  it('(a) issues a single pool.query INSERT containing all 9 columns in order', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
    await setCached('k', { text: 'v' }, {
      query: 'best plumber in Boston',
      platform: 'ChatGPT',
      model: 'gpt-4o',
      ttlSeconds: 3600,
      brandId: 'brand_123',
      city: 'Boston',
      isSearch: false,
    });

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql] = queryMock.mock.calls[0];
    // The INSERT must reference every column the prod table requires;
    // missing `query` is exactly the bug this hotfix repairs. Strip
    // whitespace so multi-line formatting in the source doesn't matter.
    const compact = sql.replace(/\s+/g, ' ');
    expect(compact).toMatch(
      /INSERT INTO response_cache \(cache_key, platform, model, query, brand_id, city, response, is_search, expires_at\)/
    );
    expect(compact).toMatch(/ON CONFLICT \(cache_key\) DO UPDATE/);
    // Belt-and-suspenders: each column name appears in the SET clause too,
    // so future drift can't silently drop a re-set on conflict.
    for (const col of ['response', 'platform', 'model', 'query', 'brand_id', 'city', 'is_search', 'expires_at']) {
      expect(compact).toContain(`${col} = EXCLUDED.${col}`);
    }
  });

  it('(b) passes a 9-element params array with the supplied values in the correct positions', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
    await setCached('cache-key-abc', { text: 'cached', model: 'gpt-4o' }, {
      query: 'best plumber in Boston',
      platform: 'ChatGPT',
      model: 'gpt-4o',
      ttlSeconds: 3600,
      brandId: 'brand_123',
      city: 'Boston',
      isSearch: true,
    });

    const params = queryMock.mock.calls[0][1] as unknown[];
    expect(params).toHaveLength(9);
    // Positions match the column list in (a): cache_key, platform, model,
    // query, brand_id, city, response, is_search, expires_at.
    expect(params[0]).toBe('cache-key-abc');
    expect(params[1]).toBe('ChatGPT');
    expect(params[2]).toBe('gpt-4o');
    expect(params[3]).toBe('best plumber in Boston');
    expect(params[4]).toBe('brand_123');
    expect(params[5]).toBe('Boston');
    expect(JSON.parse(params[6] as string)).toEqual({ text: 'cached', model: 'gpt-4o' });
    expect(params[7]).toBe(true);
    expect(params[8]).toBe('3600');
  });

  it('(b.2) defaults brandId/city to null and isSearch to false when omitted', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
    await setCached('k', { text: 'v' }, {
      query: 'q',
      platform: 'Claude',
      model: 'claude-3-5-sonnet',
      ttlSeconds: 86400,
    });
    const params = queryMock.mock.calls[0][1] as unknown[];
    expect(params[3]).toBe('q');
    expect(params[4]).toBeNull();
    expect(params[5]).toBeNull();
    expect(params[7]).toBe(false);
  });

  it('(c) swallows pool.query errors, leaves writes counter alone, increments errors', async () => {
    queryMock.mockRejectedValueOnce(
      new Error('null value in column "query" of relation "response_cache" violates not-null constraint')
    );
    await expect(
      setCached('k', { text: 'v' }, {
        query: 'q', platform: 'ChatGPT', model: 'gpt-4o', ttlSeconds: 3600,
      })
    ).resolves.toBeUndefined();
    expect(__cacheStats.errors).toBe(1);
    expect(__cacheStats.writes).toBe(0);
  });
});

describe('getCached SELECT (read path unchanged)', () => {
  it('(d) selects only response, model, created_at — no debug/context columns', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await getCached('any-key');
    const [sql] = queryMock.mock.calls[0];
    const compact = sql.replace(/\s+/g, ' ');
    // Read path stays tenant-agnostic: query/brand_id/city/is_search must
    // NOT leak into the SELECT projection (would re-introduce per-tenant
    // bias on cache hits and undo the cross-tenant dedup design).
    expect(compact).toMatch(/SELECT response, model, created_at FROM response_cache/);
    for (const col of ['query', 'brand_id', 'city', 'is_search']) {
      expect(compact).not.toContain(col);
    }
    // expires_at is fine in the WHERE filter; just make sure it's not
    // in the projection either.
    expect(compact).not.toMatch(/SELECT[^F]*expires_at[^F]*FROM response_cache/);
  });
});

describe('RESPONSE_CACHE_DISABLED kill switch', () => {
  it('(e) setCached is a no-op when RESPONSE_CACHE_DISABLED=true', async () => {
    vi.stubEnv('RESPONSE_CACHE_DISABLED', 'true');
    await setCached('k', { text: 'v' }, {
      query: 'q', platform: 'ChatGPT', model: 'gpt-4o', ttlSeconds: 3600,
    });
    expect(queryMock).not.toHaveBeenCalled();
    expect(__cacheStats.writes).toBe(0);
    expect(__cacheStats.errors).toBe(0);
  });
});
