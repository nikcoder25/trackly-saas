/**
 * Regression tests for GET /api/brands/[id]/recommendations.
 *
 * The page at /dashboard/recommendations was reported producing a steady
 * 500 on every GET in production while POST /generate succeeded. Two bugs
 * fed into that:
 *
 * 1. The SELECT lists a `category` column that no INSERT in this codebase
 *    populates and that the legacy schema does not declare. PostgreSQL
 *    throws `column "category" does not exist`; the bare `catch {}` in
 *    the handler swallows it and returns a generic 500.
 *
 * 2. The handler accepts `?status=` and `?severity=` straight from the
 *    URL into the SQL parameter list with no validation, so an attacker
 *    or a typo can poison the WHERE clause.
 *
 * The tests below pin down the corrected behaviour:
 *   - empty querystring -> 200 (no `category` reference, nothing to throw)
 *   - valid filter      -> 200 + parameterised SQL
 *   - invalid filter    -> 400 with a JSON error body, not 500
 *   - brand not found   -> 404
 *
 * The "empty querystring" test simulates the production schema by making
 * the mocked pool throw `column "category" does not exist` if the SQL
 * still references it. The unfixed handler trips that throw and falls
 * into its bare-catch 500; the fixed handler removes `category` from
 * the SELECT and so completes normally.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long-abc';

const { queryFn } = vi.hoisted(() => ({ queryFn: vi.fn() }));

vi.mock('@/lib/db', () => ({
  pool: {
    query: (sql: string, params: unknown[] = []) => queryFn(sql, params),
  },
  safeConnect: vi.fn(),
  ensureColumns: vi.fn().mockResolvedValue(undefined),
  auditLog: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  rateLimitResponse: vi.fn(() => new Response('rate-limited', { status: 429 })),
  checkUserIpRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

import jwt from 'jsonwebtoken';
import { GET as recsGet } from '@/app/api/brands/[id]/recommendations/route';

const USER_A = 'user_A';

function token(userId: string): string {
  return jwt.sign({ id: userId, email: `${userId}@test.com` }, process.env.JWT_SECRET!);
}

function request(url: string, opts: { userId?: string } = {}): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (opts.userId) headers.set('authorization', `Bearer ${token(opts.userId)}`);
  return new Request(url, { method: 'GET', headers });
}

interface QueryCall { sql: string; params: unknown[] }

// Realistic mock that mirrors the production DB: the recommendations
// table exists but has NO `category` column. A SELECT that lists
// `category` therefore throws.
function makeRealisticResponder(opts: {
  brandRows?: unknown[];
  recordCalls?: QueryCall[];
} = {}) {
  const brandRows = opts.brandRows ?? [{
    id: 'brand_A', user_id: USER_A, data: {}, created_at: null, updated_at: null,
  }];
  return (sql: string, params: unknown[] = []) => {
    opts.recordCalls?.push({ sql, params });
    if (/SELECT email_verified FROM users/.test(sql)) {
      return { rows: [{ email_verified: true }] };
    }
    if (/SELECT plan FROM users/.test(sql)) {
      // 'pro' has sentiment:true, which is the gate the recommendations
      // endpoint enforces. starter has sentiment:false and would 403.
      return { rows: [{ plan: 'pro' }] };
    }
    if (/FROM brands WHERE id = \$1 AND user_id = \$2/.test(sql)) {
      return { rows: brandRows };
    }
    if (/FROM team_members/.test(sql)) {
      return { rows: [] };
    }
    if (/FROM recommendations/.test(sql)) {
      if (/category/.test(sql)) {
        throw new Error('column "category" does not exist');
      }
      return { rows: [] };
    }
    return { rows: [] };
  };
}

beforeEach(() => {
  queryFn.mockReset();
});

describe('GET /api/brands/[id]/recommendations', () => {
  it('returns 200 with an empty querystring (regression: production 500)', async () => {
    queryFn.mockImplementation(makeRealisticResponder());

    const res = await recsGet(
      request('http://t/api/brands/brand_A/recommendations?', { userId: USER_A }),
      { params: Promise.resolve({ id: 'brand_A' }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ recommendations: [] });
  });

  it('returns 200 with a valid status filter and binds it as a parameter', async () => {
    const calls: QueryCall[] = [];
    queryFn.mockImplementation(makeRealisticResponder({ recordCalls: calls }));

    const res = await recsGet(
      request('http://t/api/brands/brand_A/recommendations?status=open', { userId: USER_A }),
      { params: Promise.resolve({ id: 'brand_A' }) }
    );

    expect(res.status).toBe(200);
    const recsCall = calls.find(c => /FROM recommendations/.test(c.sql));
    expect(recsCall).toBeTruthy();
    expect(recsCall!.sql).toMatch(/AND status = \$\d/);
    expect(recsCall!.params).toContain('open');
  });

  it('returns 400 (not 500) when status filter is unknown', async () => {
    queryFn.mockImplementation(makeRealisticResponder());

    const res = await recsGet(
      request('http://t/api/brands/brand_A/recommendations?status=bogus', { userId: USER_A }),
      { params: Promise.resolve({ id: 'brand_A' }) }
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(typeof body.error).toBe('string');
  });

  it('returns 400 (not 500) when severity filter is unknown', async () => {
    queryFn.mockImplementation(makeRealisticResponder());

    const res = await recsGet(
      request('http://t/api/brands/brand_A/recommendations?severity=spicy', { userId: USER_A }),
      { params: Promise.resolve({ id: 'brand_A' }) }
    );

    expect(res.status).toBe(400);
  });

  it('treats empty-string filter values as "no filter"', async () => {
    const calls: QueryCall[] = [];
    queryFn.mockImplementation(makeRealisticResponder({ recordCalls: calls }));

    const res = await recsGet(
      request('http://t/api/brands/brand_A/recommendations?status=&severity=', { userId: USER_A }),
      { params: Promise.resolve({ id: 'brand_A' }) }
    );

    expect(res.status).toBe(200);
    const recsCall = calls.find(c => /FROM recommendations/.test(c.sql));
    expect(recsCall!.sql).not.toMatch(/AND status =/);
    expect(recsCall!.sql).not.toMatch(/AND severity =/);
  });

  it('returns 404 when the brand is not visible to the caller', async () => {
    queryFn.mockImplementation(makeRealisticResponder({ brandRows: [] }));

    const res = await recsGet(
      request('http://t/api/brands/brand_B/recommendations', { userId: USER_A }),
      { params: Promise.resolve({ id: 'brand_B' }) }
    );

    expect(res.status).toBe(404);
  });
});
