/**
 * Regression tests: events for a superseded (older) subscription must not
 * rebind the user or cancel their current subscription.
 *
 * Pre-fix, any payment.succeeded / subscription.active / subscription.updated
 * (active) whose subscription_id differed from settings.subscription_id was
 * treated as a new checkout: the handler cancelled the BOUND sub at Dodo and
 * rebound the user to the incoming one. Scenario: Starter (sub_A) upgraded to
 * Pro (sub_B), the cancel of sub_A soft-failed, and next month sub_A's renewal
 * payment.succeeded cancelled sub_B and dropped the user to Starter.
 *
 * Also covers recordBillingEvent on the SERIALIZABLE tx client: a failed
 * INSERT used to be swallowed while leaving the tx aborted, so COMMIT became
 * a silent ROLLBACK (plan change lost) while the webhook returned 200.
 *
 *   S1 - old-sub renewal after upgrade (tracked in subscription_events):
 *        Pro stays bound, old sub cancelled at Dodo, billing row recorded.
 *   S2 - same, legacy user with only billing_events history for the old sub.
 *   S3 - no history; Dodo created_at (via API) says incoming is older.
 *   S4 - genuinely new sub (newer created_at) still rebinds and cancels old.
 *   S5 - billing_events INSERT failure does not lose the plan update.
 *   S6 - serialization failure in the billing INSERT retries the whole tx.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

const { safeConnectFn, poolQuery, auditLogFn, loggerWarn, loggerInfo, loggerError } = vi.hoisted(() => ({
  safeConnectFn: vi.fn(),
  poolQuery: vi.fn(),
  auditLogFn: vi.fn().mockResolvedValue(true),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  pool: { query: (sql: string, params: unknown[] = []) => poolQuery(sql, params) },
  safeConnect: () => safeConnectFn(),
  auditLog: (...args: unknown[]) => auditLogFn(...args),
  ensureColumns: vi.fn().mockResolvedValue(undefined),
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
  sendPlanCancellationEmail: vi.fn().mockResolvedValue({ sent: true }),
  planCancellationIdempotencyKey: (userId: string, sub: string | null | undefined) =>
    `plan_cancellation:${userId}:${sub || 'no_sub'}`,
  tryEnqueueRecoveredCancellationEmail: vi.fn().mockResolvedValue(undefined),
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

function signStandardWebhook(rawBody: string, webhookId: string, webhookTimestamp: string): string {
  const secret = process.env.DODO_PAYMENTS_WEBHOOK_KEY!;
  const keyBytes = Buffer.from(secret.slice(6), 'base64');
  const sig = crypto.createHmac('sha256', keyBytes)
    .update(`${webhookId}.${webhookTimestamp}.${rawBody}`)
    .digest('base64');
  return `v1,${sig}`;
}

function buildSignedRequest(opts: {
  type: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Request {
  const webhookId = `wh_${Math.random().toString(36).slice(2)}`;
  const webhookTimestamp = String(Math.floor(Date.now() / 1000));
  const rawBody = JSON.stringify({
    type: opts.type,
    business_id: 'biz_test',
    timestamp: new Date().toISOString(),
    data: opts.data,
    metadata: opts.metadata,
  });
  return new Request('http://t/api/payments/webhooks/dodopayments', {
    method: 'POST',
    headers: new Headers({
      'content-type': 'application/json',
      'webhook-id': webhookId,
      'webhook-timestamp': webhookTimestamp,
      'webhook-signature': signStandardWebhook(rawBody, webhookId, webhookTimestamp),
    }),
    body: rawBody,
  });
}

interface QueryRecord { sql: string; params: unknown[] }

interface PgLikeClient {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
  recorded: QueryRecord[];
  state: { committed: boolean | null };
}

// Fake pg client that models Postgres transaction-abort semantics: once a
// statement fails, every later statement errors with 25P02 until a
// ROLLBACK TO SAVEPOINT, and COMMIT on an aborted tx silently rolls back
// (state.committed === false) instead of throwing, exactly like pg.
function makePgLikeClient(
  currentUser: Record<string, unknown>,
  opts: { billingHistoryFor?: string[]; billingInsertError?: { code: string; message: string } } = {},
): PgLikeClient {
  const recorded: QueryRecord[] = [];
  const state = { committed: null as boolean | null };
  let aborted = false;
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    recorded.push({ sql, params });
    const trimmed = sql.trim();
    if (/^ROLLBACK TO SAVEPOINT/.test(trimmed)) {
      aborted = false;
      return { rows: [] };
    }
    if (trimmed === 'COMMIT') {
      state.committed = !aborted;
      aborted = false;
      return { rows: [] };
    }
    if (trimmed === 'ROLLBACK') {
      state.committed = false;
      aborted = false;
      return { rows: [] };
    }
    if (aborted) {
      throw Object.assign(new Error('current transaction is aborted'), { code: '25P02' });
    }
    if (/INSERT INTO webhook_events/.test(sql)) return { rows: [{ event_id: params[0] }] };
    if (/INSERT INTO billing_events/.test(sql)) {
      if (opts.billingInsertError) {
        aborted = true;
        throw Object.assign(new Error(opts.billingInsertError.message), { code: opts.billingInsertError.code });
      }
      return { rows: [{ id: params[0] }] };
    }
    if (/SELECT 1 FROM billing_events/.test(sql)) {
      return { rows: (opts.billingHistoryFor ?? []).includes(params[1] as string) ? [{ '?column?': 1 }] : [] };
    }
    if (/SELECT (id, email, plan, settings|settings) FROM users/.test(sql)) return { rows: [currentUser] };
    return { rows: [] };
  });
  return { query, release: vi.fn(), recorded, state };
}

interface FetchCall { url: string; method: string }
let fetchCalls: FetchCall[] = [];
const originalFetch = globalThis.fetch;

function installFetch(createdAt: Record<string, string> = {}): void {
  fetchCalls = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    fetchCalls.push({ url, method });
    const id = url.split('/subscriptions/')[1];
    if (method === 'GET') {
      return createdAt[id]
        ? new Response(JSON.stringify({ subscription_id: id, created_at: createdAt[id] }), { status: 200 })
        : new Response('{"error":"not_found"}', { status: 404 });
    }
    return new Response(JSON.stringify({ subscription_id: id, status: 'cancelled' }), { status: 200 });
  }) as typeof globalThis.fetch;
}

const patchesTo = (sub: string) =>
  fetchCalls.filter(c => c.method === 'PATCH' && c.url.endsWith(`/subscriptions/${sub}`));
const planWrites = (c: PgLikeClient) => c.recorded.filter(r => /UPDATE users SET plan = \$1/.test(r.sql));
const settingsWrites = (c: PgLikeClient) =>
  c.recorded.filter(r => /UPDATE users SET settings = settings \|\| \$1::jsonb/.test(r.sql));
const billingInserts = (c: PgLikeClient) => c.recorded.filter(r => /INSERT INTO billing_events/.test(r.sql));

// Pro user bound to sub_B after upgrading from Starter sub_A.
function proUserAfterUpgrade(extraSettings: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'user_A',
    email: 'a@test.com',
    plan: 'pro',
    settings: {
      subscription_id: 'sub_B',
      dodo_customer_id: 'cus_X',
      dodo_product_id: 'prod_pro',
      subscription_status: 'active',
      ...extraSettings,
    },
  };
}

function oldSubRenewal(): Request {
  return buildSignedRequest({
    type: 'payment.succeeded',
    data: {
      payload_type: 'Payment',
      payment_id: 'pay_renewal',
      subscription_id: 'sub_A',
      customer_id: 'cus_X',
      // Payment created_at is the renewal charge time, NOT the sub's.
      created_at: new Date().toISOString(),
      product_cart: [{ product_id: 'prod_starter', quantity: 1 }],
    },
    metadata: { userId: 'user_A' },
  });
}

function expectSupersededHandled(fake: PgLikeClient): void {
  // Bound Pro sub untouched; old sub cancelled at Dodo instead.
  expect(patchesTo('sub_B').length).toBe(0);
  expect(patchesTo('sub_A').length).toBe(1);
  // Plan and binding untouched.
  expect(planWrites(fake).length).toBe(0);
  for (const w of settingsWrites(fake)) {
    const merged = JSON.parse(w.params[0] as string);
    expect(merged.subscription_id).toBeUndefined();
    expect(merged.subscription_events.sub_A.status).not.toBe('active');
    expect(merged.subscription_events.sub_A.superseded_by).toBe('sub_B');
  }
  const row = billingInserts(fake).find(r => r.params[2] === 'superseded_sub_cancelled');
  expect(row, 'expected superseded_sub_cancelled billing row').toBeTruthy();
  expect(row!.params[5]).toBe('sub_A');
  expect(fake.state.committed).toBe(true);
}

beforeEach(() => {
  safeConnectFn.mockReset();
  poolQuery.mockReset();
  auditLogFn.mockReset();
  auditLogFn.mockResolvedValue(true);
  loggerWarn.mockReset();
  loggerInfo.mockReset();
  loggerError.mockReset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('dodopayments webhook - events for a superseded subscription', () => {
  it('S1: old-sub renewal after upgrade keeps Pro bound and cancels the old sub', async () => {
    const fake = makePgLikeClient(proUserAfterUpgrade({
      subscription_events: {
        sub_A: { status: 'superseded', last_event_at: '2026-09-01T00:00:00.000Z', superseded_by: 'sub_B' },
        sub_B: { status: 'active', last_event_at: '2026-10-01T00:00:00.000Z' },
      },
    }));
    safeConnectFn.mockResolvedValue(fake);
    installFetch();

    const res = await webhookPost(oldSubRenewal());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, skipped: 'superseded_sub' });
    expectSupersededHandled(fake);
  });

  it('S1b: an entry left active by a pre-fix rebind is still recognised as superseded', async () => {
    const fake = makePgLikeClient(proUserAfterUpgrade({
      subscription_events: {
        sub_A: { status: 'active', last_event_at: '2026-09-01T00:00:00.000Z' },
        sub_B: { status: 'active', last_event_at: '2026-10-01T00:00:00.000Z' },
      },
    }));
    safeConnectFn.mockResolvedValue(fake);
    installFetch();

    const res = await webhookPost(oldSubRenewal());
    expect(res.status).toBe(200);
    expectSupersededHandled(fake);
  });

  it('S2: legacy user with only billing_events history for the old sub', async () => {
    const fake = makePgLikeClient(proUserAfterUpgrade(), { billingHistoryFor: ['sub_A'] });
    safeConnectFn.mockResolvedValue(fake);
    installFetch();

    const res = await webhookPost(oldSubRenewal());
    expect(res.status).toBe(200);
    expectSupersededHandled(fake);
  });

  it('S3: no history, Dodo created_at shows the incoming sub is older', async () => {
    const fake = makePgLikeClient(proUserAfterUpgrade());
    safeConnectFn.mockResolvedValue(fake);
    installFetch({ sub_A: '2026-01-01T00:00:00.000Z', sub_B: '2026-10-01T00:00:00.000Z' });

    const res = await webhookPost(oldSubRenewal());
    expect(res.status).toBe(200);
    expectSupersededHandled(fake);
  });

  it('S4: a genuinely newer subscription still rebinds and cancels the old one', async () => {
    const fake = makePgLikeClient({
      id: 'user_A',
      email: 'a@test.com',
      plan: 'starter',
      settings: {
        subscription_id: 'sub_A',
        dodo_customer_id: 'cus_X',
        dodo_product_id: 'prod_starter',
        subscription_status: 'active',
        subscription_events: {
          sub_A: { status: 'active', last_event_at: '2026-01-01T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z' },
        },
      },
    });
    safeConnectFn.mockResolvedValue(fake);
    installFetch();

    const res = await webhookPost(buildSignedRequest({
      type: 'subscription.active',
      data: {
        payload_type: 'Subscription',
        subscription_id: 'sub_B',
        customer_id: 'cus_X',
        product_id: 'prod_pro',
        status: 'active',
        created_at: '2026-10-01T00:00:00.000Z',
      },
      metadata: { userId: 'user_A' },
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });

    expect(patchesTo('sub_A').length).toBe(1);
    expect(patchesTo('sub_B').length).toBe(0);
    expect(planWrites(fake).map(w => w.params[0])).toEqual(['pro']);
    const bind = settingsWrites(fake)
      .map(w => JSON.parse(w.params[0] as string))
      .find(m => m.subscription_id === 'sub_B');
    expect(bind, 'expected sub_B bound').toBeTruthy();
    expect(bind.subscription_events.sub_A).toMatchObject({ status: 'superseded', superseded_by: 'sub_B' });
    expect(bind.subscription_events.sub_B).toMatchObject({ status: 'active', created_at: '2026-10-01T00:00:00.000Z' });
    expect(billingInserts(fake).find(r => r.params[2] === 'plan_upgraded')).toBeTruthy();
    expect(fake.state.committed).toBe(true);
  });

  it('S5: a failing billing_events INSERT does not silently roll back the plan update', async () => {
    const fake = makePgLikeClient(
      { id: 'user_A', email: 'a@test.com', plan: 'free', settings: {} },
      { billingInsertError: { code: '42P01', message: 'relation "billing_events" does not exist' } },
    );
    safeConnectFn.mockResolvedValue(fake);
    installFetch();

    const res = await webhookPost(buildSignedRequest({
      type: 'subscription.active',
      data: { subscription_id: 'sub_NEW', customer_id: 'cus_X', product_id: 'prod_pro', status: 'active' },
      metadata: { userId: 'user_A' },
    }));
    expect(res.status).toBe(200);
    expect(planWrites(fake).map(w => w.params[0])).toEqual(['pro']);
    expect(fake.recorded.some(r => /^ROLLBACK TO SAVEPOINT/.test(r.sql))).toBe(true);
    // The COMMIT ran on a healthy tx, so the plan change was persisted.
    expect(fake.state.committed).toBe(true);
    expect(loggerError.mock.calls.find(c => c[0] === 'billing_events.record_failed')).toBeTruthy();
  });

  it('S6: a serialization failure in the billing INSERT retries the whole transaction', async () => {
    const first = makePgLikeClient(
      { id: 'user_A', email: 'a@test.com', plan: 'free', settings: {} },
      { billingInsertError: { code: '40001', message: 'could not serialize access' } },
    );
    const second = makePgLikeClient({ id: 'user_A', email: 'a@test.com', plan: 'free', settings: {} });
    safeConnectFn.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    installFetch();

    const res = await webhookPost(buildSignedRequest({
      type: 'subscription.active',
      data: { subscription_id: 'sub_NEW', customer_id: 'cus_X', product_id: 'prod_pro', status: 'active' },
      metadata: { userId: 'user_A' },
    }));
    expect(res.status).toBe(200);
    expect(first.state.committed).toBe(false);
    expect(second.state.committed).toBe(true);
    expect(billingInserts(second).length).toBe(1);
  });
});
