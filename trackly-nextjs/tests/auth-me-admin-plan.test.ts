/**
 * Regression tests for /api/auth/me admin-plan handling (audit item G).
 *
 * Pre-fix /me promoted admins to plan='owner' with an actual UPDATE
 * users statement. Any DB write that flipped an admin's plan to a
 * non-owner value (the Dodo webhook subscription.cancelled branch,
 * /api/payments/cancel, the reconcile cron, admin-backend manual edits)
 * was silently reverted on the admin's next dashboard load. Critically:
 * an admin who also held a real subscription could never see their
 * cancellation persist, and the SERIALIZABLE atomicity bought by PR
 * #478 in the cancel route was wasted for admin accounts.
 *
 * Fix (Option B from the audit plan): /me is now a pure read at the DB
 * layer. The response payload still surfaces plan='owner' for admins
 * so the existing unmetered UI surfaces (UsageSection, billing page,
 * Sidebar) keep working without code changes — this is a response-shape
 * spoof only, never written back. Authorisation continues to gate on
 * role === 'admin' via lib/admin-auth.ts; spoofing the response plan
 * does not cross any auth boundary.
 *
 * The eight cases below match the PR scope:
 *   T1 - admin with plan='free' -> response plan='owner', NO UPDATE.
 *   T2 - admin with plan='owner' -> response plan='owner', NO UPDATE.
 *   T3 - admin with paid plan='pro' -> response plan='owner', NO UPDATE
 *        (the response is spoofed but the DB is untouched, so the real
 *        billing state survives the /me round-trip).
 *   T4 - non-admin user with plan='pro' -> response plan='pro', NO UPDATE.
 *   T5 - non-admin user with plan='free' -> response plan='free', NO UPDATE.
 *   T6 - unauthenticated -> 401, NO DB queries fire.
 *   T7 - authenticated but user row missing -> 404, NO UPDATE.
 *   T8 - admin with plan='free' calls /me three times back-to-back ->
 *        DB stays clean across all three calls, zero UPDATE statements.
 *        Direct regression check for the audit-described "every dashboard
 *        load" symptom.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { poolQuery, verifyRequestAuthFn, ensureColumnsFn } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  verifyRequestAuthFn: vi.fn(),
  ensureColumnsFn: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/db', () => ({
  pool: { query: (sql: string, params: unknown[] = []) => poolQuery(sql, params) },
  ensureColumns: () => ensureColumnsFn(),
}));

vi.mock('@/lib/auth', () => ({
  verifyRequestAuth: (req: Request) => verifyRequestAuthFn(req),
}));

// safeUser does a lot — encryption, sensitive-key stripping, trial
// resolution. For these tests we just want to know what `plan` ends up
// in the response and that no UPDATE fired, so the helper is mocked to
// passthrough the relevant fields. Real `safeUser` behaviour is covered
// by other tests; here we're testing the route's mutation logic only.
vi.mock('@/lib/helpers', () => ({
  safeUser: (u: Record<string, unknown>) => ({
    id: u.id,
    email: u.email,
    plan: u.plan,
    role: u.role,
  }),
}));

import { GET as meGet } from '@/app/api/auth/me/route';

interface QueryRecord { sql: string; params: unknown[] }

function buildRequest(): Request {
  return new Request('http://t/api/auth/me', { method: 'GET' });
}

// Builds a pool.query double that records every call so each test can
// assert (a) the response contents and (b) that NO `UPDATE users`
// statement was issued. The `users` row served on SELECT is configurable;
// any other SQL returns an empty result set so unrelated route logic
// (like ensureColumns DDL) doesn't blow up.
function installPoolQuery(opts: {
  user: Record<string, unknown> | null;
}): QueryRecord[] {
  const recorded: QueryRecord[] = [];
  poolQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    recorded.push({ sql, params });
    if (/SELECT id, email, username, name, plan/.test(sql)) {
      return { rows: opts.user ? [opts.user] : [] };
    }
    return { rows: [] };
  });
  return recorded;
}

beforeEach(() => {
  poolQuery.mockReset();
  verifyRequestAuthFn.mockReset();
  ensureColumnsFn.mockReset();
  ensureColumnsFn.mockResolvedValue(undefined);
});

describe('/api/auth/me — admin plan handling (DB-clean, response spoofed)', () => {
  it('T1: admin with plan=free — response shows plan=owner, NO UPDATE issued', async () => {
    verifyRequestAuthFn.mockReturnValue({ id: 'admin_user', email: 'admin@test.com' });
    const recorded = installPoolQuery({
      user: {
        id: 'admin_user',
        email: 'admin@test.com',
        plan: 'free',
        role: 'admin',
      },
    });

    const res = await meGet(buildRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.plan).toBe('owner');
    expect(body.user.role).toBe('admin');

    // The critical regression assertion: NO write to users.plan.
    expect(recorded.find(r => /UPDATE users/i.test(r.sql))).toBeUndefined();
  });

  it('T2: admin already at plan=owner — response stays owner, NO UPDATE issued', async () => {
    verifyRequestAuthFn.mockReturnValue({ id: 'admin_user', email: 'admin@test.com' });
    const recorded = installPoolQuery({
      user: {
        id: 'admin_user',
        email: 'admin@test.com',
        plan: 'owner',
        role: 'admin',
      },
    });

    const res = await meGet(buildRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.plan).toBe('owner');

    expect(recorded.find(r => /UPDATE users/i.test(r.sql))).toBeUndefined();
  });

  it('T3: admin with paid plan=pro — response spoofed to owner BUT DB untouched (real billing state survives the /me round-trip)', async () => {
    // This is the core conflict-with-billing case. Pre-fix, /me would
    // UPDATE users SET plan='owner' WHERE id=..., obliterating the
    // admin's real Dodo subscription state. Post-fix the response still
    // shows owner (so the unlimited-cap UI keeps working) but the DB
    // row keeps its true plan='pro'.
    verifyRequestAuthFn.mockReturnValue({ id: 'admin_user', email: 'admin@test.com' });
    const recorded = installPoolQuery({
      user: {
        id: 'admin_user',
        email: 'admin@test.com',
        plan: 'pro',
        role: 'admin',
      },
    });

    const res = await meGet(buildRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.plan).toBe('owner');

    expect(recorded.find(r => /UPDATE users/i.test(r.sql))).toBeUndefined();
  });

  it('T4: non-admin user with plan=pro — response shows plan=pro, NO UPDATE (regression guard)', async () => {
    verifyRequestAuthFn.mockReturnValue({ id: 'regular_user', email: 'user@test.com' });
    const recorded = installPoolQuery({
      user: {
        id: 'regular_user',
        email: 'user@test.com',
        plan: 'pro',
        role: 'user',
      },
    });

    const res = await meGet(buildRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.plan).toBe('pro');
    expect(body.user.role).toBe('user');

    expect(recorded.find(r => /UPDATE users/i.test(r.sql))).toBeUndefined();
  });

  it('T5: non-admin user with plan=free — response shows plan=free, NO UPDATE (second regression guard)', async () => {
    verifyRequestAuthFn.mockReturnValue({ id: 'regular_user', email: 'user@test.com' });
    const recorded = installPoolQuery({
      user: {
        id: 'regular_user',
        email: 'user@test.com',
        plan: 'free',
        role: 'user',
      },
    });

    const res = await meGet(buildRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.plan).toBe('free');

    expect(recorded.find(r => /UPDATE users/i.test(r.sql))).toBeUndefined();
  });

  it('T6: unauthenticated — 401 with no DB queries issued', async () => {
    verifyRequestAuthFn.mockReturnValue(null);
    const recorded = installPoolQuery({ user: null });

    const res = await meGet(buildRequest());
    expect(res.status).toBe(401);

    // Short-circuit before ensureColumns / SELECT, so zero pool.query calls.
    expect(recorded.length).toBe(0);
    expect(ensureColumnsFn).not.toHaveBeenCalled();
  });

  it('T7: authenticated but user row missing — 404 with no UPDATE issued', async () => {
    verifyRequestAuthFn.mockReturnValue({ id: 'ghost_user', email: 'ghost@test.com' });
    const recorded = installPoolQuery({ user: null });

    const res = await meGet(buildRequest());
    expect(res.status).toBe(404);

    expect(recorded.find(r => /UPDATE users/i.test(r.sql))).toBeUndefined();
  });

  it('T8: admin with plan=free calls /me three times back-to-back — zero UPDATE statements across all three (the every-dashboard-load regression check)', async () => {
    verifyRequestAuthFn.mockReturnValue({ id: 'admin_user', email: 'admin@test.com' });
    const recorded = installPoolQuery({
      user: {
        id: 'admin_user',
        email: 'admin@test.com',
        plan: 'free',
        role: 'admin',
      },
    });

    for (let i = 0; i < 3; i++) {
      const res = await meGet(buildRequest());
      expect(res.status, `call ${i + 1} should succeed`).toBe(200);
      const body = await res.json();
      expect(body.user.plan, `call ${i + 1} should spoof owner`).toBe('owner');
    }

    // Direct mirror of the audit's "every dashboard load" finding:
    // across three sequential /me calls, the DB plan column is never
    // mutated by this route — pre-fix this would have produced one
    // UPDATE on the first call (admin's plan flipped from free to
    // owner), and zero on calls 2-3 because the guard `plan !== 'owner'`
    // would have already been false. The post-fix invariant is
    // strictly stronger: zero UPDATE statements regardless of starting
    // state, regardless of how many times the dashboard polls /me.
    const updateCalls = recorded.filter(r => /UPDATE users/i.test(r.sql));
    expect(updateCalls.length).toBe(0);

    // SELECT was issued exactly three times — one per /me call — proving
    // the route is reading the row each time but never mutating it.
    const selectCalls = recorded.filter(r => /SELECT id, email, username, name, plan/.test(r.sql));
    expect(selectCalls.length).toBe(3);
  });
});
