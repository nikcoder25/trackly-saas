/**
 * Regression tests for /api/payments/cancel transactional fix.
 *
 * Pre-fix the route did `PATCH Dodo` -> autocommit `UPDATE users` with no
 * transaction. If the UPDATE threw after Dodo accepted the cancel, Dodo
 * stopped billing but our DB still showed the paid plan; the user kept
 * the premium UI without billing until the webhook or 15-minute reconcile
 * cron healed it.
 *
 * Fix: single SERIALIZABLE transaction wrapping
 *   BEGIN -> SELECT FOR UPDATE -> PATCH Dodo -> UPDATE users -> COMMIT
 * with these guarantees:
 *   - Dodo failure  -> ROLLBACK, no DB write, route returns 5xx.
 *   - DB failure    -> ROLLBACK, no partial state, route returns 5xx.
 *   - COMMIT failure after Dodo success -> compensating audit row is
 *     written on a fresh connection (the global pool, not the failed
 *     client) tagged 'cancel_db_commit_failed_after_dodo_success' so the
 *     rare unrecoverable-drift case is observable in ops dashboards.
 *   - 404/409/410 from Dodo are treated as already-cancelled and the DB
 *     UPDATE proceeds (idempotency for double-clicks / retries).
 *   - Concurrent double-click is serialised by SELECT FOR UPDATE; the
 *     second request sees plan='free' and returns 400 idempotently.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  safeConnectFn,
  poolQuery,
  auditLogFn,
  loggerWarn,
  loggerInfo,
  loggerError,
  verifyRequestAuthFn,
  sendPlanCancellationEmailFn,
  tryEnqueueRecoveredFn,
  rateLimitFn,
} = vi.hoisted(() => ({
  safeConnectFn: vi.fn(),
  poolQuery: vi.fn(),
  auditLogFn: vi.fn().mockResolvedValue(true),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  verifyRequestAuthFn: vi.fn(),
  sendPlanCancellationEmailFn: vi.fn().mockResolvedValue({ sent: true }),
  tryEnqueueRecoveredFn: vi.fn().mockResolvedValue(undefined),
  rateLimitFn: vi.fn().mockResolvedValue({ allowed: true, retryAfter: 0 }),
}));

vi.mock('@/lib/db', () => ({
  pool: { query: (sql: string, params: unknown[] = []) => poolQuery(sql, params) },
  safeConnect: () => safeConnectFn(),
  auditLog: (...args: unknown[]) => auditLogFn(...args),
  ensureColumns: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth', () => ({
  verifyRequestAuth: (req: Request) => verifyRequestAuthFn(req),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkUserIpRateLimit: (...args: unknown[]) => rateLimitFn(...args),
  getClientIp: () => '127.0.0.1',
  rateLimitResponse: (retryAfter: number) =>
    Response.json({ error: 'Rate limited', retryAfter }, { status: 429 }),
}));

vi.mock('@/lib/api-error', () => ({
  serverError: (opts?: { message?: string }) =>
    Response.json({ error: opts?.message ?? 'Internal server error' }, { status: 500 }),
  logError: (tag: string, e: unknown) => loggerError(tag, { error: (e as Error).message }),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: (...args: unknown[]) => loggerInfo(...args),
    warn: (...args: unknown[]) => loggerWarn(...args),
    error: (...args: unknown[]) => loggerError(...args),
  },
}));

vi.mock('@/lib/email', () => ({
  sendPlanCancellationEmail: (...args: unknown[]) => sendPlanCancellationEmailFn(...args),
  planCancellationIdempotencyKey: (userId: string, sub: string | null | undefined) =>
    `plan_cancellation:${userId}:${sub || 'no_sub'}`,
  tryEnqueueRecoveredCancellationEmail: (...args: unknown[]) =>
    tryEnqueueRecoveredFn(...args),
}));

import { POST as cancelPost } from '@/app/api/payments/cancel/route';

interface QueryRecord { sql: string; params: unknown[] }

interface FakeUserRow {
  email: string | null;
  plan: string;
  settings: Record<string, unknown> | null;
}

// Builds a minimal pg client double whose .query() responds to the SQL
// strings the cancel route issues. Each test customises behaviour by
// passing overrides that match a sql substring -> response (or thrown
// error). Every call is recorded in `recorded` so tests can assert the
// exact BEGIN/SELECT/UPDATE/COMMIT/ROLLBACK sequence.
type QueryHandler = (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> | { rows: unknown[] };

function makeFakeClient(opts: {
  user: FakeUserRow | null;
  onUpdate?: QueryHandler;
  onCommit?: QueryHandler;
}): {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
  recorded: QueryRecord[];
} {
  const recorded: QueryRecord[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    recorded.push({ sql, params });

    if (/^BEGIN/i.test(sql)) return { rows: [] };
    if (/^ROLLBACK/i.test(sql)) return { rows: [] };

    if (/^COMMIT/i.test(sql)) {
      if (opts.onCommit) return await opts.onCommit(sql, params);
      return { rows: [] };
    }

    if (/SELECT email, plan, settings FROM users/.test(sql)) {
      return { rows: opts.user ? [opts.user] : [] };
    }

    if (/UPDATE users SET plan = 'free'/.test(sql)) {
      if (opts.onUpdate) return await opts.onUpdate(sql, params);
      return { rows: [] };
    }

    return { rows: [] };
  });
  const release = vi.fn();
  return { query, release, recorded };
}

interface FetchCall { url: string; init: RequestInit | undefined }

function installFetchMock(
  handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>,
): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    return await handler(url, init);
  }) as typeof globalThis.fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function buildRequest(): Request {
  return new Request('http://t/api/payments/cancel', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
  });
}

beforeEach(() => {
  safeConnectFn.mockReset();
  poolQuery.mockReset();
  auditLogFn.mockReset();
  auditLogFn.mockResolvedValue(true);
  loggerWarn.mockReset();
  loggerInfo.mockReset();
  loggerError.mockReset();
  verifyRequestAuthFn.mockReset();
  verifyRequestAuthFn.mockReturnValue({ id: 'user_A', email: 'a@test.com' });
  sendPlanCancellationEmailFn.mockReset();
  sendPlanCancellationEmailFn.mockResolvedValue({ sent: true });
  tryEnqueueRecoveredFn.mockReset();
  tryEnqueueRecoveredFn.mockResolvedValue(undefined);
  rateLimitFn.mockReset();
  rateLimitFn.mockResolvedValue({ allowed: true, retryAfter: 0 });

  process.env.DODO_PAYMENTS_API_KEY = 'test_dodo_api_key';
  process.env.DODO_PAYMENTS_ENVIRONMENT = 'test_mode';
});

describe('/api/payments/cancel — transactional Dodo PATCH + DB UPDATE', () => {
  it('T1: happy path — Dodo 2xx and DB UPDATE both succeed inside one COMMIT', async () => {
    const fake = makeFakeClient({
      user: {
        email: 'a@test.com',
        plan: 'pro',
        settings: { subscription_id: 'sub_X', dodo_customer_id: 'cus_X', dodo_product_id: 'prod_pro' },
      },
    });
    safeConnectFn.mockResolvedValue(fake);

    const fetchMock = installFetchMock(async (url) => {
      if (/\/subscriptions\/sub_X$/.test(url)) {
        return new Response(JSON.stringify({ id: 'sub_X', status: 'cancelled' }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });

    try {
      const res = await cancelPost(buildRequest());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Exactly one PATCH to Dodo with status:cancelled.
      const patchCalls = fetchMock.calls.filter(
        c => /\/subscriptions\/sub_X$/.test(c.url) && c.init?.method === 'PATCH',
      );
      expect(patchCalls.length).toBe(1);
      const sentBody = typeof patchCalls[0].init?.body === 'string' ? patchCalls[0].init.body : '';
      expect(sentBody).toContain('"status":"cancelled"');

      // BEGIN ... SELECT FOR UPDATE ... UPDATE ... COMMIT — exactly one of each,
      // and a SELECT FOR UPDATE locked the row.
      const stmtSeq = fake.recorded.map(r => r.sql.replace(/\s+/g, ' ').trim());
      const beginIdx = stmtSeq.findIndex(s => /^BEGIN ISOLATION LEVEL SERIALIZABLE/.test(s));
      const selectIdx = stmtSeq.findIndex(s => /SELECT email, plan, settings.*FOR UPDATE/.test(s));
      const updateIdx = stmtSeq.findIndex(s => /UPDATE users SET plan = 'free'/.test(s));
      const commitIdx = stmtSeq.findIndex(s => /^COMMIT/.test(s));

      expect(beginIdx).toBeGreaterThanOrEqual(0);
      expect(selectIdx).toBeGreaterThan(beginIdx);
      expect(updateIdx).toBeGreaterThan(selectIdx);
      expect(commitIdx).toBeGreaterThan(updateIdx);

      // No ROLLBACK on the happy path.
      expect(stmtSeq.find(s => /^ROLLBACK/.test(s))).toBeUndefined();

      // Success audit row written.
      const successAudit = auditLogFn.mock.calls.find(c => c[1] === 'subscription_cancelled');
      expect(successAudit, 'expected subscription_cancelled audit row').toBeTruthy();

      // No COMMIT-failure audit row.
      const driftAudit = auditLogFn.mock.calls.find(
        c => c[1] === 'cancel_db_commit_failed_after_dodo_success',
      );
      expect(driftAudit, 'happy path must not write drift audit row').toBeFalsy();
    } finally {
      fetchMock.restore();
    }
  });

  it('T2: Dodo PATCH 5xx — ROLLBACK, no DB UPDATE, route returns 500', async () => {
    const fake = makeFakeClient({
      user: {
        email: 'a@test.com',
        plan: 'pro',
        settings: { subscription_id: 'sub_X' },
      },
    });
    safeConnectFn.mockResolvedValue(fake);

    const fetchMock = installFetchMock(async (url) => {
      if (/\/subscriptions\/sub_X$/.test(url)) {
        return new Response('upstream timeout', { status: 503 });
      }
      return new Response('{}', { status: 200 });
    });

    try {
      const res = await cancelPost(buildRequest());
      expect(res.status).toBe(500);

      const stmtSeq = fake.recorded.map(r => r.sql.replace(/\s+/g, ' ').trim());

      // ROLLBACK was issued; no UPDATE / COMMIT happened.
      expect(stmtSeq.find(s => /^ROLLBACK/.test(s))).toBeTruthy();
      expect(stmtSeq.find(s => /UPDATE users SET plan = 'free'/.test(s))).toBeUndefined();
      expect(stmtSeq.find(s => /^COMMIT/.test(s))).toBeUndefined();

      // No success audit, no drift audit.
      expect(auditLogFn.mock.calls.find(c => c[1] === 'subscription_cancelled')).toBeFalsy();
      expect(auditLogFn.mock.calls.find(
        c => c[1] === 'cancel_db_commit_failed_after_dodo_success',
      )).toBeFalsy();

      // Provider error logged.
      expect(loggerError.mock.calls.find(c => c[0] === 'payments.cancel.provider_error')).toBeTruthy();
    } finally {
      fetchMock.restore();
    }
  });

  it('T3: Dodo PATCH 404/409/410 — treated as already-cancelled, DB UPDATE proceeds, COMMIT', async () => {
    for (const status of [404, 409, 410]) {
      const fake = makeFakeClient({
        user: {
          email: 'a@test.com',
          plan: 'pro',
          settings: { subscription_id: 'sub_X' },
        },
      });
      safeConnectFn.mockReset();
      safeConnectFn.mockResolvedValue(fake);
      auditLogFn.mockReset();
      auditLogFn.mockResolvedValue(true);
      loggerInfo.mockReset();

      const fetchMock = installFetchMock(async () => new Response('{}', { status }));

      try {
        const res = await cancelPost(buildRequest());
        expect(res.status, `status ${status} should succeed`).toBe(200);

        const stmtSeq = fake.recorded.map(r => r.sql.replace(/\s+/g, ' ').trim());
        expect(stmtSeq.find(s => /UPDATE users SET plan = 'free'/.test(s)), `UPDATE for ${status}`).toBeTruthy();
        expect(stmtSeq.find(s => /^COMMIT/.test(s)), `COMMIT for ${status}`).toBeTruthy();
        expect(stmtSeq.find(s => /^ROLLBACK/.test(s)), `no ROLLBACK for ${status}`).toBeUndefined();

        // Already-cancelled info log was written.
        const alreadyLog = loggerInfo.mock.calls.find(
          c => c[0] === 'payments.cancel.provider_already_cancelled',
        );
        expect(alreadyLog, `expected provider_already_cancelled log for ${status}`).toBeTruthy();

        // Success audit row written.
        expect(
          auditLogFn.mock.calls.find(c => c[1] === 'subscription_cancelled'),
          `success audit for ${status}`,
        ).toBeTruthy();
      } finally {
        fetchMock.restore();
      }
    }
  });

  it('T4: DB UPDATE fails mid-transaction — ROLLBACK, no partial state, 500 returned', async () => {
    const fake = makeFakeClient({
      user: {
        email: 'a@test.com',
        plan: 'pro',
        settings: { subscription_id: 'sub_X' },
      },
      onUpdate: () => {
        throw new Error('serialization_failure');
      },
    });
    safeConnectFn.mockResolvedValue(fake);

    const fetchMock = installFetchMock(async (url) => {
      if (/\/subscriptions\/sub_X$/.test(url)) {
        return new Response(JSON.stringify({ status: 'cancelled' }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });

    try {
      const res = await cancelPost(buildRequest());
      expect(res.status).toBe(500);

      const stmtSeq = fake.recorded.map(r => r.sql.replace(/\s+/g, ' ').trim());

      // The UPDATE was attempted (it's what threw) but COMMIT was NOT.
      expect(stmtSeq.find(s => /UPDATE users SET plan = 'free'/.test(s))).toBeTruthy();
      expect(stmtSeq.find(s => /^COMMIT/.test(s))).toBeUndefined();
      expect(stmtSeq.find(s => /^ROLLBACK/.test(s))).toBeTruthy();

      // db_update_failed log fired.
      expect(loggerError.mock.calls.find(c => c[0] === 'payments.cancel.db_update_failed')).toBeTruthy();

      // No success audit row.
      expect(auditLogFn.mock.calls.find(c => c[1] === 'subscription_cancelled')).toBeFalsy();
    } finally {
      fetchMock.restore();
    }
  });

  it('T5: COMMIT fails after Dodo success — fresh-connection audit row tagged cancel_db_commit_failed_after_dodo_success, 500 returned', async () => {
    const fake = makeFakeClient({
      user: {
        email: 'a@test.com',
        plan: 'pro',
        settings: { subscription_id: 'sub_X' },
      },
      onCommit: () => {
        throw new Error('commit_disconnected');
      },
    });
    safeConnectFn.mockResolvedValue(fake);

    const fetchMock = installFetchMock(async (url) => {
      if (/\/subscriptions\/sub_X$/.test(url)) {
        return new Response(JSON.stringify({ status: 'cancelled' }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });

    try {
      const res = await cancelPost(buildRequest());
      // 500 so the client retries / human ops investigates.
      expect(res.status).toBe(500);

      // Compensating audit row was written. auditLog uses the global pool
      // (a fresh connection) — not the failed transaction client — so this
      // is the safety record even when the txn client is poisoned.
      const driftAudit = auditLogFn.mock.calls.find(
        c => c[1] === 'cancel_db_commit_failed_after_dodo_success',
      );
      expect(driftAudit, 'expected drift audit row').toBeTruthy();
      // Audit row carries the subscription_id and previous plan for triage.
      const driftDetails = driftAudit?.[4] as Record<string, unknown> | undefined;
      expect(driftDetails?.subscriptionId).toBe('sub_X');
      expect(driftDetails?.previousPlan).toBe('pro');

      // Specific error log fired.
      expect(loggerError.mock.calls.find(
        c => c[0] === 'payments.cancel.commit_failed_after_dodo_success',
      )).toBeTruthy();

      // No success audit row.
      expect(auditLogFn.mock.calls.find(c => c[1] === 'subscription_cancelled')).toBeFalsy();
    } finally {
      fetchMock.restore();
    }
  });

  it('T6: concurrent double-click — second request sees plan=free and returns 200 idempotently with a recovery enqueue, without re-PATCHing Dodo', async () => {
    // First request: pro -> free. Second request runs after the first
    // commits and sees the new state via SELECT FOR UPDATE (the lock
    // serialises them; we model serialisation here by running them
    // sequentially with the second seeing the already-cancelled state).
    //
    // Behaviour change vs the pre-fix route: the second request no
    // longer returns 400. Returning 400 was the silent-no-email bug —
    // if the first request's email-enqueue had failed (network blip,
    // DEV-mode short-circuit, transient INSERT error) the user would
    // never receive the confirmation. We now respond 200 idempotently
    // and best-effort enqueue from audit history; the email_outbox
    // UNIQUE(idempotency_key) collapses the dedupe so the user gets
    // exactly one email regardless of how many double-clicks happen.
    const firstFake = makeFakeClient({
      user: {
        email: 'a@test.com',
        plan: 'pro',
        settings: { subscription_id: 'sub_X' },
      },
    });
    const secondFake = makeFakeClient({
      user: {
        email: 'a@test.com',
        plan: 'free',
        settings: { subscription_status: 'cancelled' },
      },
    });
    safeConnectFn
      .mockResolvedValueOnce(firstFake)
      .mockResolvedValueOnce(secondFake);

    const fetchMock = installFetchMock(async (url) => {
      if (/\/subscriptions\/sub_X$/.test(url)) {
        return new Response(JSON.stringify({ status: 'cancelled' }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });

    try {
      const res1 = await cancelPost(buildRequest());
      expect(res1.status).toBe(200);

      const res2 = await cancelPost(buildRequest());
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.success).toBe(true);
      expect(body2.alreadyCancelled).toBe(true);

      // Dodo PATCH was issued for the first request only — the second
      // short-circuits before the provider call once it sees plan=free.
      const patchCalls = fetchMock.calls.filter(c => c.init?.method === 'PATCH');
      expect(patchCalls.length).toBe(1);

      // Second request issued BEGIN -> SELECT FOR UPDATE -> ROLLBACK
      // (no UPDATE, no COMMIT) — proves we did NOT double-cancel locally.
      const stmt2 = secondFake.recorded.map(r => r.sql.replace(/\s+/g, ' ').trim());
      expect(stmt2.find(s => /SELECT email, plan, settings.*FOR UPDATE/.test(s))).toBeTruthy();
      expect(stmt2.find(s => /^ROLLBACK/.test(s))).toBeTruthy();
      expect(stmt2.find(s => /UPDATE users SET plan = 'free'/.test(s))).toBeUndefined();
      expect(stmt2.find(s => /^COMMIT/.test(s))).toBeUndefined();

      // The second request invoked the recovery enqueue helper —
      // proves the silent-no-email regression is closed even when the
      // first request's enqueue was lost.
      expect(tryEnqueueRecoveredFn).toHaveBeenCalledTimes(1);
      expect(tryEnqueueRecoveredFn.mock.calls[0][0]).toMatchObject({
        userId: 'user_A',
        email: 'a@test.com',
        source: 'cancel_route_already_free',
      });
    } finally {
      fetchMock.restore();
    }
  });
});
