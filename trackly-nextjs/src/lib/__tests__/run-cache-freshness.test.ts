/**
 * Tracking runs must never replay a prior run's answer.
 *
 * Production bug: every scan of a brand reported the identical score and
 * many finished in ~0.1s because withCacheAndRetry served rows from the
 * 14-day response_cache. The run route and the BullMQ worker now pass a
 * short maxAgeSeconds so the cache only dedupes within a run (or a
 * double-click), and the long TTL is left to the public tools.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('../logger', () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));
vi.mock('../db', () => ({ pool: { query: vi.fn().mockResolvedValue({ rows: [] }) } }));
vi.mock('../redis-platform-state', () => ({
  acquireSlot: vi.fn(),
  recordRateLimit: vi.fn(),
  isRateLimited: vi.fn().mockResolvedValue(false),
  coalesceCall: vi.fn(),
  distributedLimiterEnabled: vi.fn().mockReturnValue(false),
}));
vi.mock('../metrics', () => ({
  recordAiCall: vi.fn(),
  classifyOutcome: vi.fn().mockReturnValue('success'),
}));
vi.mock('../cost-tracker', () => ({
  enforceCostCap: vi.fn().mockResolvedValue(undefined),
  enforcePlatformDailyCap: vi.fn().mockResolvedValue(undefined),
  estimateAnthropicCostUsd: vi.fn().mockReturnValue(null),
  recordCostEvent: vi.fn().mockResolvedValue(undefined),
  recordCall: vi.fn().mockResolvedValue(undefined),
  CHATGPT_WEB_SEARCH_CALL_USD: 0.030,
  estimateCostUsd: vi.fn().mockReturnValue(0),
  CostCapExceededError: class CostCapExceededError extends Error {},
}));
vi.mock('../fairness-scheduler', () => ({
  acquirePlatformSlotFair: vi.fn().mockResolvedValue(() => {}),
}));

const getCachedMock = vi.fn();
const setCachedMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../response-cache', () => ({
  buildCacheKey: vi.fn().mockReturnValue('cache-key'),
  getCached: (...args: unknown[]) => getCachedMock(...args),
  setCached: (...args: unknown[]) => setCachedMock(...args),
  getCacheTtl: vi.fn().mockReturnValue(14 * 24 * 60 * 60),
  __cacheStats: { hits: 0, misses: 0, writes: 0, errors: 0 },
}));

import { withCacheAndRetry, extractPerplexityCitations } from '../ai-platforms';

const PARAMS = { prompt: 'what is Easypump Concrete Ltd', platform: 'Grok', model: 'grok-3-mini', searchEnabled: false };
const OLD_ROW = {
  response: { text: 'yesterday', model: 'grok-3-mini' },
  model: 'grok-3-mini',
  createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
};

afterEach(() => { vi.clearAllMocks(); });

describe('withCacheAndRetry max age', () => {
  it('forwards maxAgeSeconds to the cache read and calls the provider on a miss', async () => {
    // The max-age filter lives in SQL, so a day-old row comes back as a miss.
    getCachedMock.mockResolvedValueOnce(null);
    const fn = vi.fn().mockResolvedValue({ text: 'today', model: 'grok-3-mini' });
    const out = await withCacheAndRetry({ ...PARAMS, maxAgeSeconds: 300 }, fn);
    expect(getCachedMock).toHaveBeenCalledWith('cache-key', { maxAgeSeconds: 300 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(out.fromCache).toBe(false);
    expect(out.data.text).toBe('today');
    expect(setCachedMock).toHaveBeenCalledTimes(1);
  });

  it('still dedupes when a row inside the window exists (same run / double-click)', async () => {
    getCachedMock.mockResolvedValueOnce({ ...OLD_ROW, createdAt: new Date() });
    const fn = vi.fn();
    const out = await withCacheAndRetry({ ...PARAMS, maxAgeSeconds: 300 }, fn);
    expect(fn).not.toHaveBeenCalled();
    expect(out.fromCache).toBe(true);
  });

  it('callers without maxAgeSeconds keep the plain TTL read', async () => {
    getCachedMock.mockResolvedValueOnce(OLD_ROW);
    const fn = vi.fn();
    const out = await withCacheAndRetry(PARAMS, fn);
    expect(getCachedMock).toHaveBeenCalledWith('cache-key');
    expect(out.fromCache).toBe(true);
  });

  it('fresh=1 skips the read altogether', async () => {
    const fn = vi.fn().mockResolvedValue({ text: 'today', model: 'grok-3-mini' });
    await withCacheAndRetry({ ...PARAMS, fresh: true, maxAgeSeconds: 300 }, fn);
    expect(getCachedMock).not.toHaveBeenCalled();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// Both tracking-run entry points must opt into the max-age guard. A
// source-level check keeps this cheap: the route and worker pull in the
// whole runtime (Postgres, Redis, BullMQ) and cannot be imported here.
describe('tracking runs opt into the max-age guard', () => {
  const root = path.resolve(__dirname, '..', '..');
  for (const rel of ['app/api/brands/[id]/run/route.ts', 'lib/run-worker.ts']) {
    it(`${rel} passes maxAgeSeconds: getRunCacheMaxAgeSeconds()`, () => {
      const src = fs.readFileSync(path.join(root, rel), 'utf8');
      const call = src.slice(src.indexOf('withCacheAndRetry('));
      const args = call.slice(0, call.indexOf('() =>'));
      expect(args).toMatch(/maxAgeSeconds:\s*getRunCacheMaxAgeSeconds\(\)/);
    });
  }
});

describe('extractPerplexityCitations', () => {
  it('reads the legacy citations array', () => {
    expect(extractPerplexityCitations({ citations: ['https://a.com/x', 'https://b.com/'] }))
      .toEqual(['https://a.com/x', 'https://b.com/']);
  });

  it('reads search_results when citations is absent', () => {
    expect(extractPerplexityCitations({
      search_results: [{ title: 'A', url: 'https://a.com/x' }, { title: 'no url' }],
    })).toEqual(['https://a.com/x']);
  });

  it('merges both and dedupes, citations first', () => {
    expect(extractPerplexityCitations({
      citations: ['https://a.com/x'],
      search_results: [{ url: 'https://a.com/x' }, { url: 'https://c.com/' }],
    })).toEqual(['https://a.com/x', 'https://c.com/']);
  });

  it('returns [] for a response with no sources', () => {
    expect(extractPerplexityCitations({})).toEqual([]);
  });
});
