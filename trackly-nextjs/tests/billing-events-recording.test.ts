/**
 * Regression tests for the billing_events recording path.
 *
 * Pre-fix: the user-facing Billing History on /dashboard/account
 * surfaced ONLY 'subscription cancelled' rows. Plan upgrades,
 * downgrades, renewals, and orphan-cancel rows from the upgrade flow
 * never appeared, because:
 *   1. The webhook handler called `auditLog('system', ...)` which
 *      db.ts rewrites to user_id=NULL - invisible to the user-scoped
 *      history query.
 *   2. The audit row never carried the from→to plan transition.
 *
 * Fix: a dedicated `billing_events` table written from the webhook
 * inside its SERIALIZABLE tx and from /api/payments/cancel post-commit.
 *
 * The cases below cover the producer paths (the consumer side - the
 * /api/payments/history GET - is exercised in
 * billing-events-history-api.test.ts):
 *   T1 - webhook free → pro upgrade records plan_upgraded with from/to.
 *   T2 - webhook pro → agency upgrade records plan_upgraded.
 *   T3 - webhook agency → starter downgrade records plan_downgraded.
 *   T4 - webhook genuine cancellation records plan_cancelled.
 *   T5 - webhook superseded_sub (orphan) records superseded_sub_cancelled
 *        when previousPlan != 'free'; SUPPRESSES the row when
 *        previousPlan === 'free' (cancel-route-ran-first race).
 *   T6 - cancel route post-commit records plan_cancelled with no
 *        dodo_event_id.
 *   T7 - invariant guard: every webhook plan-changing branch records
 *        a billing_events row. If a future change introduces a new
 *        plan-mutating branch without a corresponding INSERT, this
 *        test fails.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

vi.hoisted(() => {
  const secretBase64 = Buffer.from('test_webhook_secret_value_12345').toString('base64');
  process.env.DODO_PAYMENTS_WEBHOOK_KEY = `whsec_${secretBase64}`;
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
  loggerWarn,
  loggerInfo,
  loggerError,
  verifyRequestAuthFn,
  rateLimitFn,
  sendPlanCancellationEmailFn,
  tryEnqueueRecoveredFn,
} = vi.hoisted(() => ({
  safeConnectFn: vi.fn(),
  poolQuery: vi.fn(),
  auditLogFn: vi.fn().mockResolvedValue(true),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  verifyRequestAuthFn: vi.fn(),
  rateLimitFn: vi.fn().mockResolvedValue({ allowed: true, retryAfter: 0 }),
  sendPlanCancellationEmailFn: vi.fn().mockResolvedValue({ sent: true }),
  tryEnqueueRecoveredFn: vi.fn().mockResolvedValue(undefined),
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
  sendPlanUpgradeEmail: vi.fn().mockResolvedValue({ sent: true }),
  sendPlanDowngradeEmail: vi.fn().mockResolvedValue({ sent: true }),
  sendPlanCancellationEmail: (...args: unknown[]) => sendPlanCancellationEmailFn(...args),
  planCancellationIdempotencyKey: (userId: string, sub: string | null | undefined) =>
    `plan_cancellation:${userId}:${sub || 'no_sub'}`,
  tryEnqueueRecoveredCancellationEmail: (...args: unknown[]) => tryEnqueueRecoveredFn(...args),
}));

vi.mock('@/lib/plan-config', () => ({
  comparePlans: (from: string | null | undefined, to: string | null | undefined) => {
    const rank: Record<string, number> = { free: 0, trial: 0, starter: 1, pro: 2, agency: 3, enterprise: 4 };
    const a = rank[from || 'free'] ?? 0;
    const b = rank[to || 'free'] ?? 0;
    if (b > a) return 'upgrade';
    if (b < a) return 'downgrade';
    return 'same';
  },
}));

import { POST as webhookPost } from '@/app/api/payments/webhooks/dodopayments/route';
import { POST as cancelPost } from '@/app/api/payments/cancel/route';

function signStandardWebhook(rawBody: string, webhookId: string, webhookTimestamp: string): string {
  const secret = process.env.DODO_PAYMENTS_WEBHOOK_KEY!;
  const keyBytes = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64')
    : Buffer.from(secret, 'utf8');
  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const sig = crypto.createHmac('sha256', keyBytes).update(signedContent).digest('base64');
  return `v1,${sig}`;
}

interface BuildOpts {
  type: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

function buildSignedRequest(opts: BuildOpts): Request {
  const webhookId = `wh_${Math.random().toString(36).slice(2)}`;
  const webhookTimestamp = String(Math.floor(Date.now() / 1000));
  const body = {
    type: opts.type,
    business_id: 'biz_test',
    timestamp: webhookTimestamp,
    data: opts.data,
    metadata: opts.metadata,
  };
  const rawBody = JSON.stringify(body);
  const signature = signStandardWebhook(rawBody, webhookId, webhookTimestamp);
  const headers = new Headers({
    'content-type': 'application/json',
    'webhook-id': webhookId,
    'webhook-timestamp': webhookTimestamp,
    'webhook-signature': signature,
  });
  return new Request('http://t/api/payments/webhooks/dodopayments', {
    method: 'POST',
    headers,
    body: rawBody,
  });
}

interface QueryRecord { sql: string; params: unknown[] }

function makeFakeClient(currentUser: Record<string, unknown> | null): {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
  recorded: QueryRecord[];
} {
  const recorded: QueryRecord[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    recorded.push({ sql, params });
    if (/INSERT INTO webhook_events/.test(sql)) {
      return { rows: [{ event_id: params[0] }] };
    }
    if (/INSERT INTO billing_events/.test(sql)) {
      return { rows: [{ id: params[0] }] };
    }
    if (/SELECT id, email, plan, settings FROM users/.test(sql)) {
      return { rows: currentUser ? [currentUser] : [] };
    }
    if (/SELECT email, plan, settings FROM users/.test(sql)) {
      return { rows: currentUser ? [currentUser] : [] };
    }
    return { rows: [] };
  });
  const release = vi.fn();
  return { query, release, recorded };
}

function findBillingInsert(
  recorded: QueryRecord[],
  predicate: (params: unknown[]) => boolean,
): QueryRecord | undefined {
  return recorded.find(
    (r) => /INSERT INTO billing_events/.test(r.sql) && predicate(r.params),
  );
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
  rateLimitFn.mockReset();
  rateLimitFn.mockResolvedValue({ allowed: true, retryAfter: 0 });
  sendPlanCancellationEmailFn.mockReset();
  sendPlanCancellationEmailFn.mockResolvedValue({ sent: true });
  tryEnqueueRecoveredFn.mockReset();
  tryEnqueueRecoveredFn.mockResolvedValue(undefined);
});

describe('billing_events - webhook producers', () => {
  it('T1: free → pro upgrade records plan_upgraded with from/to plan', async () => {
    const fake = makeFakeClient({
      id: 'user_A',
      email: 'a@test.com',
      plan: 'free',
      settings: {},
    });
    safeConnectFn.mockResolvedValue(fake);

    const req = buildSignedRequest({
      type: 'subscription.active',
      data: { subscription_id: 'sub_NEW', customer_id: 'cus_X', product_id: 'prod_pro', status: 'active' },
      metadata: { userId: 'user_A' },
    });
    const res = await webhookPost(req);
    expect(res.status).toBe(200);

    const insert = findBillingInsert(
      fake.recorded,
      (params) => params[1] === 'user_A' && params[2] === 'plan_upgraded' && params[3] === 'free' && params[4] === 'pro',
    );
    expect(insert, 'expected plan_upgraded billing_events insert').toBeTruthy();
    expect(insert!.params[5]).toBe('sub_NEW'); // subscription_id
    expect(insert!.params[7]).toBe('webhook'); // source
  });

  it('T2: pro → agency upgrade records plan_upgraded', async () => {
    const fake = makeFakeClient({
      id: 'user_A',
      email: 'a@test.com',
      plan: 'pro',
      settings: { subscription_id: 'sub_NEW' },
    });
    safeConnectFn.mockResolvedValue(fake);

    const req = buildSignedRequest({
      type: 'subscription.plan_changed',
      data: { subscription_id: 'sub_NEW', customer_id: 'cus_X', product_id: 'prod_agency', status: 'active' },
      metadata: { userId: 'user_A' },
    });
    const res = await webhookPost(req);
    expect(res.status).toBe(200);

    const insert = findBillingInsert(
      fake.recorded,
      (params) => params[2] === 'plan_upgraded' && params[3] === 'pro' && params[4] === 'agency',
    );
    expect(insert, 'expected pro → agency plan_upgraded row').toBeTruthy();
  });

  it('T3: agency → starter downgrade records plan_downgraded', async () => {
    const fake = makeFakeClient({
      id: 'user_A',
      email: 'a@test.com',
      plan: 'agency',
      settings: { subscription_id: 'sub_NEW' },
    });
    safeConnectFn.mockResolvedValue(fake);

    const req = buildSignedRequest({
      type: 'subscription.plan_changed',
      data: { subscription_id: 'sub_NEW', customer_id: 'cus_X', product_id: 'prod_starter', status: 'active' },
      metadata: { userId: 'user_A' },
    });
    const res = await webhookPost(req);
    expect(res.status).toBe(200);

    const insert = findBillingInsert(
      fake.recorded,
      (params) => params[2] === 'plan_downgraded' && params[3] === 'agency' && params[4] === 'starter',
    );
    expect(insert, 'expected agency → starter plan_downgraded row').toBeTruthy();
  });

  it('T4: webhook genuine cancellation records plan_cancelled', async () => {
    const fake = makeFakeClient({
      id: 'user_A',
      email: 'a@test.com',
      plan: 'pro',
      settings: { subscription_id: 'sub_X' },
    });
    safeConnectFn.mockResolvedValue(fake);

    const req = buildSignedRequest({
      type: 'subscription.cancelled',
      data: { subscription_id: 'sub_X', status: 'cancelled' },
      metadata: { userId: 'user_A' },
    });
    const res = await webhookPost(req);
    expect(res.status).toBe(200);

    const insert = findBillingInsert(
      fake.recorded,
      (params) => params[2] === 'plan_cancelled' && params[3] === 'pro' && params[4] === 'free',
    );
    expect(insert, 'expected plan_cancelled billing_events row').toBeTruthy();
    expect(insert!.params[5]).toBe('sub_X');
  });

  it('T5a: superseded_sub with paid previousPlan records superseded_sub_cancelled', async () => {
    // The user just upgraded; the new sub is bound. Dodo emits a delayed
    // cancel for the OLD sub_id - that's an orphan, not a user-state change.
    const fake = makeFakeClient({
      id: 'user_A',
      email: 'a@test.com',
      plan: 'agency',
      settings: { subscription_id: 'sub_NEW' },
    });
    safeConnectFn.mockResolvedValue(fake);

    const req = buildSignedRequest({
      type: 'subscription.cancelled',
      data: { subscription_id: 'sub_OLD', status: 'cancelled' },
      metadata: { userId: 'user_A' },
    });
    const res = await webhookPost(req);
    expect(res.status).toBe(200);

    const insert = findBillingInsert(
      fake.recorded,
      (params) => params[2] === 'superseded_sub_cancelled' && params[5] === 'sub_OLD',
    );
    expect(insert, 'expected superseded_sub_cancelled row for orphan').toBeTruthy();
    // No plan_cancelled row should be issued in this case.
    const cancelled = findBillingInsert(fake.recorded, (params) => params[2] === 'plan_cancelled');
    expect(cancelled, 'must not emit plan_cancelled for orphan').toBeFalsy();
  });

  it('T5b: superseded_sub with previousPlan === free SUPPRESSES the orphan row', async () => {
    // Cancel route ran first, stripped subscription_id, set plan=free.
    // The webhook then arrives for the same logical cancellation. The
    // cancel route already wrote a plan_cancelled row - emitting a
    // superseded_sub_cancelled here would be user-visible noise.
    const fake = makeFakeClient({
      id: 'user_A',
      email: 'a@test.com',
      plan: 'free',
      settings: {},
    });
    safeConnectFn.mockResolvedValue(fake);

    const req = buildSignedRequest({
      type: 'subscription.cancelled',
      data: { subscription_id: 'sub_X', status: 'cancelled' },
      metadata: { userId: 'user_A' },
    });
    const res = await webhookPost(req);
    expect(res.status).toBe(200);

    const insert = findBillingInsert(fake.recorded, (params) => params[2] === 'superseded_sub_cancelled');
    expect(insert, 'must NOT emit superseded_sub_cancelled when previousPlan === free').toBeFalsy();
  });
});

describe('billing_events - cancel route producer', () => {
  it('T6: cancel route post-commit records plan_cancelled with no dodo_event_id', async () => {
    verifyRequestAuthFn.mockReturnValue({ id: 'user_A' });
    const fake = makeFakeClient(null);
    // Customise: the cancel route reads (email, plan, settings) and we
    // need a paid user with a bound subscription.
    fake.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      fake.recorded.push({ sql, params });
      if (/SELECT email, plan, settings FROM users/.test(sql)) {
        return { rows: [{ email: 'a@test.com', plan: 'pro', settings: { subscription_id: 'sub_X' } }] };
      }
      if (/INSERT INTO billing_events/.test(sql)) {
        return { rows: [{ id: params[0] }] };
      }
      return { rows: [] };
    });
    safeConnectFn.mockResolvedValue(fake);

    // Pool-side INSERT INTO billing_events also possible (post-commit).
    poolQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (/INSERT INTO billing_events/.test(sql)) {
        return { rows: [{ id: params[0] }] };
      }
      return { rows: [] };
    });

    // Mock the Dodo PATCH so the route's transactional cancel call resolves.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;

    try {
      const req = new Request('http://t/api/payments/cancel', { method: 'POST' });
      const res = await cancelPost(req);
      expect(res.status).toBe(200);
    } finally {
      globalThis.fetch = originalFetch;
    }

    // Either the client (during tx) or pool (post-commit) gets the
    // billing_events INSERT. Cancel route uses pool post-commit.
    const poolCalls = poolQuery.mock.calls.filter(
      ([sql]) => /INSERT INTO billing_events/.test(sql as string),
    );
    expect(poolCalls.length, 'expected one billing_events insert post-commit').toBeGreaterThanOrEqual(1);
    const params = poolCalls[0][1] as unknown[];
    expect(params[1]).toBe('user_A');
    expect(params[2]).toBe('plan_cancelled');
    expect(params[3]).toBe('pro');
    expect(params[4]).toBe('free');
    expect(params[5]).toBe('sub_X');
    expect(params[6]).toBeNull(); // dodo_event_id
    expect(params[7]).toBe('cancel_route');
  });
});

describe('billing_events - invariant guard', () => {
  it('T7: every plan-mutating UPDATE in the webhook is followed by a billing_events INSERT', async () => {
    // Source-level invariant: a future change that adds a new plan-
    // mutating branch (UPDATE users SET plan = ...) without recording a
    // billing event would silently break Billing History again. This
    // test reads the webhook source and asserts the count of plan-
    // mutating UPDATE strings does not exceed the count of
    // recordBillingEvent call sites in the same file. That ratio
    // (2 plan UPDATEs : N recordBillingEvent calls, N >= 2) is the
    // structural property we want to lock down.
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const src = readFileSync(
      resolve(__dirname, '../src/app/api/payments/webhooks/dodopayments/route.ts'),
      'utf8',
    );
    const planUpdateMatches = src.match(/UPDATE users SET plan = \$1/g) ?? [];
    const recordCalls = src.match(/recordBillingEvent\(/g) ?? [];

    // Two plan-mutating UPDATEs exist today (upgrade branch, cancel
    // branch). At least two recordBillingEvent calls must be wired
    // alongside them, plus the on_hold/paused/superseded branches.
    expect(planUpdateMatches.length).toBe(2);
    expect(recordCalls.length).toBeGreaterThanOrEqual(planUpdateMatches.length);
  });
});
