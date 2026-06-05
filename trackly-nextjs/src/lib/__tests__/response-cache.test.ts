import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the db pool so we never touch a real Postgres. Each test resets
// the implementation; helper below installs row sequences for
// SELECT/INSERT.
const queryMock = vi.fn();
vi.mock('../db', () => ({
  pool: { query: (...args: unknown[]) => queryMock(...args) },
}));
// Logger writes warnings on cache failures; silence them for clean test output.
vi.mock('../logger', () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

import {
  buildCacheKey,
  getCached,
  setCached,
  getCacheTtl,
  isSearchEnabled,
  __cacheStats,
} from '../response-cache';

beforeEach(() => {
  queryMock.mockReset();
  __cacheStats.hits = 0;
  __cacheStats.misses = 0;
  __cacheStats.writes = 0;
  __cacheStats.errors = 0;
  delete process.env.RESPONSE_CACHE_DISABLED;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('buildCacheKey', () => {
  it('produces a deterministic SHA-256 hex string', () => {
    const k1 = buildCacheKey({ prompt: 'best plumber in Boston', platform: 'ChatGPT', model: 'gpt-4o', searchEnabled: false });
    const k2 = buildCacheKey({ prompt: 'best plumber in Boston', platform: 'ChatGPT', model: 'gpt-4o', searchEnabled: false });
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is case-insensitive and whitespace-insensitive after normalize', () => {
    const a = buildCacheKey({ prompt: 'Best  Plumber  in  Boston', platform: 'ChatGPT', model: 'gpt-4o', searchEnabled: false });
    const b = buildCacheKey({ prompt: '  best plumber in boston  ', platform: 'ChatGPT', model: 'gpt-4o', searchEnabled: false });
    const c = buildCacheKey({ prompt: 'BEST PLUMBER IN BOSTON', platform: 'ChatGPT', model: 'gpt-4o', searchEnabled: false });
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('strips trailing punctuation so "best plumber", "best plumber.", "best plumber?" collapse', () => {
    const base = buildCacheKey({ prompt: 'best plumber', platform: 'ChatGPT', model: 'gpt-4o', searchEnabled: false });
    const dot = buildCacheKey({ prompt: 'best plumber.', platform: 'ChatGPT', model: 'gpt-4o', searchEnabled: false });
    const q = buildCacheKey({ prompt: 'best plumber?', platform: 'ChatGPT', model: 'gpt-4o', searchEnabled: false });
    const bang = buildCacheKey({ prompt: 'best plumber!', platform: 'ChatGPT', model: 'gpt-4o', searchEnabled: false });
    const stack = buildCacheKey({ prompt: 'best plumber!?!', platform: 'ChatGPT', model: 'gpt-4o', searchEnabled: false });
    const spaced = buildCacheKey({ prompt: 'best plumber ?', platform: 'ChatGPT', model: 'gpt-4o', searchEnabled: false });
    expect(dot).toBe(base);
    expect(q).toBe(base);
    expect(bang).toBe(base);
    expect(stack).toBe(base);
    expect(spaced).toBe(base);
  });

  it('does not strip internal punctuation', () => {
    const a = buildCacheKey({ prompt: 'best plumber, electrician', platform: 'ChatGPT', model: 'm', searchEnabled: false });
    const b = buildCacheKey({ prompt: 'best plumber electrician', platform: 'ChatGPT', model: 'm', searchEnabled: false });
    expect(a).not.toBe(b);
  });

  it('changes when the model changes', () => {
    const a = buildCacheKey({ prompt: 'foo', platform: 'ChatGPT', model: 'gpt-4o', searchEnabled: false });
    const b = buildCacheKey({ prompt: 'foo', platform: 'ChatGPT', model: 'gpt-4o-search-preview', searchEnabled: false });
    expect(a).not.toBe(b);
  });

  it('changes when the searchEnabled flag changes', () => {
    const a = buildCacheKey({ prompt: 'foo', platform: 'ChatGPT', model: 'gpt-4o', searchEnabled: false });
    const b = buildCacheKey({ prompt: 'foo', platform: 'ChatGPT', model: 'gpt-4o', searchEnabled: true });
    expect(a).not.toBe(b);
  });

  it('changes when the platform changes', () => {
    const a = buildCacheKey({ prompt: 'foo', platform: 'ChatGPT', model: 'm', searchEnabled: false });
    const b = buildCacheKey({ prompt: 'foo', platform: 'Claude', model: 'm', searchEnabled: false });
    expect(a).not.toBe(b);
  });
});

describe('getCacheTtl', () => {
  it('returns 14d for non-search default and 7d for search-enabled', () => {
    // June 2026 cost-reduction tuning: with WEB_SEARCH_DEFAULT_OFF in
    // prod and tracking reduced to daily cadence, evergreen non-search
    // answers don't drift inside 14d and a longer TTL is the highest
    // remaining lever on the OpenAI bill. Search responses (the
    // expensive web_search-tool path) held to 7d — long enough to make
    // a real dent in spend, short enough to retain freshness sanity
    // for queries explicitly asked to consult the live web.
    expect(getCacheTtl(true)).toBe(7 * 24 * 60 * 60);
    expect(getCacheTtl(false)).toBe(14 * 24 * 60 * 60);
  });

  // The env-var aliasing (RESPONSE_CACHE_TTL_NO_SEARCH_S as primary,
  // RESPONSE_CACHE_TTL_DEFAULT_S as legacy fallback) is exercised by the
  // dedicated tests/response-cache-ttl-env.test.ts file — the value is
  // captured at module load, so a single import suite cannot toggle it.
});

describe('isSearchEnabled', () => {
  it('treats Perplexity as always search', () => {
    expect(isSearchEnabled('Perplexity', 'sonar-pro')).toBe(true);
  });
  it('treats ChatGPT search-preview as search', () => {
    expect(isSearchEnabled('ChatGPT', 'gpt-4o-search-preview')).toBe(true);
    expect(isSearchEnabled('ChatGPT', 'gpt-4o')).toBe(false);
  });
  it('treats other platforms as non-search', () => {
    expect(isSearchEnabled('Claude', 'claude-3-5-sonnet')).toBe(false);
    expect(isSearchEnabled('Gemini', 'gemini-2.5-pro')).toBe(false);
    expect(isSearchEnabled('Grok', 'grok-2')).toBe(false);
  });
});

describe('getCached', () => {
  it('returns null on miss and increments misses counter', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const result = await getCached('nonexistent');
    expect(result).toBeNull();
    expect(__cacheStats.misses).toBe(1);
    expect(__cacheStats.hits).toBe(0);
  });

  it('only returns rows where expires_at > NOW (the SQL filter enforces this)', async () => {
    // Expired row would be filtered by the WHERE clause; the mock returns
    // empty to simulate that — verify the SQL contains the filter.
    queryMock.mockResolvedValueOnce({ rows: [] });
    await getCached('expired');
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toMatch(/expires_at\s*>\s*NOW\(\)/);
  });

  it('returns the row and increments hits on cache hit', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        response: { text: 'cached', model: 'gpt-4o', tokensIn: 1, tokensOut: 1, citations: [] },
        model: 'gpt-4o',
        created_at: new Date('2026-05-01T00:00:00Z'),
      }],
    });
    const result = await getCached('hit-key');
    expect(result?.response).toMatchObject({ text: 'cached', model: 'gpt-4o' });
    expect(result?.model).toBe('gpt-4o');
    expect(__cacheStats.hits).toBe(1);
  });

  it('returns null when JSON parsing fails on a stringified payload', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ response: '{ not json', model: 'gpt-4o', created_at: new Date() }],
    });
    const result = await getCached('bad-json');
    expect(result).toBeNull();
  });

  it('returns null and bumps errors counter when DB throws', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));
    const result = await getCached('any');
    expect(result).toBeNull();
    expect(__cacheStats.errors).toBe(1);
  });

  it('is a no-op when RESPONSE_CACHE_DISABLED=true', async () => {
    process.env.RESPONSE_CACHE_DISABLED = 'true';
    const result = await getCached('any');
    expect(result).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('setCached', () => {
  it('issues an INSERT ... ON CONFLICT (cache_key) DO UPDATE', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1 });
    await setCached('k', { text: 'v' }, { query: 'q', platform: 'ChatGPT', model: 'gpt-4o', ttlSeconds: 3600 });
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO response_cache/);
    expect(sql).toMatch(/ON CONFLICT \(cache_key\) DO UPDATE/);
    // Param order matches the prod-schema INSERT (cache_key, platform,
    // model, query, brand_id, city, response, is_search, expires_at).
    // Per-position assertions live in tests/response-cache.test.ts; here
    // we only spot-check that the call is well-formed.
    expect(params[0]).toBe('k');
    expect(params[1]).toBe('ChatGPT');
    expect(params[2]).toBe('gpt-4o');
    expect(params[3]).toBe('q');
    expect(JSON.parse(params[6])).toEqual({ text: 'v' });
    expect(__cacheStats.writes).toBe(1);
  });

  it('swallows DB errors so the caller is never broken', async () => {
    queryMock.mockRejectedValueOnce(new Error('unique violation under concurrent insert'));
    await expect(
      setCached('k', { text: 'v' }, { query: 'q', platform: 'ChatGPT', model: 'gpt-4o', ttlSeconds: 3600 })
    ).resolves.toBeUndefined();
    expect(__cacheStats.errors).toBe(1);
    expect(__cacheStats.writes).toBe(0);
  });

  it('is a no-op when RESPONSE_CACHE_DISABLED=true', async () => {
    process.env.RESPONSE_CACHE_DISABLED = 'true';
    await setCached('k', { text: 'v' }, { query: 'q', platform: 'ChatGPT', model: 'gpt-4o', ttlSeconds: 3600 });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('handles concurrent upsert via ON CONFLICT (last write wins)', async () => {
    // Two concurrent setCached calls with the same key should both
    // succeed because the SQL uses ON CONFLICT DO UPDATE — verify both
    // resolve cleanly when the underlying query resolves.
    queryMock.mockResolvedValue({ rowCount: 1 });
    await Promise.all([
      setCached('same', { v: 1 }, { query: 'q1', platform: 'ChatGPT', model: 'm', ttlSeconds: 60 }),
      setCached('same', { v: 2 }, { query: 'q2', platform: 'ChatGPT', model: 'm', ttlSeconds: 60 }),
    ]);
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(__cacheStats.writes).toBe(2);
  });
});

// ── Cross-tenant dedup invariant (regression coverage) ──────────
//
// Locks in the design property that two different tenants asking the
// exact same question for the same city share a cache row. Combined
// with the schema-shape assertion, this stops both the May 6-8 class
// of bug (silent INSERT failure dropping every write) and any future
// drift that accidentally re-introduces a per-tenant field into the
// SHA-256 input.
describe('cache_key dedup invariant', () => {
  // Regression coverage for the June 2026 cost review: pin that the
  // SHA-256 input contains ONLY (prompt, platform, model, searchEnabled,
  // city). Any future drift that hashes brand_id / user_id / tenant_id
  // into the key would silently break cross-tenant dedup — caught here.
  it('cache_key SHA-256 material is exactly prompt|platform|model|isSearch|city', () => {
    const material = 'best plumber in boston|ChatGPT|gpt-4o|0|';
    const expected = require('crypto')
      .createHash('sha256').update(material).digest('hex');
    const actual = buildCacheKey({
      prompt: 'best plumber in Boston', platform: 'ChatGPT',
      model: 'gpt-4o', searchEnabled: false,
    });
    expect(actual).toBe(expected);
  });

  it('two different brand_ids with identical (platform, model, query, city, is_search) produce the same cache_key', () => {
    // Tenant A
    const keyA = buildCacheKey({
      prompt: 'best plumber in Boston',
      platform: 'ChatGPT',
      model: 'gpt-4o-search-preview',
      searchEnabled: true,
      city: 'Boston',
    });
    // Tenant B — different brand context entirely; key inputs identical.
    // Note brand_id is intentionally absent from CacheKeyParams; this
    // test pins that absence.
    const keyB = buildCacheKey({
      prompt: 'best plumber in Boston',
      platform: 'ChatGPT',
      model: 'gpt-4o-search-preview',
      searchEnabled: true,
      city: 'Boston',
    });
    expect(keyA).toBe(keyB);
  });

  it('different cities produce different cache_keys (no false collisions)', () => {
    const boston = buildCacheKey({
      prompt: 'best plumber', platform: 'ChatGPT', model: 'gpt-4o',
      searchEnabled: true, city: 'Boston',
    });
    const nyc = buildCacheKey({
      prompt: 'best plumber', platform: 'ChatGPT', model: 'gpt-4o',
      searchEnabled: true, city: 'NYC',
    });
    expect(boston).not.toBe(nyc);
  });

  it('city is normalized for case/whitespace (so "Boston" and " boston " collapse)', () => {
    const a = buildCacheKey({
      prompt: 'p', platform: 'ChatGPT', model: 'm',
      searchEnabled: false, city: 'Boston',
    });
    const b = buildCacheKey({
      prompt: 'p', platform: 'ChatGPT', model: 'm',
      searchEnabled: false, city: '  boston  ',
    });
    expect(a).toBe(b);
  });

  it('null/undefined/empty city all hash the same (legacy callers unaffected)', () => {
    const k1 = buildCacheKey({ prompt: 'p', platform: 'ChatGPT', model: 'm', searchEnabled: false });
    const k2 = buildCacheKey({ prompt: 'p', platform: 'ChatGPT', model: 'm', searchEnabled: false, city: null });
    const k3 = buildCacheKey({ prompt: 'p', platform: 'ChatGPT', model: 'm', searchEnabled: false, city: '' });
    expect(k1).toBe(k2);
    expect(k2).toBe(k3);
  });
});

describe('setCached writes every NOT NULL prod-schema column', () => {
  it('populates cache_key, platform, model, query, response, is_search, expires_at with non-null values', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1 });
    await setCached(
      'cache-key-abc',
      { text: 'cached', model: 'gpt-4o' },
      {
        query: 'best plumber in Boston',
        platform: 'ChatGPT',
        model: 'gpt-4o-search-preview',
        ttlSeconds: 24 * 60 * 60,
        brandId: 'brand_A',
        city: 'Boston',
        isSearch: true,
      },
    );
    expect(queryMock).toHaveBeenCalledTimes(1);
    const params = queryMock.mock.calls[0][1] as unknown[];
    // Param positions match the INSERT column list:
    // (cache_key, platform, model, query, brand_id, city, response, is_search, expires_at)
    expect(params).toHaveLength(9);
    // Every NOT NULL prod column must be non-null/non-empty:
    expect(params[0]).toBeTruthy();                   // cache_key
    expect(params[1]).toBeTruthy();                   // platform
    expect(params[2]).toBeTruthy();                   // model
    expect(params[3]).toBeTruthy();                   // query
    expect(params[6]).toBeTruthy();                   // response (jsonb stringified)
    expect(typeof params[7]).toBe('boolean');         // is_search
    expect(params[8]).toBeTruthy();                   // expires_at interval seconds
    expect(__cacheStats.writes).toBe(1);
    expect(__cacheStats.errors).toBe(0);
  });

  it('serves Tenant B from the row Tenant A wrote (post-insert SELECT returns the cached payload)', async () => {
    const key = buildCacheKey({
      prompt: 'best plumber in Boston',
      platform: 'ChatGPT',
      model: 'gpt-4o-search-preview',
      searchEnabled: true,
      city: 'Boston',
    });
    // 1) Tenant A writes.
    queryMock.mockResolvedValueOnce({ rowCount: 1 });
    await setCached(key, { text: 'shared payload', model: 'gpt-4o-search-preview' }, {
      query: 'best plumber in Boston',
      platform: 'ChatGPT',
      model: 'gpt-4o-search-preview',
      ttlSeconds: 24 * 60 * 60,
      brandId: 'brand_A',
      city: 'Boston',
      isSearch: true,
    });
    // 2) Tenant B reads with the same key — mock the row coming back.
    queryMock.mockResolvedValueOnce({
      rows: [{
        response: { text: 'shared payload', model: 'gpt-4o-search-preview' },
        model: 'gpt-4o-search-preview',
        created_at: new Date('2026-05-11T00:00:00Z'),
      }],
    });
    const hit = await getCached(key);
    expect(hit).not.toBeNull();
    expect(hit?.response).toMatchObject({ text: 'shared payload' });
    expect(__cacheStats.writes).toBe(1);
    expect(__cacheStats.hits).toBe(1);
  });
});
