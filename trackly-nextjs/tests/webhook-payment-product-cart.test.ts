/**
 * Regression tests for the product_cart resolver in the DodoPayments
 * webhook (audit item B).
 *
 * Pre-fix, the webhook read product_id only from `eventData.product_id ||
 * body.product_id`. Dodo's `payment.succeeded` events nest product info
 * under `data.product_cart[0].product_id` (mirroring the outbound
 * /checkouts payload), so productId resolved to undefined, the upgrade
 * branch fell into the unknown_product ROLLBACK + 500 path, and Dodo
 * retried the same event in a loop. New paying users were never actually
 * upgraded.
 *
 * Fix: a small `resolveProductId(eventData, body)` helper used at the
 * three product_id read sites (authoritative + 2 diagnostic). Lookup
 * order is `eventData.product_id` → `body.product_id` →
 * `eventData.product_cart[0].product_id` → `body.product_cart[0].product_id`.
 * Top-level wins over cart so the legacy/canonical subscription path
 * stays deterministic.
 *
 * The five cases below are the matrix the PR scope agreed on:
 *
 *   T1 - payment.succeeded with ONLY data.product_cart[0].product_id
 *        -> resolves and upgrades.
 *   T2 - payment.succeeded with ONLY data.product_id (legacy/canonical
 *        path) -> still resolves, plan upgrades. Regression check.
 *   T3 - both present, with DIFFERENT product_ids -> top-level wins
 *        (deterministic precedence).
 *   T4 - product_cart present but empty/malformed AND no product_id ->
 *        unknown_product 500 + ROLLBACK. Proves we did not start
 *        silently guessing when the payload is junk.
 *   T5 - subscription.active with only data.product_id -> unchanged,
 *        no regression on the subscription path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// PLAN_MAP and webhook secret are read at module load. Use vi.hoisted
// so the env is set BEFORE the route module is imported.
vi.hoisted(() => {
  const secretBase64 = Buffer.from('test_webhook_secret_value_12345').toString('base64');
  process.env.DODO_PAYMENTS_WEBHOOK_KEY = `whsec_${secretBase64}`;
  process.env.DODO_AGENCY_PRODUCT_ID = 'prod_agency';
  process.env.DODO_PRO_PRODUCT_ID = 'prod_pro';
  process.env.DODO_STARTER_PRODUCT_ID = 'prod_starter';
  process.env.DODO_ENTERPRISE_PRODUCT_ID = 'prod_enterprise';
});

const { safeConnectFn, poolQuery } = vi.hoisted(() => ({
  safeConnectFn: vi.fn(),
  poolQuery: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  pool: { query: (sql: string, params: unknown[] = []) => poolQuery(sql, params) },
  safeConnect: () => safeConnectFn(),
  auditLog: vi.fn().mockResolvedValue(true),
  ensureColumns: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
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

function makeFakeClient(currentUser: Record<string, unknown>): {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
  recorded: QueryRecord[];
} {
  const recorded: QueryRecord[] = [];
  const query = vi.fn((sql: string, params: unknown[] = []) => {
    recorded.push({ sql, params });
    if (/INSERT INTO webhook_events/.test(sql)) {
      return Promise.resolve({ rows: [{ event_id: params[0] }] });
    }
    if (/SELECT id, email, plan, settings FROM users/.test(sql)) {
      return Promise.resolve({ rows: [currentUser] });
    }
    if (/SELECT id, email, plan FROM users/.test(sql)) {
      return Promise.resolve({ rows: [currentUser] });
    }
    return Promise.resolve({ rows: [] });
  });
  const release = vi.fn();
  return { query, release, recorded };
}

const FREE_USER = {
  id: 'user_A',
  email: 'a@test.com',
  plan: 'free',
  settings: {},
};

beforeEach(() => {
  safeConnectFn.mockReset();
  poolQuery.mockReset();
});

describe('dodopayments webhook — payment.succeeded product_cart resolver', () => {
  it('T1: payment.succeeded resolves product_id from data.product_cart[0].product_id and upgrades', async () => {
    const fake = makeFakeClient(FREE_USER);
    safeConnectFn.mockResolvedValue(fake);

    const req = buildSignedRequest({
      type: 'payment.succeeded',
      data: {
        // No top-level product_id — only the cart shape, like Dodo's
        // real payment.succeeded payload.
        subscription_id: 'sub_NEW',
        customer_id: 'cus_NEW',
        product_cart: [{ product_id: 'prod_agency', quantity: 1 }],
        status: 'active',
      },
      metadata: { userId: 'user_A' },
    });

    const res = await webhookPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true });

    const agencyUpdate = fake.recorded.find(
      r => /UPDATE users SET plan = \$1/.test(r.sql) && r.params[0] === 'agency',
    );
    expect(agencyUpdate, 'expected upgrade to agency from cart-shaped payload').toBeTruthy();

    const productBound = fake.recorded.find(
      r => /UPDATE users SET settings = settings \|\| \$1::jsonb/.test(r.sql)
        && typeof r.params[0] === 'string'
        && r.params[0].includes('"dodo_product_id":"prod_agency"'),
    );
    expect(productBound, 'expected dodo_product_id bound from cart resolution').toBeTruthy();
  });

  it('T2: payment.succeeded with only top-level data.product_id still resolves (legacy path)', async () => {
    const fake = makeFakeClient(FREE_USER);
    safeConnectFn.mockResolvedValue(fake);

    const req = buildSignedRequest({
      type: 'payment.succeeded',
      data: {
        subscription_id: 'sub_NEW',
        customer_id: 'cus_NEW',
        product_id: 'prod_agency',
        status: 'active',
      },
      metadata: { userId: 'user_A' },
    });

    const res = await webhookPost(req);
    expect(res.status).toBe(200);

    const agencyUpdate = fake.recorded.find(
      r => /UPDATE users SET plan = \$1/.test(r.sql) && r.params[0] === 'agency',
    );
    expect(agencyUpdate, 'legacy top-level product_id path must still resolve').toBeTruthy();
  });

  it('T3: when both top-level product_id and product_cart[0].product_id are present, top-level wins', async () => {
    const fake = makeFakeClient(FREE_USER);
    safeConnectFn.mockResolvedValue(fake);

    // Top-level says 'pro', cart says 'agency'. The resolver must pick 'pro'
    // — top-level is the canonical/legacy field and we don't want a future
    // payload that includes both to flip semantics nondeterministically.
    const req = buildSignedRequest({
      type: 'payment.succeeded',
      data: {
        subscription_id: 'sub_NEW',
        customer_id: 'cus_NEW',
        product_id: 'prod_pro',
        product_cart: [{ product_id: 'prod_agency', quantity: 1 }],
        status: 'active',
      },
      metadata: { userId: 'user_A' },
    });

    const res = await webhookPost(req);
    expect(res.status).toBe(200);

    const proUpdate = fake.recorded.find(
      r => /UPDATE users SET plan = \$1/.test(r.sql) && r.params[0] === 'pro',
    );
    expect(proUpdate, 'top-level product_id must take precedence over cart').toBeTruthy();

    const agencyUpdate = fake.recorded.find(
      r => /UPDATE users SET plan = \$1/.test(r.sql) && r.params[0] === 'agency',
    );
    expect(agencyUpdate, 'cart product_id must NOT win when top-level is present').toBeUndefined();
  });

  it('T4: empty/malformed product_cart and no product_id falls through to unknown_product 500', async () => {
    // Three malformed shapes the resolver must NOT silently guess from.
    // Each must result in a 500 + ROLLBACK so Dodo retries (existing
    // unknown_product behaviour is preserved).
    const malformedShapes: Array<Record<string, unknown>> = [
      { subscription_id: 'sub_X', customer_id: 'cus_X', product_cart: [], status: 'active' },
      { subscription_id: 'sub_X', customer_id: 'cus_X', product_cart: 'not-an-array', status: 'active' },
      { subscription_id: 'sub_X', customer_id: 'cus_X', product_cart: [{ quantity: 1 }], status: 'active' },
    ];

    for (const data of malformedShapes) {
      const fake = makeFakeClient(FREE_USER);
      safeConnectFn.mockResolvedValue(fake);

      const req = buildSignedRequest({
        type: 'payment.succeeded',
        data,
        metadata: { userId: 'user_A' },
      });

      const res = await webhookPost(req);
      expect(res.status, `shape: ${JSON.stringify(data)}`).toBe(500);

      // Most importantly: no plan UPDATE should have fired.
      const anyPlanWrite = fake.recorded.find(r => /UPDATE users SET plan = \$1/.test(r.sql));
      expect(anyPlanWrite, `must not write plan for malformed shape: ${JSON.stringify(data)}`).toBeUndefined();
    }
  });

  it('T5: subscription.active with top-level data.product_id resolves unchanged (no subscription-path regression)', async () => {
    const fake = makeFakeClient(FREE_USER);
    safeConnectFn.mockResolvedValue(fake);

    // Subscription events use top-level product_id (canonical shape,
    // matches GET /subscriptions/{id} in cron/reconcile-payments).
    // No product_cart in this payload — the resolver's first branch
    // must succeed.
    const req = buildSignedRequest({
      type: 'subscription.active',
      data: {
        subscription_id: 'sub_NEW',
        customer_id: 'cus_NEW',
        product_id: 'prod_pro',
        status: 'active',
      },
      metadata: { userId: 'user_A' },
    });

    const res = await webhookPost(req);
    expect(res.status).toBe(200);

    const proUpdate = fake.recorded.find(
      r => /UPDATE users SET plan = \$1/.test(r.sql) && r.params[0] === 'pro',
    );
    expect(proUpdate, 'subscription.active path must continue to resolve top-level product_id').toBeTruthy();
  });
});
