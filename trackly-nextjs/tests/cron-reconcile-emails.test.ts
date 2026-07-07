/**
 * Regression tests for the reconcile-payments cron's plan-change emails
 * (audit item C).
 *
 * Pre-fix, the cron repaired plan/status drift but never dispatched any
 * email - when a webhook was dropped and the cron picked up the change,
 * the user was silently moved between plans (or down to free) without
 * confirmation. This file pins the post-fix parity with the webhook
 * handler's three email kinds:
 *
 *   - paid -> free (cancellation)        -> sendPlanCancellationEmail
 *   - free -> paid / paid -> paid up     -> sendPlanUpgradeEmail
 *   - paid -> paid down                  -> sendPlanDowngradeEmail
 *
 * It also pins the conditional-UPDATE idempotency guard: when a webhook
 * beats the cron in the narrow window between SELECT and UPDATE, the
 * cron's UPDATE matches 0 rows (RETURNING empty) and the email is NOT
 * dispatched, preventing double-sends.
 *
 * The eight cases below match the PR scope:
 *   T1 - 404 cleanup on a paid user             -> cancellation email
 *   T2 - 404 cleanup on an already-free user    -> no email
 *   T3 - plan_mismatch free -> paid             -> upgrade email
 *   T4 - plan_mismatch paid -> paid downgrade   -> downgrade email
 *   T5 - plan_mismatch paid -> free (status!=active) -> cancellation email
 *   T6 - status-only drift                      -> no email
 *   T7 - conditional UPDATE loses race          -> no email
 *   T8 - email send failure does not roll back  -> 200, plan persisted
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.CRON_SECRET = 'test_cron_secret_value_32chars_long_xxxx';
  process.env.DODO_PAYMENTS_API_KEY = 'test_dodo_api_key';
  process.env.DODO_PAYMENTS_ENVIRONMENT = 'test_mode';
  process.env.DODO_AGENCY_PRODUCT_ID = 'prod_agency';
  process.env.DODO_PRO_PRODUCT_ID = 'prod_pro';
  process.env.DODO_STARTER_PRODUCT_ID = 'prod_starter';
  process.env.DODO_ENTERPRISE_PRODUCT_ID = 'prod_enterprise';
});

const {
  safeConnectFn,
  poolQuery,
  auditLogFn,
  cronLockFn,
  loggerInfo,
  loggerWarn,
  sendUpgrade,
  sendDowngrade,
  sendCancellation,
} = vi.hoisted(() => ({
  safeConnectFn: vi.fn(),
  poolQuery: vi.fn(),
  auditLogFn: vi.fn().mockResolvedValue(true),
  cronLockFn: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  sendUpgrade: vi.fn().mockResolvedValue({ sent: true }),
  sendDowngrade: vi.fn().mockResolvedValue({ sent: true }),
  sendCancellation: vi.fn().mockResolvedValue({ sent: true }),
}));

vi.mock('@/lib/db', () => ({
  pool: { query: (sql: string, params: unknown[] = []) => poolQuery(sql, params) },
  safeConnect: () => safeConnectFn(),
  auditLog: (...args: unknown[]) => auditLogFn(...args),
  ensureColumns: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/cron-lock', () => ({
  acquireCronLock: () => cronLockFn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: (...args: unknown[]) => loggerInfo(...args),
    warn: (...args: unknown[]) => loggerWarn(...args),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/email', () => ({
  sendPlanUpgradeEmail: (...args: unknown[]) => sendUpgrade(...args),
  sendPlanDowngradeEmail: (...args: unknown[]) => sendDowngrade(...args),
  sendPlanCancellationEmail: (...args: unknown[]) => sendCancellation(...args),
  planCancellationIdempotencyKey: (userId: string, subscriptionId: string | null | undefined) =>
    `plan_cancellation:${userId}:${subscriptionId || 'no_sub'}`,
}));

// comparePlans is real - we want the genuine direction logic, not a stub.
// (No mock for @/lib/plan-config.)

import { GET as cronReconcileGet } from '@/app/api/cron/reconcile-payments/route';

interface FetchCall { url: string; init: RequestInit | undefined }

function installFetchMock(handler: (url: string) => Response | Promise<Response>): {
  calls: FetchCall[];
  restore: () => void;
} {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    return await handler(url);
  }) as typeof globalThis.fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

interface QueryRecord { sql: string; params: unknown[] }

interface UserRow {
  id: string;
  email: string | null;
  plan: string;
  settings: Record<string, unknown>;
}

interface FakeClientOpts {
  users: UserRow[];
  /** Override the RETURNING result for the conditional plan UPDATE.
   *  When provided, the next matching UPDATE returns these rows; lets
   *  us simulate the "lost the race" case (T7). */
  conditionalUpdateRowsOverride?: Array<unknown>;
}

function makeFakeClient(opts: FakeClientOpts): {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
  recorded: QueryRecord[];
} {
  const recorded: QueryRecord[] = [];
  let conditionalOverrideUsed = false;
  const query = vi.fn((sql: string, params: unknown[] = []) => {
    recorded.push({ sql, params });
    if (/SELECT id, email, plan, settings FROM users/.test(sql)) {
      return Promise.resolve({ rows: opts.users });
    }
    // Conditional UPDATE on plan - used by both 404 cleanup and plan_mismatch.
    if (/UPDATE users SET plan = \$1 WHERE id = \$2 AND plan = \$3 RETURNING id/.test(sql)) {
      if (opts.conditionalUpdateRowsOverride !== undefined && !conditionalOverrideUsed) {
        conditionalOverrideUsed = true;
        return Promise.resolve({ rows: opts.conditionalUpdateRowsOverride });
      }
      return Promise.resolve({ rows: [{ id: params[1] }] });
    }
    return Promise.resolve({ rows: [] });
  });
  const release = vi.fn();
  return { query, release, recorded };
}

function authedRequest(): Request {
  return new Request('http://t/api/cron/reconcile-payments', {
    method: 'GET',
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
}

beforeEach(() => {
  safeConnectFn.mockReset();
  poolQuery.mockReset();
  auditLogFn.mockReset();
  auditLogFn.mockResolvedValue(true);
  cronLockFn.mockReset();
  cronLockFn.mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) });
  loggerInfo.mockReset();
  loggerWarn.mockReset();
  sendUpgrade.mockReset();
  sendUpgrade.mockResolvedValue({ sent: true });
  sendDowngrade.mockReset();
  sendDowngrade.mockResolvedValue({ sent: true });
  sendCancellation.mockReset();
  sendCancellation.mockResolvedValue({ sent: true });
});

describe('reconcile-payments cron - email parity with webhook', () => {
  it('T1: 404 cleanup on a paid user dispatches a cancellation email', async () => {
    const fake = makeFakeClient({
      users: [{
        id: 'user_A',
        email: 'a@test.com',
        plan: 'agency',
        settings: { subscription_id: 'sub_X', dodo_customer_id: 'cus_X', dodo_product_id: 'prod_agency' },
      }],
    });
    safeConnectFn.mockResolvedValue(fake);

    const fetchMock = installFetchMock(async () => new Response('not_found', { status: 404 }));
    try {
      const res = await cronReconcileGet(authedRequest());
      expect(res.status).toBe(200);

      // Cancellation email fired exactly once with the previous plan.
      expect(sendCancellation).toHaveBeenCalledTimes(1);
      expect(sendCancellation).toHaveBeenCalledWith(
        'a@test.com',
        { previousPlan: 'agency' },
        // Shared cancellation key (plan_cancellation:userId:subscriptionId)
        // - produced by planCancellationIdempotencyKey so the cron, the
        // webhook, and the cancel route all collide on the same key in
        // the email_outbox UNIQUE index for a given logical cancellation.
        expect.stringMatching(/^plan_cancellation:user_A:sub_X$/),
      );
      expect(sendUpgrade).not.toHaveBeenCalled();
      expect(sendDowngrade).not.toHaveBeenCalled();

      // Conditional UPDATE was issued with the old plan as the WHERE key.
      const conditional = fake.recorded.find(r =>
        /UPDATE users SET plan = \$1 WHERE id = \$2 AND plan = \$3 RETURNING id/.test(r.sql)
        && r.params[0] === 'free' && r.params[2] === 'agency',
      );
      expect(conditional, 'expected conditional UPDATE on plan=agency').toBeTruthy();
    } finally {
      fetchMock.restore();
    }
  });

  it('T2: 404 cleanup on an already-free user does NOT email', async () => {
    const fake = makeFakeClient({
      users: [{
        id: 'user_A',
        email: 'a@test.com',
        plan: 'free',
        settings: { subscription_id: 'sub_old' },
      }],
    });
    safeConnectFn.mockResolvedValue(fake);

    const fetchMock = installFetchMock(async () => new Response('not_found', { status: 404 }));
    try {
      const res = await cronReconcileGet(authedRequest());
      expect(res.status).toBe(200);

      // No email of any kind.
      expect(sendCancellation).not.toHaveBeenCalled();
      expect(sendUpgrade).not.toHaveBeenCalled();
      expect(sendDowngrade).not.toHaveBeenCalled();

      // Settings still got stripped (subscription_status='not_found').
      const stripUpdate = fake.recorded.find(r =>
        /settings - 'subscription_id' - 'dodo_customer_id' - 'dodo_product_id'/.test(r.sql),
      );
      expect(stripUpdate, 'settings strip must still run').toBeTruthy();
    } finally {
      fetchMock.restore();
    }
  });

  it('T3: plan_mismatch free -> paid dispatches an upgrade email', async () => {
    const fake = makeFakeClient({
      users: [{
        id: 'user_A',
        email: 'a@test.com',
        plan: 'free',
        settings: { subscription_id: 'sub_X' },
      }],
    });
    safeConnectFn.mockResolvedValue(fake);

    const fetchMock = installFetchMock(async () => new Response(JSON.stringify({
      status: 'active',
      product_id: 'prod_pro',
      customer: { customer_id: 'cus_X' },
    }), { status: 200 }));

    try {
      const res = await cronReconcileGet(authedRequest());
      expect(res.status).toBe(200);

      expect(sendUpgrade).toHaveBeenCalledTimes(1);
      expect(sendUpgrade).toHaveBeenCalledWith(
        'a@test.com',
        { previousPlan: 'free', newPlan: 'pro' },
        // plan_email:userId:subscriptionId:dodoStatus:expectedPlan
        expect.stringMatching(/^plan_email:user_A:sub_X:active:pro$/),
      );
      expect(sendDowngrade).not.toHaveBeenCalled();
      expect(sendCancellation).not.toHaveBeenCalled();
    } finally {
      fetchMock.restore();
    }
  });

  it('T4: plan_mismatch paid -> paid downgrade dispatches a downgrade email (NOT cancellation)', async () => {
    // agency -> pro via Dodo customer portal plan-change. dodoStatus is
    // still 'active'; expectedPlan resolves to a paid tier; comparePlans
    // returns 'downgrade'.
    const fake = makeFakeClient({
      users: [{
        id: 'user_A',
        email: 'a@test.com',
        plan: 'agency',
        settings: { subscription_id: 'sub_X', dodo_customer_id: 'cus_X', dodo_product_id: 'prod_agency' },
      }],
    });
    safeConnectFn.mockResolvedValue(fake);

    const fetchMock = installFetchMock(async () => new Response(JSON.stringify({
      status: 'active',
      product_id: 'prod_pro',
      customer: { customer_id: 'cus_X' },
    }), { status: 200 }));

    try {
      const res = await cronReconcileGet(authedRequest());
      expect(res.status).toBe(200);

      expect(sendDowngrade).toHaveBeenCalledTimes(1);
      expect(sendDowngrade).toHaveBeenCalledWith(
        'a@test.com',
        { previousPlan: 'agency', newPlan: 'pro' },
        expect.stringMatching(/^plan_email:user_A:sub_X:active:pro$/),
      );
      expect(sendUpgrade).not.toHaveBeenCalled();
      // Crucial: paid->paid downgrade must NOT use cancellation. That
      // message is reserved for transitions to free.
      expect(sendCancellation).not.toHaveBeenCalled();
    } finally {
      fetchMock.restore();
    }
  });

  it('T5: plan_mismatch paid -> free (Dodo status non-active) dispatches a cancellation email', async () => {
    // expectedPlan is forced to 'free' when dodoStatus !== 'active' -
    // matches the webhook DOWNGRADE_EVENTS branch behaviour: always
    // cancellation, never sendPlanDowngradeEmail.
    const fake = makeFakeClient({
      users: [{
        id: 'user_A',
        email: 'a@test.com',
        plan: 'agency',
        settings: { subscription_id: 'sub_X', dodo_customer_id: 'cus_X', dodo_product_id: 'prod_agency' },
      }],
    });
    safeConnectFn.mockResolvedValue(fake);

    const fetchMock = installFetchMock(async () => new Response(JSON.stringify({
      status: 'cancelled',
      product_id: 'prod_agency',
      customer: { customer_id: 'cus_X' },
    }), { status: 200 }));

    try {
      const res = await cronReconcileGet(authedRequest());
      expect(res.status).toBe(200);

      expect(sendCancellation).toHaveBeenCalledTimes(1);
      expect(sendCancellation).toHaveBeenCalledWith(
        'a@test.com',
        { previousPlan: 'agency' },
        expect.stringMatching(/^plan_cancellation:user_A:sub_X$/),
      );
      expect(sendUpgrade).not.toHaveBeenCalled();
      expect(sendDowngrade).not.toHaveBeenCalled();
    } finally {
      fetchMock.restore();
    }
  });

  it('T6: status-only drift does not dispatch any email', async () => {
    // user.plan matches expectedPlan but settings.subscription_status
    // is stale. The cron should update settings and NOT email - same
    // behaviour the webhook has for non-plan-changing events.
    const fake = makeFakeClient({
      users: [{
        id: 'user_A',
        email: 'a@test.com',
        plan: 'pro',
        settings: { subscription_id: 'sub_X', dodo_product_id: 'prod_pro', subscription_status: 'on_hold' },
      }],
    });
    safeConnectFn.mockResolvedValue(fake);

    const fetchMock = installFetchMock(async () => new Response(JSON.stringify({
      status: 'active',
      product_id: 'prod_pro',
      customer: { customer_id: 'cus_X' },
    }), { status: 200 }));

    try {
      const res = await cronReconcileGet(authedRequest());
      expect(res.status).toBe(200);

      // No plan UPDATE attempted: plan already matches.
      const conditionalPlanUpdate = fake.recorded.find(r =>
        /UPDATE users SET plan = \$1 WHERE id = \$2 AND plan = \$3 RETURNING id/.test(r.sql),
      );
      expect(conditionalPlanUpdate, 'no plan UPDATE should be issued for status-only drift').toBeUndefined();

      // No email of any kind.
      expect(sendUpgrade).not.toHaveBeenCalled();
      expect(sendDowngrade).not.toHaveBeenCalled();
      expect(sendCancellation).not.toHaveBeenCalled();
    } finally {
      fetchMock.restore();
    }
  });

  it('T7: conditional UPDATE returns 0 rows (webhook won the race) -> no email', async () => {
    // Simulates a webhook flipping the user's plan between our SELECT
    // and our UPDATE. RETURNING is empty -> we skip the email.
    const fake = makeFakeClient({
      users: [{
        id: 'user_A',
        email: 'a@test.com',
        plan: 'free',
        settings: { subscription_id: 'sub_X' },
      }],
      conditionalUpdateRowsOverride: [], // simulate "0 rows updated"
    });
    safeConnectFn.mockResolvedValue(fake);

    const fetchMock = installFetchMock(async () => new Response(JSON.stringify({
      status: 'active',
      product_id: 'prod_pro',
      customer: { customer_id: 'cus_X' },
    }), { status: 200 }));

    try {
      const res = await cronReconcileGet(authedRequest());
      expect(res.status).toBe(200);

      // No email of any kind despite seeing a plan mismatch.
      expect(sendUpgrade).not.toHaveBeenCalled();
      expect(sendDowngrade).not.toHaveBeenCalled();
      expect(sendCancellation).not.toHaveBeenCalled();

      // Log-only acknowledgement of the raced no-op (no audit row, no
      // state-change kind).
      const racedLog = loggerInfo.mock.calls.find(c => c[0] === 'cron.reconcile.plan_already_synced');
      expect(racedLog, 'expected cron.reconcile.plan_already_synced info log on race').toBeTruthy();
    } finally {
      fetchMock.restore();
    }
  });

  it('T8: email send failure does not roll back the plan fix', async () => {
    // Resend outage: sendPlanUpgradeEmail rejects. Cron must still
    // return 200 and the plan UPDATE must remain committed.
    const fake = makeFakeClient({
      users: [{
        id: 'user_A',
        email: 'a@test.com',
        plan: 'free',
        settings: { subscription_id: 'sub_X' },
      }],
    });
    safeConnectFn.mockResolvedValue(fake);
    sendUpgrade.mockResolvedValue({ sent: false, reason: 'resend timeout 503' });

    const fetchMock = installFetchMock(async () => new Response(JSON.stringify({
      status: 'active',
      product_id: 'prod_pro',
      customer: { customer_id: 'cus_X' },
    }), { status: 200 }));

    try {
      const res = await cronReconcileGet(authedRequest());
      expect(res.status).toBe(200);

      // Plan UPDATE committed; the conditional UPDATE was issued.
      const conditional = fake.recorded.find(r =>
        /UPDATE users SET plan = \$1 WHERE id = \$2 AND plan = \$3 RETURNING id/.test(r.sql)
        && r.params[0] === 'pro',
      );
      expect(conditional).toBeTruthy();

      // Settings merge committed (after the conditional UPDATE).
      const settingsMerge = fake.recorded.find(r =>
        /UPDATE users SET settings = settings \|\| \$1::jsonb/.test(r.sql),
      );
      expect(settingsMerge).toBeTruthy();

      // Email was attempted exactly once and warn-logged when it failed.
      expect(sendUpgrade).toHaveBeenCalledTimes(1);
      // Wait a microtask for the fire-and-forget .then chain to settle.
      await new Promise(r => setImmediate(r));
      const failLog = loggerWarn.mock.calls.find(c => c[0] === 'cron.reconcile.email_failed');
      expect(failLog, 'expected cron.reconcile.email_failed warn').toBeTruthy();
    } finally {
      fetchMock.restore();
    }
  });
});
