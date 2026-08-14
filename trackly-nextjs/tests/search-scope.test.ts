import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Search is the one place in the app where a single query fans out across
 * three tables that carry NO user_id of their own - prompt_runs and citations
 * are keyed only by brand_id. If the brand filter is ever dropped or widened,
 * the endpoint silently returns every tenant's prompts and AI responses.
 *
 * These tests assert the filter exists in the SQL and that the parameter it
 * receives can only ever be the caller's own brands.
 */

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long-abc';

const { queryFn } = vi.hoisted(() => ({ queryFn: vi.fn() }));

vi.mock('@/lib/db', () => ({
  pool: { query: (sql: string, params: unknown[] = []) => queryFn(sql, params) },
  ensureColumns: vi.fn().mockResolvedValue(undefined),
  auditLog: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  rateLimitResponse: vi.fn(() => new Response('rate-limited', { status: 429 })),
}));

import jwt from 'jsonwebtoken';
import { runSearch, escapeLikePattern, resolveAccessibleBrandIds } from '@/lib/search';
import { GET as searchGet } from '@/app/api/search/route';

const USER_A = 'user-a';
const OWN_BRANDS = ['brand-a1', 'brand-a2'];

function authedRequest(url: string, userId = USER_A) {
  // Bearer header, matching tests/idor.test.ts - the access cookie has a
  // non-obvious name and getTokenFromRequest checks the header first.
  const token = jwt.sign(
    { id: userId, email: `${userId}@example.com`, role: 'user', plan: 'pro' },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' }
  );
  return new Request(url, { headers: { authorization: `Bearer ${token}` } });
}

/** Routes every query to a canned answer based on the SQL it receives. */
function mockDb({ brandIds = OWN_BRANDS, rows = [] as Record<string, unknown>[] } = {}) {
  queryFn.mockImplementation((sql: string) => {
    if (/FROM brands WHERE user_id/i.test(sql)) {
      return Promise.resolve({ rows: brandIds.map((id) => ({ id })) });
    }
    if (/FROM users WHERE id/i.test(sql)) {
      return Promise.resolve({ rows: [{ id: USER_A, email_verified: true, role: 'user', plan: 'pro' }] });
    }
    return Promise.resolve({ rows });
  });
}

beforeEach(() => { queryFn.mockReset(); });

describe('brand scoping', () => {
  it('filters every data query by the caller\'s brand ids', async () => {
    mockDb();
    await runSearch(USER_A, 'chatgpt');

    const dataQueries = queryFn.mock.calls.filter(([sql]: [string]) =>
      /FROM (prompt_runs|citations)/i.test(sql)
    );
    expect(dataQueries.length, 'all three entity queries should run').toBe(3);

    for (const [sql, params] of dataQueries) {
      expect(sql, 'missing brand filter:\n' + sql).toMatch(/brand_id = ANY\(\$1\)/);
      expect(params[0], 'brand filter must receive the caller\'s brands').toEqual(OWN_BRANDS);
    }
  });

  it('returns nothing when the user has no brands, rather than everything', async () => {
    // The dangerous failure is `brand_id = ANY('{}')` never being reached and
    // an unfiltered query running instead.
    mockDb({ brandIds: [] });
    const out = await runSearch(USER_A, 'chatgpt');

    expect(out).toEqual({ prompts: [], mentions: [], sources: [] });
    const dataQueries = queryFn.mock.calls.filter(([sql]: [string]) =>
      /FROM (prompt_runs|citations)/i.test(sql)
    );
    expect(dataQueries, 'must not query data tables at all').toHaveLength(0);
  });

  it('cannot be widened by passing another tenant\'s brandId', async () => {
    mockDb();
    await runSearch(USER_A, 'chatgpt', { brandId: 'brand-belonging-to-someone-else' });

    const dataQueries = queryFn.mock.calls.filter(([sql]: [string]) =>
      /FROM (prompt_runs|citations)/i.test(sql)
    );
    // Intersection with the accessible set is empty -> no query runs.
    expect(dataQueries).toHaveLength(0);
  });

  it('narrows to a single brand when that brand is the caller\'s', async () => {
    mockDb();
    await runSearch(USER_A, 'chatgpt', { brandId: 'brand-a2' });

    const [, params] = queryFn.mock.calls.find(([sql]: [string]) => /FROM prompt_runs/i.test(sql))!;
    expect(params[0]).toEqual(['brand-a2']);
  });

  it('includes team-shared brands in the accessible set', async () => {
    queryFn.mockResolvedValue({ rows: [{ id: 'own-1' }, { id: 'shared-1' }] });
    const ids = await resolveAccessibleBrandIds(USER_A);

    const [sql] = queryFn.mock.calls[0];
    expect(sql).toMatch(/team_members/);
    expect(sql).toMatch(/tm\.member_id = \$1/);
    expect(ids).toEqual(['own-1', 'shared-1']);
  });
});

describe('LIKE pattern escaping', () => {
  it('neutralises wildcards so they match literally', () => {
    // Unescaped, "100%" would match every row in the table.
    expect(escapeLikePattern('100%')).toBe('100\\%');
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
    expect(escapeLikePattern('%%%%')).toBe('\\%\\%\\%\\%');
    expect(escapeLikePattern('back\\slash')).toBe('back\\\\slash');
  });

  it('leaves ordinary queries untouched', () => {
    expect(escapeLikePattern('best crm software')).toBe('best crm software');
  });

  it('is applied to the pattern the query actually receives', async () => {
    mockDb();
    await runSearch(USER_A, '50%');
    const [, params] = queryFn.mock.calls.find(([sql]: [string]) => /FROM prompt_runs/i.test(sql))!;
    expect(params[1]).toBe('%50\\%%');
  });
});

describe('GET /api/search', () => {
  it('requires authentication', async () => {
    mockDb();
    const res = await searchGet(new Request('https://livesov.com/api/search?q=test'));
    expect([401, 403]).toContain(res.status);
  });

  it('returns the empty shape for a too-short query without touching the db', async () => {
    mockDb();
    const res = await searchGet(authedRequest('https://livesov.com/api/search?q=a'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(0);
    expect(body.results).toEqual({ prompts: [], mentions: [], sources: [] });
    expect(queryFn.mock.calls.filter(([sql]: [string]) => /FROM prompt_runs/i.test(sql))).toHaveLength(0);
  });

  it('caps an overlong query instead of rejecting it', async () => {
    mockDb();
    const res = await searchGet(authedRequest('https://livesov.com/api/search?q=' + 'x'.repeat(500)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.query.length).toBe(100);
  });

  it('returns grouped results with a total', async () => {
    queryFn.mockImplementation((sql: string) => {
      if (/FROM brands WHERE user_id/i.test(sql)) return Promise.resolve({ rows: [{ id: 'brand-a1' }] });
      if (/FROM users WHERE id/i.test(sql)) {
        return Promise.resolve({ rows: [{ id: USER_A, email_verified: true, role: 'user', plan: 'pro' }] });
      }
      if (/GROUP BY prompt, brand_id/i.test(sql)) {
        return Promise.resolve({ rows: [{ prompt: 'best crm', brand_id: 'brand-a1', runs: 10, mentions: 4, last_seen: new Date() }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await searchGet(authedRequest('https://livesov.com/api/search?q=crm'));
    const body = await res.json();

    expect(body.total).toBe(1);
    expect(body.results.prompts[0].title).toBe('best crm');
    expect(body.results.prompts[0].subtitle).toBe('4/10 runs mentioned you');
    // The href has to be a real, navigable destination.
    expect(body.results.prompts[0].href).toBe('/dashboard/prompt-details?q=best%20crm');
  });
});
