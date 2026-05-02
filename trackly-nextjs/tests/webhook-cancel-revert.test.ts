/**
 * Regression tests for the cancel-revert bug:
 *
 *   - When a user explicitly cancels their plan, /api/payments/cancel
 *     PATCHes the Dodo subscription with status='cancelled' AND wipes
 *     subscription_id / dodo_customer_id / dodo_product_id from
 *     users.settings, leaving plan='free' + subscription_status='cancelled'.
 *
 *   - Dodo then fires a 'subscription.updated' webhook for the PATCH.
 *     The pre-fix handler had 'subscription.updated' in UPGRADE_EVENTS
 *     and resolved the plan from product_id, which re-set plan='agency'
 *     (or whatever the cancelled product mapped to) and re-attached the
 *     subscription IDs a few seconds after the user clicked cancel.
 *
 * The fix has two layers:
 *
 *   1. Dispatch remap. 'subscription.updated' is no longer in UPGRADE_EVENTS;
 *      every event whose payload status is in INACTIVE_SUBSCRIPTION_STATUSES
 *      remaps to 'subscription.cancelled' so the downgrade branch handles it.
 *      An active 'subscription.updated' remaps to 'subscription.active'.
 *
 *   2. Defense-in-depth post-cancel guard. Inside the upgrade branch, if the
 *      user's settings already say {subscription_status:'cancelled', no
 *      subscription_id}, only a fresh 'payment.succeeded' (which signals a
 *      brand-new subscription, not a retried legacy event) may resurrect a
 *      paid plan.
 *
 * The three cases below correspond to the matrix in the PR scope:
 *   T1 - inactive 'subscription.updated' must downgrade to free.
 *   T2 - active 'subscription.updated' on a post-cancel user must NOT upgrade.
 *   T3 - 'payment.succeeded' for a fresh subscription_id MUST upgrade,
 *        even when settings.subscription_status='cancelled' from a prior cycle.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import crypto from 'crypto';

// The route reads PLAN_MAP and DODO_PAYMENTS_WEBHOOK_KEY from env at
// module load. ESM imports are hoisted above top-level statements in
// vitest, so plain `process.env.X = ...` here would run AFTER the route
// module had already snapshotted them. vi.hoisted runs before imports,
// which is the only way to make the route see these values.
vi.hoisted(() => {
  const secretBase64 = Buffer.from('test_webhook_secret_value_12345').toString('base64');
  process.env.DODO_PAYMENTS_WEBHOOK_KEY = `whsec_${secretBase64}`;
  process.env.DODO_AGENCY_PRODUCT_ID = 'prod_agency';
  process.env.DODO_PRO_PRODUCT_ID = 'prod_pro';
  process.env.DODO_STARTER_PRODUCT_ID = 'prod_starter';
  process.env.DODO_ENTERPRISE_PRODUCT_ID = 'prod_enterprise';
});

// vi.hoisted is the only way to share fns with a vi.mock factory because
// vi.mock is hoisted above every import at transform time.
const { clientQuery, safeConnectFn, poolQuery } = vi.hoisted(() => ({
  clientQuery: vi.fn(),
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
  // The route only consumes comparePlans. Keep the rank logic faithful
  // so direction classification still picks the right email kind.
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

// Standard Webhooks signing: HMAC-SHA256 over `${id}.${ts}.${body}`,
// base64-encoded, prefixed with 'v1,'. The secret in the env is
// 'whsec_<base64>'; the bytes used for HMAC are the base64-decoded
// portion after the prefix.
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

function makeFakeClient(rows: { user?: Record<string, unknown> } = {}): {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
  recorded: QueryRecord[];
} {
  const recorded: QueryRecord[] = [];
  const query = vi.fn((sql: string, params: unknown[] = []) => {
    recorded.push({ sql, params });
    if (/INSERT INTO webhook_events/.test(sql)) {
      // Idempotency insert: pretend this is a fresh event.
      return Promise.resolve({ rows: [{ event_id: params[0] }] });
    }
    if (/SELECT id, email, plan, settings FROM users/.test(sql) && rows.user) {
      return Promise.resolve({ rows: [rows.user] });
    }
    if (/SELECT id, email, plan FROM users/.test(sql) && rows.user) {
      return Promise.resolve({ rows: [rows.user] });
    }
    // Per-subscription stale-event skip (Bug 1a) reads only `settings`.
    if (/SELECT settings FROM users WHERE id = \$1/.test(sql) && rows.user) {
      return Promise.resolve({ rows: [{ settings: rows.user.settings }] });
    }
    // BEGIN / UPDATE / COMMIT / ROLLBACK / fallback selects.
    return Promise.resolve({ rows: [] });
  });
  const release = vi.fn();
  return { query, release, recorded };
}

beforeAll(() => {
  // sanity: mocks are wired
  expect(typeof webhookPost).toBe('function');
});

beforeEach(() => {
  clientQuery.mockReset();
  safeConnectFn.mockReset();
  poolQuery.mockReset();
});

describe('dodopayments webhook — cancel-revert regression', () => {
  it('T1: subscription.updated with status=cancelled triggers a downgrade to free', async () => {
    // Pre-cancel state: user is on agency, subscription bound, status active.
    const fake = makeFakeClient({
      user: {
        id: 'user_A',
        email: 'a@test.com',
        plan: 'agency',
        settings: {
          subscription_id: 'sub_old',
          dodo_customer_id: 'cus_old',
          dodo_product_id: 'prod_agency',
          subscription_status: 'active',
        },
      },
    });
    safeConnectFn.mockResolvedValue(fake);

    const req = buildSignedRequest({
      type: 'subscription.updated',
      data: {
        subscription_id: 'sub_old',
        customer_id: 'cus_old',
        product_id: 'prod_agency',
        status: 'cancelled',
      },
      metadata: { userId: 'user_A' },
    });

    const res = await webhookPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true });

    // Downgrade branch must have run: plan -> 'free' AND settings stripped.
    const planUpdate = fake.recorded.find(
      r => /UPDATE users SET plan = \$1/.test(r.sql) && r.params[0] === 'free',
    );
    expect(planUpdate, 'expected UPDATE users SET plan=free').toBeTruthy();

    const settingsStrip = fake.recorded.find(r =>
      /settings - 'subscription_id' - 'dodo_customer_id' - 'dodo_product_id'/.test(r.sql),
    );
    expect(settingsStrip, 'expected settings strip').toBeTruthy();

    // Crucial negative: the upgrade branch's "set status=active" write must
    // NOT have fired. Pre-fix, this is what flipped agency back on.
    // Note: route passes JSON.stringify(settingsUpdate) so params[0] is a
    // raw JSON string, not an object — assert as a string substring.
    const reactivate = fake.recorded.find(
      r => /UPDATE users SET settings = settings \|\| \$1::jsonb/.test(r.sql)
        && typeof r.params[0] === 'string'
        && r.params[0].includes('"subscription_status":"active"'),
    );
    expect(reactivate, 'must NOT have re-activated subscription').toBeUndefined();
  });

  it('T2: subscription.updated with status=active on a post-cancel user is ignored (post_cancel guard)', async () => {
    // Post-cancel state: cancel route already wiped subscription_id and
    // marked status='cancelled'. A late retry of subscription.updated with
    // status='active' must NOT resurrect the agency plan.
    // Post-fix the post-cancel guard is subscription-SCOPED, not
    // user-scoped: a late `subscription.updated` for a sub_id that was
    // previously cancelled in subscription_events still gets blocked.
    // Pre-fix this test pinned the user-scoped guard, which incorrectly
    // also blocked legitimate activations on a different sub_id (the
    // real Bug 1 from PR fix/dodo-webhook-event-ordering).
    const fake = makeFakeClient({
      user: {
        id: 'user_A',
        email: 'a@test.com',
        plan: 'free',
        settings: {
          subscription_status: 'cancelled',
          subscription_events: {
            sub_old: { status: 'cancelled', last_event_at: '2026-04-30T10:00:00.000Z' },
          },
        },
      },
    });
    safeConnectFn.mockResolvedValue(fake);

    const req = buildSignedRequest({
      type: 'subscription.updated',
      data: {
        subscription_id: 'sub_old',
        customer_id: 'cus_old',
        product_id: 'prod_agency',
        status: 'active',
        // Newer than prior so the stale-event skip doesn't fire and
        // we land in the per-subscription post-cancel guard instead.
        timestamp: '2026-04-30T11:00:00.000Z',
      },
      metadata: { userId: 'user_A' },
    });

    const res = await webhookPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true, ignored: 'post_cancel' });

    // No plan change of any kind. Specifically, no agency UPDATE.
    const agencyUpdate = fake.recorded.find(
      r => /UPDATE users SET plan = \$1/.test(r.sql) && r.params[0] === 'agency',
    );
    expect(agencyUpdate, 'must NOT upgrade to agency post-cancel').toBeUndefined();
  });

  it('T3: payment.succeeded for a fresh subscription_id resubscribes a previously-cancelled user', async () => {
    // The user previously cancelled (status='cancelled', no subscription_id).
    // They go through checkout again and pay. payment.succeeded MUST be
    // allowed to upgrade them — that's the only legitimate way back into
    // a paid plan, and the post-cancel guard exempts payment.succeeded
    // for exactly this reason.
    const fake = makeFakeClient({
      user: {
        id: 'user_A',
        email: 'a@test.com',
        plan: 'free',
        settings: {
          subscription_status: 'cancelled',
        },
      },
    });
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
    const body = await res.json();
    expect(body).toEqual({ received: true });

    const agencyUpdate = fake.recorded.find(
      r => /UPDATE users SET plan = \$1/.test(r.sql) && r.params[0] === 'agency',
    );
    expect(agencyUpdate, 'expected upgrade to agency on fresh payment.succeeded').toBeTruthy();

    const settingsMerge = fake.recorded.find(
      r => /UPDATE users SET settings = settings \|\| \$1::jsonb/.test(r.sql)
        && typeof r.params[0] === 'string'
        && r.params[0].includes('"subscription_id":"sub_NEW"'),
    );
    expect(settingsMerge, 'expected fresh subscription_id to be bound').toBeTruthy();
  });
});
