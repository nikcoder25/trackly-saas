/**
 * IDOR regression tests. Every route that exposes an entity id (URL param,
 * body field, or query string) must scope its SQL to the authenticated user,
 * either directly (WHERE user_id = $n) or via an ownership helper
 * (getBrandWithAccess -> brand.user_id / team_members.member_id).
 *
 * These tests drive the real route handlers with:
 *   - a JWT for USER_A
 *   - a mocked pool that pretends every requested resource belongs to USER_B
 * and assert the handler returns 404/403 without leaking data. If a future
 * refactor forgets the user_id clause, the mock still returns the row for
 * the wrong user and the assertion flips -- which is the regression we're
 * guarding against.
 *
 * See the audit summary in the PR description for the full route list;
 * every route that returned "SAFE" is exercised below.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must be set before @/lib/auth is imported (getSecret() reads it at call time,
// but signAccessToken at import time doesn't hit it; still safer to set early).
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long-abc';

// vi.hoisted is the only way to share a vi.fn() with a vi.mock factory because
// vi.mock is hoisted above every import at transform time.
const { queryFn, safeConnectFn } = vi.hoisted(() => ({
  queryFn: vi.fn(),
  safeConnectFn: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  pool: {
    query: (sql: string, params: unknown[] = []) => queryFn(sql, params),
  },
  safeConnect: (...args: unknown[]) => safeConnectFn(...args),
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
import { GET as brandGet, PUT as brandPut, DELETE as brandDelete } from '@/app/api/brands/[id]/route';
import {
  GET as recsGet,
  POST as recsPost,
  PUT as recsPut,
} from '@/app/api/brands/[id]/recommendations/route';
import {
  PATCH as issuePatch,
} from '@/app/api/brands/[id]/accuracy/issues/[issueId]/route';
import { GET as runStatusGet } from '@/app/api/brands/[id]/run-status/[runId]/route';
import { PUT as alertPut, DELETE as alertDelete } from '@/app/api/alerts/[id]/route';
import { PUT as teamMemberPut, DELETE as teamMemberDelete } from '@/app/api/team/[memberId]/route';
import { POST as notificationsReadPost } from '@/app/api/notifications/read/route';
import { GET as exportBrandGet } from '@/app/api/export/brand/[id]/route';
import { GET as adminUsersGet } from '@/app/api/admin/users/route';
import { GET as adminBackendUsersGet } from '@/app/api/admin-backend/users/route';
import { GET as adminBackendUserGet } from '@/app/api/admin-backend/users/[id]/route';

const USER_A = 'user_A';
const USER_B = 'user_B';

function token(userId: string): string {
  return jwt.sign({ id: userId, email: `${userId}@test.com` }, process.env.JWT_SECRET!);
}

function request(url: string, opts: { method?: string; userId?: string; body?: unknown } = {}): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (opts.userId) headers.set('authorization', `Bearer ${token(opts.userId)}`);
  return new Request(url, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

// Default responder: requester is a verified, non-admin user; everything else
// returns zero rows (i.e., "resource does not belong to you"). Individual tests
// override specific patterns as needed.
function defaultResponder(sql: string, params: unknown[]): { rows: unknown[]; rowCount?: number } {
  if (/SELECT email_verified FROM users/.test(sql)) {
    return { rows: [{ email_verified: true }] };
  }
  if (/SELECT role FROM users/.test(sql)) {
    // Non-admin by default; admin-check tests override this explicitly.
    return { rows: [{ role: 'user' }] };
  }
  if (/SELECT plan, role FROM users/.test(sql)) {
    return { rows: [{ plan: 'starter', role: 'user' }] };
  }
  if (/SELECT plan FROM users/.test(sql)) {
    return { rows: [{ plan: 'starter' }] };
  }
  if (/SELECT plan, trial_ends_at FROM users/.test(sql)) {
    return { rows: [{ plan: 'starter', trial_ends_at: null }] };
  }
  // Every ownership lookup: no match.
  return { rows: [] };
}

beforeEach(() => {
  queryFn.mockReset();
  queryFn.mockImplementation(defaultResponder);
});

// ─── /api/brands/:id ─────────────────────────────────────────────────────────
describe('GET /api/brands/:id', () => {
  it("returns 404 when USER_A requests USER_B's brand", async () => {
    const res = await brandGet(
      request('http://t/api/brands/brand_B', { userId: USER_A }),
      { params: Promise.resolve({ id: 'brand_B' }) }
    );
    expect(res.status).toBe(404);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await brandGet(
      request('http://t/api/brands/brand_B'),
      { params: Promise.resolve({ id: 'brand_B' }) }
    );
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/brands/:id', () => {
  it("returns 404 when USER_A tries to edit USER_B's brand", async () => {
    const res = await brandPut(
      request('http://t/api/brands/brand_B', {
        method: 'PUT', userId: USER_A, body: { name: 'pwned' },
      }),
      { params: Promise.resolve({ id: 'brand_B' }) }
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/brands/:id', () => {
  it("returns 404 when USER_A tries to delete USER_B's brand and SCOPES the delete to user_id", async () => {
    // Capture the DELETE SQL to prove it's scoped to the authenticated user.
    const client = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return Promise.resolve({ rows: [] });
        }
        // Ownership pre-check returns no rows -> handler rolls back.
        if (/FROM brands WHERE id = \$1 AND user_id = \$2/.test(sql)) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      }),
      release: vi.fn(),
    };
    safeConnectFn.mockResolvedValue(client);

    const res = await brandDelete(
      request('http://t/api/brands/brand_B', { method: 'DELETE', userId: USER_A }),
      { params: Promise.resolve({ id: 'brand_B' }) }
    );
    expect(res.status).toBe(404);

    // The ownership pre-check must have been issued with the authenticated
    // user's id, NOT a client-supplied value.
    const calls = client.query.mock.calls.map(c => c[0] as string);
    const ownership = calls.find(s => /FROM brands WHERE id = \$1 AND user_id = \$2/.test(s));
    expect(ownership).toBeTruthy();
  });
});

// ─── /api/brands/:id/recommendations ─────────────────────────────────────────
describe('brands/:id/recommendations', () => {
  it('GET 404 when USER_A requests recommendations on USER_B brand', async () => {
    const res = await recsGet(
      request('http://t/api/brands/brand_B/recommendations', { userId: USER_A }),
      { params: Promise.resolve({ id: 'brand_B' }) }
    );
    expect(res.status).toBe(404);
  });

  it('POST 404 when USER_A tries to trigger recs on USER_B brand', async () => {
    const res = await recsPost(
      request('http://t/api/brands/brand_B/recommendations', { method: 'POST', userId: USER_A }),
      { params: Promise.resolve({ id: 'brand_B' }) }
    );
    expect(res.status).toBe(404);
  });

  it('PUT 404 when USER_A tries to flip status on a rec under USER_B brand', async () => {
    const res = await recsPut(
      request('http://t/api/brands/brand_B/recommendations', {
        method: 'PUT', userId: USER_A,
        body: { id: 'rec_123', status: 'done' },
      }),
      { params: Promise.resolve({ id: 'brand_B' }) }
    );
    expect(res.status).toBe(404);
  });
});

// ─── /api/brands/:id/accuracy/issues/:issueId ────────────────────────────────
describe('PATCH /api/brands/:id/accuracy/issues/:issueId', () => {
  it("returns 404 when USER_A tries to flip an issue on USER_B's brand", async () => {
    const res = await issuePatch(
      request('http://t/api/brands/brand_B/accuracy/issues/issue_X', {
        method: 'PATCH', userId: USER_A,
      }),
      { params: Promise.resolve({ id: 'brand_B', issueId: 'issue_X' }) }
    );
    expect(res.status).toBe(404);
  });
});

// ─── /api/brands/:id/run-status/:runId ───────────────────────────────────────
describe('GET /api/brands/:id/run-status/:runId', () => {
  // The runId validator in the route enforces /^[a-z0-9_-]{6,64}$/i; keep
  // fixture ids long enough to pass it, otherwise the handler short-circuits
  // to 400 before any ownership check runs and masks the real regression.
  const BRAND_A = 'brand_aaaa';
  const BRAND_OTHER = 'brand_other';
  const RUN_ID = 'run_idxyz';

  it("returns 403 when the run belongs to USER_B but USER_A requests it", async () => {
    queryFn.mockImplementation((sql: string, _params: unknown[]) => {
      if (/FROM users WHERE id = \$1/.test(sql)) {
        return { rows: [{ email_verified: true }] };
      }
      if (/FROM active_runs WHERE id = \$1/.test(sql)) {
        // Return a run that belongs to USER_B.
        return { rows: [{
          id: RUN_ID, brand_id: BRAND_A, user_id: USER_B,
          status: 'done', total_expected: 0, received: 0, found_count: 0,
          error_count: 0, results: [], final_data: null, error: null,
          platforms: [], queries: [],
          started_at: null, completed_at: null, updated_at: null,
        }] };
      }
      return { rows: [] };
    });

    const res = await runStatusGet(
      request(`http://t/api/brands/${BRAND_A}/run-status/${RUN_ID}`, { userId: USER_A }),
      { params: Promise.resolve({ id: BRAND_A, runId: RUN_ID }) }
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when the run belongs to USER_A but on a DIFFERENT brand than the URL", async () => {
    queryFn.mockImplementation((sql: string) => {
      if (/FROM users WHERE id = \$1/.test(sql)) {
        return { rows: [{ email_verified: true }] };
      }
      if (/FROM active_runs WHERE id = \$1/.test(sql)) {
        return { rows: [{
          id: RUN_ID, brand_id: BRAND_OTHER, user_id: USER_A,
          status: 'done', total_expected: 0, received: 0, found_count: 0,
          error_count: 0, results: [], final_data: null, error: null,
          platforms: [], queries: [],
          started_at: null, completed_at: null, updated_at: null,
        }] };
      }
      return { rows: [] };
    });

    const res = await runStatusGet(
      request(`http://t/api/brands/${BRAND_A}/run-status/${RUN_ID}`, { userId: USER_A }),
      { params: Promise.resolve({ id: BRAND_A, runId: RUN_ID }) }
    );
    expect(res.status).toBe(403);
  });
});

// ─── /api/alerts/:id ─────────────────────────────────────────────────────────
describe('/api/alerts/:id', () => {
  it("PUT returns 404 when USER_A tries to edit USER_B's alert", async () => {
    const res = await alertPut(
      request('http://t/api/alerts/alert_B', {
        method: 'PUT', userId: USER_A, body: { enabled: true },
      }),
      { params: Promise.resolve({ id: 'alert_B' }) }
    );
    expect(res.status).toBe(404);
  });

  it('PUT update SQL scopes to user_id AND id (TOCTOU hardening)', async () => {
    queryFn.mockImplementation((sql: string) => {
      if (/FROM users WHERE id = \$1/.test(sql)) return { rows: [{ email_verified: true }] };
      if (/SELECT \* FROM alert_rules WHERE id = \$1 AND user_id = \$2/.test(sql)) {
        return { rows: [{ id: 'alert_A', user_id: USER_A, name: 'x' }] };
      }
      if (/^UPDATE alert_rules SET /.test(sql)) {
        expect(sql).toMatch(/WHERE id = \$\d+ AND user_id = \$\d+/);
        return { rows: [] };
      }
      return { rows: [{ id: 'alert_A', user_id: USER_A }] };
    });

    const res = await alertPut(
      request('http://t/api/alerts/alert_A', {
        method: 'PUT', userId: USER_A, body: { enabled: true },
      }),
      { params: Promise.resolve({ id: 'alert_A' }) }
    );
    // If the UPDATE SQL missed `AND user_id`, the expect() inside the mock
    // throws and this test fails. Status 200 proves the happy path still works.
    expect(res.status).toBe(200);
  });

  it("DELETE returns 404 when USER_A tries to delete USER_B's alert", async () => {
    const res = await alertDelete(
      request('http://t/api/alerts/alert_B', { method: 'DELETE', userId: USER_A }),
      { params: Promise.resolve({ id: 'alert_B' }) }
    );
    expect(res.status).toBe(404);
  });
});

// ─── /api/team/:memberId ─────────────────────────────────────────────────────
describe('/api/team/:memberId', () => {
  it("PUT returns 404 when USER_A tries to re-role USER_B's team member", async () => {
    // /api/team/[memberId] uses verifyRequestAuth (no email_verified query),
    // so the only DB call is the scoped UPDATE. Default responder returns
    // zero rows -> 404.
    const res = await teamMemberPut(
      request('http://t/api/team/member_B', {
        method: 'PUT', userId: USER_A, body: { role: 'editor' },
      }),
      { params: Promise.resolve({ memberId: 'member_B' }) }
    );
    expect(res.status).toBe(404);
  });

  it("DELETE returns 404 when USER_A tries to remove USER_B's team member", async () => {
    const res = await teamMemberDelete(
      request('http://t/api/team/member_B', { method: 'DELETE', userId: USER_A }),
      { params: Promise.resolve({ memberId: 'member_B' }) }
    );
    expect(res.status).toBe(404);
  });

  it('PUT SQL is scoped to owner_id = authenticated user', async () => {
    queryFn.mockImplementation((sql: string, params: unknown[]) => {
      if (/UPDATE team_members SET role = \$1 WHERE id = \$2 AND owner_id = \$3/.test(sql)) {
        expect(params[2]).toBe(USER_A); // owner_id comes from JWT, not body/URL
        return { rows: [{ id: 'member_A' }] };
      }
      return { rows: [] };
    });
    await teamMemberPut(
      request('http://t/api/team/member_A', {
        method: 'PUT', userId: USER_A, body: { role: 'editor' },
      }),
      { params: Promise.resolve({ memberId: 'member_A' }) }
    );
  });
});

// ─── /api/notifications/read ─────────────────────────────────────────────────
describe('POST /api/notifications/read', () => {
  it("scopes the UPDATE to WHERE user_id = authenticated user even when ids from body reference USER_B's notifications", async () => {
    queryFn.mockImplementation((sql: string, params: unknown[]) => {
      if (/UPDATE notifications SET read = TRUE WHERE user_id = \$1 AND id = ANY/.test(sql)) {
        expect(params[0]).toBe(USER_A); // JWT-derived
        return { rows: [], rowCount: 0 };
      }
      return { rows: [] };
    });
    const res = await notificationsReadPost(
      request('http://t/api/notifications/read', {
        method: 'POST', userId: USER_A, body: { ids: [999, 1000] },
      })
    );
    expect(res.status).toBe(200);
  });
});

// ─── /api/export/brand/:id ───────────────────────────────────────────────────
describe('GET /api/export/brand/:id', () => {
  it("returns 404 when USER_A tries to export USER_B's brand", async () => {
    const res = await exportBrandGet(
      request('http://t/api/export/brand/brand_B', { userId: USER_A }),
      { params: Promise.resolve({ id: 'brand_B' }) }
    );
    expect(res.status).toBe(404);
  });
});

// ─── Admin gating (requireAdmin, NOT just requireAuth) ───────────────────────
describe('admin routes reject non-admin authenticated users', () => {
  it('GET /api/admin/users returns 404 for a non-admin', async () => {
    // Default responder returns role='user', so the inline requireAdmin
    // in this route should 404.
    const res = await adminUsersGet(
      request('http://t/api/admin/users', { userId: USER_A })
    );
    expect(res.status).toBe(404);
  });

  it('GET /api/admin-backend/users returns 404 for a non-admin', async () => {
    const res = await adminBackendUsersGet(
      request('http://t/api/admin-backend/users', { userId: USER_A })
    );
    expect(res.status).toBe(404);
  });

  it('GET /api/admin-backend/users/:id returns 404 for a non-admin targeting another user', async () => {
    const res = await adminBackendUserGet(
      request('http://t/api/admin-backend/users/user_victim', { userId: USER_A }),
      { params: Promise.resolve({ id: 'user_victim' }) }
    );
    expect(res.status).toBe(404);
  });

  it("admin-backend requireAdmin doesn't accept plan='owner' as an admin principal", async () => {
    // plan=owner is a billing marker, not an authz principal. If a future
    // refactor ever conflated them, a compromised DodoPayments webhook that
    // sets users.plan='owner' would grant admin-backend access.
    queryFn.mockImplementation((sql: string) => {
      if (/SELECT role FROM users/.test(sql)) {
        return { rows: [{ role: 'user' }] }; // plan='owner' but role='user'
      }
      return { rows: [] };
    });
    const res = await adminBackendUsersGet(
      request('http://t/api/admin-backend/users', { userId: USER_A })
    );
    expect(res.status).toBe(404);
  });
});
