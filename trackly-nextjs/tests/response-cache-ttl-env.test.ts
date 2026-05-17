/**
 * Env-var aliasing for the non-search TTL.
 *
 * RESPONSE_CACHE_TTL_NO_SEARCH_S is the documented name (replaces the
 * legacy RESPONSE_CACHE_TTL_DEFAULT_S). Both must continue to work so
 * deploys carrying the old name don't silently fall back to the
 * hardcoded 7-day default after this rename.
 *
 * The TTL is captured at module load (`Number(process.env...) || 7d`),
 * so each scenario must run against a freshly imported module. We use
 * vi.resetModules + dynamic `await import()` inside each `it` to set
 * up env BEFORE module evaluation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  delete process.env.RESPONSE_CACHE_TTL_NO_SEARCH_S;
  delete process.env.RESPONSE_CACHE_TTL_DEFAULT_S;
  delete process.env.RESPONSE_CACHE_TTL_SEARCH_S;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('getCacheTtl env var aliasing', () => {
  it('honours RESPONSE_CACHE_TTL_NO_SEARCH_S (canonical name)', async () => {
    process.env.RESPONSE_CACHE_TTL_NO_SEARCH_S = '1234';
    const { getCacheTtl } = await import('../src/lib/response-cache');
    expect(getCacheTtl(false)).toBe(1234);
  });

  it('falls back to legacy RESPONSE_CACHE_TTL_DEFAULT_S when new name unset', async () => {
    process.env.RESPONSE_CACHE_TTL_DEFAULT_S = '5678';
    const { getCacheTtl } = await import('../src/lib/response-cache');
    expect(getCacheTtl(false)).toBe(5678);
  });

  it('new name wins over legacy name when both are set', async () => {
    process.env.RESPONSE_CACHE_TTL_NO_SEARCH_S = '1234';
    process.env.RESPONSE_CACHE_TTL_DEFAULT_S = '5678';
    const { getCacheTtl } = await import('../src/lib/response-cache');
    expect(getCacheTtl(false)).toBe(1234);
  });

  it('uses hardcoded 7d default when neither name is set', async () => {
    const { getCacheTtl } = await import('../src/lib/response-cache');
    expect(getCacheTtl(false)).toBe(7 * 24 * 60 * 60);
  });

  it('search TTL is independent of either non-search name', async () => {
    process.env.RESPONSE_CACHE_TTL_NO_SEARCH_S = '1234';
    process.env.RESPONSE_CACHE_TTL_SEARCH_S = '9999';
    const { getCacheTtl } = await import('../src/lib/response-cache');
    expect(getCacheTtl(true)).toBe(9999);
    expect(getCacheTtl(false)).toBe(1234);
  });
});
