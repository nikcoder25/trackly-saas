/**
 * Regression tests for the upgrade-cancels-old-sub path (audit item A).
 *
 * Pre-fix, when a paid user upgraded (e.g. Pro -> Agency), /api/payments/checkout
 * created a brand-new Dodo subscription via /checkouts but never cancelled the
 * existing one. Dodo continued to bill the old subscription monthly while we
 * activated the new one, and our reconcile cron only walked currently-bound
 * subscription_ids — it had no way to discover the orphan we forgot. Net effect:
 * silent double-billing until the customer noticed and complained.
 *
 * Fix: in the webhook handler's upgrade branch, when an activation-style event
 * (subscription.active / payment.succeeded) arrives with a different
 * subscription_id than the one already bound to the user, PATCH the old one
 * to status='cancelled' before overwriting the binding. Soft-fail policy on
 * non-2xx-and-non-404/409/410 responses so a Dodo API blip doesn't block a
 * just-paid-for upgrade — the orphan is recorded via auditLog for support.
 *
 * Renewal/plan_changed paths are intentionally NOT broadened: those still
 * 400 on subscription_id mismatch via SUBSCRIPTION_UPDATE_EVENTS, because a
 * renewal of a *different* subscription remains genuinely suspicious.
 *
 * The five cases below match the PR scope:
 *   T1 - upgrade cancels old sub successfully (PATCH issued, plan activates).
 *   T2 - upgrade proceeds when old-sub PATCH returns 404 (already gone).
 *   T3 - no PATCH attempted when old subscription_id is null/missing.
 *   T4 - 5xx from Dodo soft-fails: warn log + audit row, plan still activates.
 *   T5 - subscription.renewed with mismatched id still 400's (no broadening).
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

const { safeConnectFn, poolQuery, auditLogFn, loggerWarn, loggerInfo } = vi.hoisted(() => ({
  safeConnectFn: vi.fn(),
  poolQuery: vi.fn(),
  auditLogFn: vi.fn().mockResolvedValue(true),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn(),
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
    error: vi.fn(),
  },
}));

vi.mock('@/lib/email', () => ({
  sendPlanUpgradeEmail: vi.fn().mockResolvedValue({ sent: true }),
  sendPlanDowngradeEmail: vi.fn().mockResolvedValue({ sent: true }),
  sendPlanCancellationEmail: vi.fn().mockResolvedValue({ sent: true }),
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

// Captures every fetch the route makes so we can assert which Dodo URLs
// were hit (and assert that no Dodo PATCH fires when one isn't expected).
interface FetchCall { url: string; init: RequestInit | undefined }

function installFetchMock(handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>): {
  calls: FetchCall[];
  restore: () => void;
} {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    return await handler(url, init);
  }) as typeof globalThis.fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

beforeEach(() => {
  safeConnectFn.mockReset();
  poolQuery.mockReset();
  auditLogFn.mockReset();
  auditLogFn.mockResolvedValue(true);
  loggerWarn.mockReset();
  loggerInfo.mockReset();
});

describe('dodopayments webhook — upgrade cancels orphaned old subscription', () => {
  it('T1: upgrade cancels old sub via PATCH and activates the new plan', async () => {
    const fake = makeFakeClient({
      id: 'user_A',
      email: 'a@test.com',
      plan: 'pro',
      settings: {
        subscription_id: 'sub_OLD',
        dodo_customer_id: 'cus_X',
        dodo_product_id: 'prod_pro',
        subscription_status: 'active',
      },
    });
    safeConnectFn.mockResolvedValue(fake);

    const fetchMock = installFetchMock(async (url) => {
      if (/\/subscriptions\/sub_OLD$/.test(url)) {
        return new Response(JSON.stringify({ id: 'sub_OLD', status: 'cancelled' }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });

    try {
      const req = buildSignedRequest({
        type: 'subscription.active',
        data: {
          subscription_id: 'sub_NEW',
          customer_id: 'cus_X',
          product_id: 'prod_agency',
          status: 'active',
        },
        metadata: { userId: 'user_A' },
      });

      const res = await webhookPost(req);
      expect(res.status).toBe(200);

      // Exactly one cancel-old-sub PATCH was issued.
      const cancelCalls = fetchMock.calls.filter(c => /\/subscriptions\/sub_OLD$/.test(c.url));
      expect(cancelCalls.length).toBe(1);
      expect(cancelCalls[0].init?.method).toBe('PATCH');
      const sentBody = typeof cancelCalls[0].init?.body === 'string' ? cancelCalls[0].init.body : '';
      expect(sentBody).toContain('"status":"cancelled"');

      // New subscription was bound and plan upgraded.
      const agencyUpdate = fake.recorded.find(
        r => /UPDATE users SET plan = \$1/.test(r.sql) && r.params[0] === 'agency',
      );
      expect(agencyUpdate, 'expected upgrade to agency').toBeTruthy();

      const newSubBound = fake.recorded.find(
        r => /UPDATE users SET settings = settings \|\| \$1::jsonb/.test(r.sql)
          && typeof r.params[0] === 'string'
          && r.params[0].includes('"subscription_id":"sub_NEW"'),
      );
      expect(newSubBound, 'expected new subscription_id bound').toBeTruthy();

      // Audit row recorded for the orphan cancellation.
      const audited = auditLogFn.mock.calls.find(c => c[1] === 'old_subscription_cancelled');
      expect(audited, 'expected audit log row for old_subscription_cancelled').toBeTruthy();
    } finally {
      fetchMock.restore();
    }
  });

  it('T2: upgrade proceeds when old-sub PATCH returns 404 (already gone)', async () => {
    const fake = makeFakeClient({
      id: 'user_A',
      email: 'a@test.com',
      plan: 'pro',
      settings: {
        subscription_id: 'sub_OLD',
        dodo_customer_id: 'cus_X',
        dodo_product_id: 'prod_pro',
        subscription_status: 'active',
      },
    });
    safeConnectFn.mockResolvedValue(fake);

    const fetchMock = installFetchMock(async (url) => {
      if (/\/subscriptions\/sub_OLD$/.test(url)) {
        return new Response('{"error":"not_found"}', { status: 404 });
      }
      return new Response('{}', { status: 200 });
    });

    try {
      const req = buildSignedRequest({
        type: 'subscription.active',
        data: {
          subscription_id: 'sub_NEW',
          customer_id: 'cus_X',
          product_id: 'prod_agency',
          status: 'active',
        },
        metadata: { userId: 'user_A' },
      });

      const res = await webhookPost(req);
      expect(res.status).toBe(200);

      // PATCH was attempted exactly once.
      const cancelCalls = fetchMock.calls.filter(c => /\/subscriptions\/sub_OLD$/.test(c.url));
      expect(cancelCalls.length).toBe(1);

      // 404 => 'already gone' info log; NO warn-class log fires.
      const alreadyGone = loggerInfo.mock.calls.find(c => c[0] === 'webhook.dodo.old_sub_already_gone');
      expect(alreadyGone, 'expected webhook.dodo.old_sub_already_gone info log').toBeTruthy();
      const warnFired = loggerWarn.mock.calls.find(c => c[0] === 'webhook.dodo.old_sub_cancel_failed');
      expect(warnFired, '404 must not fire the cancel_failed warn').toBeFalsy();

      // Plan still upgraded.
      const agencyUpdate = fake.recorded.find(
        r => /UPDATE users SET plan = \$1/.test(r.sql) && r.params[0] === 'agency',
      );
      expect(agencyUpdate, 'expected plan upgrade despite 404 on old sub').toBeTruthy();
    } finally {
      fetchMock.restore();
    }
  });

  it('T3: no PATCH attempted when the user has no existing subscription_id', async () => {
    // Trial-or-fresh user signing up to a paid plan for the first time.
    // settings has no subscription_id, so there's nothing to cancel.
    const fake = makeFakeClient({
      id: 'user_A',
      email: 'a@test.com',
      plan: 'free',
      settings: {},
    });
    safeConnectFn.mockResolvedValue(fake);

    const fetchMock = installFetchMock(async () => new Response('{}', { status: 200 }));

    try {
      const req = buildSignedRequest({
        type: 'subscription.active',
        data: {
          subscription_id: 'sub_NEW',
          customer_id: 'cus_X',
          product_id: 'prod_agency',
          status: 'active',
        },
        metadata: { userId: 'user_A' },
      });

      const res = await webhookPost(req);
      expect(res.status).toBe(200);

      // ZERO PATCH calls to /subscriptions/* — no double-cancel, no
      // wasted Dodo API call when there's no orphan to clean up.
      const subscriptionPatchCalls = fetchMock.calls.filter(c =>
        /\/subscriptions\//.test(c.url) && c.init?.method === 'PATCH',
      );
      expect(subscriptionPatchCalls.length).toBe(0);

      // Plan still upgrades normally.
      const agencyUpdate = fake.recorded.find(
        r => /UPDATE users SET plan = \$1/.test(r.sql) && r.params[0] === 'agency',
      );
      expect(agencyUpdate, 'fresh upgrade must still activate').toBeTruthy();
    } finally {
      fetchMock.restore();
    }
  });

  it('T4: 5xx from Dodo soft-fails — warn log + audit row, plan still activates', async () => {
    const fake = makeFakeClient({
      id: 'user_A',
      email: 'a@test.com',
      plan: 'pro',
      settings: {
        subscription_id: 'sub_OLD',
        dodo_customer_id: 'cus_X',
        dodo_product_id: 'prod_pro',
        subscription_status: 'active',
      },
    });
    safeConnectFn.mockResolvedValue(fake);

    const fetchMock = installFetchMock(async (url) => {
      if (/\/subscriptions\/sub_OLD$/.test(url)) {
        return new Response('upstream timeout', { status: 503 });
      }
      return new Response('{}', { status: 200 });
    });

    try {
      const req = buildSignedRequest({
        type: 'subscription.active',
        data: {
          subscription_id: 'sub_NEW',
          customer_id: 'cus_X',
          product_id: 'prod_agency',
          status: 'active',
        },
        metadata: { userId: 'user_A' },
      });

      const res = await webhookPost(req);
      // Soft-fail: webhook still returns 200 so Dodo doesn't retry the
      // ENTIRE event (which would re-charge bookkeeping); the orphan is
      // tracked separately via auditLog.
      expect(res.status).toBe(200);

      // Warn-class log + audit row for the orphan.
      const warnFired = loggerWarn.mock.calls.find(c => c[0] === 'webhook.dodo.old_sub_cancel_failed');
      expect(warnFired, 'expected cancel_failed warn on 5xx').toBeTruthy();
      const orphanAudit = auditLogFn.mock.calls.find(c => c[1] === 'orphan_subscription_cancel_failed');
      expect(orphanAudit, 'expected orphan audit row on 5xx').toBeTruthy();

      // Plan still upgrades.
      const agencyUpdate = fake.recorded.find(
        r => /UPDATE users SET plan = \$1/.test(r.sql) && r.params[0] === 'agency',
      );
      expect(agencyUpdate, 'plan must still upgrade on soft-fail').toBeTruthy();
    } finally {
      fetchMock.restore();
    }
  });

  it('T5: subscription.renewed with mismatched subscription_id still 400s (no broadening)', async () => {
    // Regression: renewals/plan_changed for a *different* subscription
    // remain genuinely suspicious. The pre-existing 400 mismatch guard
    // must continue to fire — we are NOT broadening cancel-old-sub to
    // these event types.
    const fake = makeFakeClient({
      id: 'user_A',
      email: 'a@test.com',
      plan: 'pro',
      settings: {
        subscription_id: 'sub_OLD',
        dodo_customer_id: 'cus_X',
        dodo_product_id: 'prod_pro',
        subscription_status: 'active',
      },
    });
    safeConnectFn.mockResolvedValue(fake);

    const fetchMock = installFetchMock(async () => new Response('{}', { status: 200 }));

    try {
      const req = buildSignedRequest({
        type: 'subscription.renewed',
        data: {
          subscription_id: 'sub_DIFFERENT',
          customer_id: 'cus_X',
          product_id: 'prod_agency',
          status: 'active',
        },
        metadata: { userId: 'user_A' },
      });

      const res = await webhookPost(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Subscription mismatch');

      // No Dodo PATCH should have been issued — cancel-old-sub must
      // NOT fire on renewal mismatches.
      const subscriptionPatchCalls = fetchMock.calls.filter(c =>
        /\/subscriptions\//.test(c.url) && c.init?.method === 'PATCH',
      );
      expect(subscriptionPatchCalls.length).toBe(0);

      // No plan write fires because the handler ROLLBACKs.
      const anyPlanWrite = fake.recorded.find(r => /UPDATE users SET plan = \$1/.test(r.sql));
      expect(anyPlanWrite, 'must not write plan on renewal mismatch').toBeUndefined();
    } finally {
      fetchMock.restore();
    }
  });
});
