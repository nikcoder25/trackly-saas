/**
 * Regression tests for fix/cancellation-email-always-enqueue.
 *
 * Bug: when /api/payments/cancel and the Dodo webhook handler raced for
 * the same logical Agency→Free transition, both paths could silently
 * skip the plan_cancellation enqueue:
 *   - The cancel route's post-commit block was gated on
 *     `postCommit.previousSubscriptionId`, which is null when
 *     settings.subscription_id was stripped by a prior webhook.
 *   - The webhook's `superseded_sub` branch returns 200 without
 *     enqueueing whenever the cancellation event's subscription_id
 *     doesn't match the user's currently-bound one — which is exactly
 *     what happens after the cancel route strips it.
 * Net: zero rows in email_outbox, drain worker has nothing to send,
 * Resend is never called, the user gets no confirmation email.
 *
 * The fix:
 *   1. Cancel route stops 400'ing on already-free; it returns 200 and
 *      best-effort recovers the email from audit history.
 *   2. Cancel route's post-commit guard now keys off
 *      `previousPlan !== 'free'` rather than subscription_id presence.
 *   3. Webhook's superseded_sub branch fires the same recovery enqueue
 *      when the user has been moved to free by the cancel route.
 *   4. Both paths use the shared `planCancellationIdempotencyKey`
 *      helper so concurrent enqueues collapse via the email_outbox
 *      idempotency_key UNIQUE constraint.
 *
 * Cases pinned by PR scope:
 *   (a) cancel route on already-free user with paid previousPlan in
 *       audit history -> recovery enqueue with correct key.
 *   (b) cancel route + webhook for the same logical event ->
 *       exactly ONE email_outbox row (UNIQUE collapses the duplicate).
 *   (c) webhook downgrade with stripped subscription_id (cancel route
 *       ran first) -> recovery enqueue is invoked rather than dropped.
 *   (d) enqueueEmail INSERT statement contains
 *       `ON CONFLICT (idempotency_key) DO NOTHING` so a duplicate key
 *       is a no-op at the DB layer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

vi.hoisted(() => {
  process.env.EMAIL_API_KEY = 'test_resend_api_key';
  process.env.EMAIL_FROM = 'Livesov <noreply@livesov.com>';
  process.env.EMAIL_API_URL = 'https://api.resend.com/emails';
  process.env.DODO_PAYMENTS_API_KEY = 'test_dodo_api_key';
  process.env.DODO_PAYMENTS_ENVIRONMENT = 'test_mode';
  const secretBase64 = Buffer.from('test_webhook_secret_value_12345').toString('base64');
  process.env.DODO_PAYMENTS_WEBHOOK_KEY = `whsec_${secretBase64}`;
  process.env.DODO_AGENCY_PRODUCT_ID = 'prod_agency';
  process.env.DODO_PRO_PRODUCT_ID = 'prod_pro';
});

// Shared in-memory fake of the email_outbox table. Exercised by
// scenarios (b) and (d) so we can observe the ON CONFLICT semantics
// without spinning up real Postgres. The idempotency_key column is
// modelled as a UNIQUE constraint: a second INSERT with the same key
// is a silent no-op (matching Postgres ON CONFLICT DO NOTHING).
interface OutboxRow {
  id: string;
  to_email: string;
  subject: string;
  template_key: string;
  idempotency_key: string | null;
}

const { outboxRows, poolQuery, safeConnectFn, verifyRequestAuthFn, rateLimitFn } = vi.hoisted(() => ({
  outboxRows: [] as OutboxRow[],
  poolQuery: vi.fn(),
  safeConnectFn: vi.fn(),
  verifyRequestAuthFn: vi.fn(),
  rateLimitFn: vi.fn().mockResolvedValue({ allowed: true, retryAfter: 0 }),
}));

vi.mock('@/lib/db', () => ({
  pool: { query: (sql: string, params: unknown[] = []) => poolQuery(sql, params) },
  safeConnect: () => safeConnectFn(),
  auditLog: vi.fn().mockResolvedValue(true),
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
  logError: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/plan-config', () => ({
  comparePlans: (from: string | null | undefined, to: string | null | undefined) => {
    const rank: Record<string, number> = { free: 0, starter: 1, pro: 2, agency: 3, enterprise: 4 };
    const a = rank[from || 'free'] ?? 0;
    const b = rank[to || 'free'] ?? 0;
    if (b > a) return 'upgrade';
    if (b < a) return 'downgrade';
    return 'same';
  },
  getPlanCredits: (plan: string | undefined | null) => ({
    label: plan ?? 'free',
    price: '$0',
    monthlyCredits: 100,
    manualDailyCap: 10,
    trackedPromptsPerAccount: 10,
    maxPlatforms: 1,
    modelTier: 'economy',
  }),
}));

// Note: we deliberately do NOT mock '@/lib/email' here. We want the
// real planCancellationIdempotencyKey, the real
// tryEnqueueRecoveredCancellationEmail, and the real enqueueEmail
// (which talks to our pool.query mock). That's how scenarios (b) and
// (d) verify the actual UNIQUE-conflict behaviour rather than a
// vi.fn stub.

import { POST as cancelPost } from '@/app/api/payments/cancel/route';
import { POST as webhookPost } from '@/app/api/payments/webhooks/dodopayments/route';
import {
  enqueueEmail,
  planCancellationIdempotencyKey,
  tryEnqueueRecoveredCancellationEmail,
} from '@/lib/email';

interface QueryRecord { sql: string; params: unknown[] }

function makeFakeClient(opts: {
  user?: {
    id?: string;
    email: string | null;
    plan: string;
    settings: Record<string, unknown> | null;
  } | null;
  webhookEventInsertConflict?: boolean;
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
    if (/^COMMIT/i.test(sql)) return { rows: [] };

    // Per-subscription advisory lock — webhook only.
    if (/pg_advisory_xact_lock/.test(sql)) return { rows: [] };

    // Webhook idempotency INSERT.
    if (/INSERT INTO webhook_events/.test(sql)) {
      if (opts.webhookEventInsertConflict) return { rows: [] };
      return { rows: [{ event_id: params[0] }] };
    }

    // Cancel route's row read.
    if (/SELECT email, plan, settings FROM users/.test(sql)) {
      return { rows: opts.user ? [opts.user] : [] };
    }

    // Webhook's user lookups.
    if (/SELECT id, email, plan, settings FROM users/.test(sql)) {
      return { rows: opts.user ? [opts.user] : [] };
    }

    // Stale-event-skip preflight read.
    if (/SELECT settings FROM users/.test(sql)) {
      return { rows: opts.user ? [{ settings: opts.user.settings }] : [] };
    }

    // Any UPDATE users — accept silently.
    if (/UPDATE users/i.test(sql)) return { rows: [] };

    return { rows: [] };
  });
  const release = vi.fn();
  return { query, release, recorded };
}

function buildCancelRequest(): Request {
  return new Request('http://t/api/payments/cancel', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
}

// Standard Webhooks signing — copied from webhook-cancel-revert.test.ts
// pattern so we exercise the real signature path.
function signStandardWebhook(rawBody: string, webhookId: string, webhookTimestamp: string): string {
  const secret = process.env.DODO_PAYMENTS_WEBHOOK_KEY!;
  const keyBytes = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const sigBase64 = crypto.createHmac('sha256', keyBytes).update(signedContent).digest('base64');
  return `v1,${sigBase64}`;
}

function buildWebhookRequest(body: Record<string, unknown>): Request {
  const raw = JSON.stringify(body);
  const webhookId = `evt_${Math.random().toString(36).slice(2, 10)}`;
  const webhookTimestamp = String(Math.floor(Date.now() / 1000));
  const signature = signStandardWebhook(raw, webhookId, webhookTimestamp);
  return new Request('http://t/api/payments/webhooks/dodopayments', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'webhook-id': webhookId,
      'webhook-timestamp': webhookTimestamp,
      'webhook-signature': signature,
    },
    body: raw,
  });
}

/**
 * Install a pool.query implementation that:
 *   - Inserts into our in-memory outboxRows[] with UNIQUE(idempotency_key).
 *   - Returns a configurable audit_logs result for the recovery helper.
 *   - Returns empty rows for everything else.
 */
function installPoolQuery(opts: {
  auditRows?: Array<{ action: string; details: Record<string, unknown> }>;
} = {}): void {
  poolQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/INSERT INTO email_outbox/i.test(sql)) {
      // Verify the UNIQUE-conflict clause is present — this is the DB
      // half of the dedupe contract, asserted by case (d).
      expect(sql).toMatch(/ON CONFLICT \(idempotency_key\) DO NOTHING/i);
      const idempotencyKey = (params[8] ?? null) as string | null;
      if (idempotencyKey && outboxRows.some((r) => r.idempotency_key === idempotencyKey)) {
        // UNIQUE conflict — the no-op return mimics Postgres's behaviour
        // for `ON CONFLICT DO NOTHING`.
        return { rows: [], rowCount: 0 };
      }
      outboxRows.push({
        id: params[0] as string,
        to_email: params[1] as string,
        subject: params[2] as string,
        template_key: params[6] as string,
        idempotency_key: idempotencyKey,
      });
      return { rows: [], rowCount: 1 };
    }
    if (/FROM audit_logs/i.test(sql)) {
      return { rows: opts.auditRows ?? [] };
    }
    return { rows: [] };
  });
}

beforeEach(() => {
  outboxRows.length = 0;
  poolQuery.mockReset();
  safeConnectFn.mockReset();
  verifyRequestAuthFn.mockReset();
  verifyRequestAuthFn.mockReturnValue({ id: 'user_X', email: 'cancel@test.com' });
  rateLimitFn.mockReset();
  rateLimitFn.mockResolvedValue({ allowed: true, retryAfter: 0 });
});

describe('cancellation-email always-enqueue regression', () => {
  it('(a) cancel route on already-free user with paid previousPlan in audit history -> enqueues plan_cancellation', async () => {
    // Pre-conditions: webhook (or a prior cancel call) already moved
    // the user to plan='free' and stripped subscription_id. The
    // audit_logs table still carries a 'subscription_cancelled' row
    // from the cancel route's post-commit audit, which is what the
    // recovery helper uses to recover previousPlan + sub_id.
    const fake = makeFakeClient({
      user: {
        email: 'cancel@test.com',
        plan: 'free',
        settings: { subscription_status: 'cancelled' },
      },
    });
    safeConnectFn.mockResolvedValue(fake);
    installPoolQuery({
      auditRows: [
        {
          action: 'subscription_cancelled',
          details: { previousPlan: 'agency', previousSubscriptionId: 'sub_AGENCY' },
        },
      ],
    });

    const res = await cancelPost(buildCancelRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alreadyCancelled).toBe(true);
    expect(body.success).toBe(true);

    // Exactly one row in email_outbox, with the shared key shape and
    // the recovered previousPlan baked into the rendered HTML.
    expect(outboxRows.length).toBe(1);
    expect(outboxRows[0].idempotency_key).toBe('plan_cancellation:user_X:sub_AGENCY');
    expect(outboxRows[0].template_key).toBe('plan_cancellation');
    expect(outboxRows[0].to_email).toBe('cancel@test.com');
  });

  it('(b) cancel route + webhook firing for the same logical cancellation produce exactly one email_outbox row', async () => {
    installPoolQuery({
      auditRows: [
        {
          action: 'subscription_cancelled',
          details: { previousPlan: 'agency', previousSubscriptionId: 'sub_AGENCY' },
        },
      ],
    });

    // Cancel-route turn first: user is on agency, route commits to free
    // and post-commit-enqueues with the shared key.
    {
      const fake = makeFakeClient({
        user: {
          email: 'cancel@test.com',
          plan: 'agency',
          settings: { subscription_id: 'sub_AGENCY', dodo_customer_id: 'cus_X', dodo_product_id: 'prod_agency' },
        },
      });
      safeConnectFn.mockResolvedValueOnce(fake);
      const fetchOriginal = globalThis.fetch;
      globalThis.fetch = vi.fn(async () =>
        new Response(JSON.stringify({ status: 'cancelled' }), { status: 200 }),
      ) as typeof globalThis.fetch;
      try {
        const res = await cancelPost(buildCancelRequest());
        expect(res.status).toBe(200);
      } finally {
        globalThis.fetch = fetchOriginal;
      }
    }

    expect(outboxRows.length).toBe(1);
    expect(outboxRows[0].idempotency_key).toBe('plan_cancellation:user_X:sub_AGENCY');

    // Webhook turn: arrives moments later for the same subscription_id
    // and same user. The webhook's downgrade branch processes plan
    // already=free, but it still enqueues the cancellation email under
    // the SHARED key — the second INSERT collides on UNIQUE and is a
    // no-op.
    {
      const fake = makeFakeClient({
        user: {
          id: 'user_X',
          email: 'cancel@test.com',
          plan: 'free',
          // settings.subscription_id stripped by the cancel route — this
          // is the failure mode the fix is closing.
          settings: { subscription_status: 'cancelled' },
        },
      });
      safeConnectFn.mockResolvedValueOnce(fake);
      const eventBody = {
        type: 'subscription.cancelled',
        timestamp: new Date().toISOString(),
        data: {
          subscription_id: 'sub_AGENCY',
          status: 'cancelled',
          customer_id: 'cus_X',
          product_id: 'prod_agency',
        },
        metadata: { userId: 'user_X' },
      };
      const res = await webhookPost(buildWebhookRequest(eventBody));
      expect(res.status).toBe(200);
    }

    // Still exactly one row — UNIQUE collapsed the second insert.
    expect(outboxRows.length).toBe(1);
    expect(outboxRows[0].idempotency_key).toBe('plan_cancellation:user_X:sub_AGENCY');
  });

  it('(c) webhook downgrade with stripped subscription_id (cancel route ran first) still enqueues plan_cancellation', async () => {
    // The user has already been moved to free + had their
    // subscription_id stripped. No prior outbox row exists (simulating
    // the case where the cancel route's enqueue silently failed —
    // exactly the bug). The audit row still exists from the cancel
    // route's post-commit auditLog, so the recovery helper has
    // something to read.
    installPoolQuery({
      auditRows: [
        {
          action: 'subscription_cancelled',
          details: { previousPlan: 'agency', previousSubscriptionId: 'sub_AGENCY' },
        },
      ],
    });

    const fake = makeFakeClient({
      user: {
        id: 'user_X',
        email: 'cancel@test.com',
        plan: 'free',
        settings: { subscription_status: 'cancelled' }, // no subscription_id
      },
    });
    safeConnectFn.mockResolvedValueOnce(fake);

    const eventBody = {
      type: 'subscription.cancelled',
      timestamp: new Date().toISOString(),
      data: {
        subscription_id: 'sub_AGENCY',
        status: 'cancelled',
        customer_id: 'cus_X',
        product_id: 'prod_agency',
      },
      metadata: { userId: 'user_X' },
    };
    const res = await webhookPost(buildWebhookRequest(eventBody));
    expect(res.status).toBe(200);

    // Webhook went down superseded_sub (because settings has no
    // subscription_id) but its safety-net enqueue ran. The fire-and-
    // forget from the route may complete after the response — give
    // the microtask queue a chance to drain before asserting.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(outboxRows.length).toBe(1);
    expect(outboxRows[0].idempotency_key).toBe('plan_cancellation:user_X:sub_AGENCY');
    expect(outboxRows[0].template_key).toBe('plan_cancellation');
  });

  it('(d) enqueueEmail INSERT statement always carries ON CONFLICT (idempotency_key) DO NOTHING and a duplicate key is a UNIQUE no-op', async () => {
    installPoolQuery();

    const key = planCancellationIdempotencyKey('user_X', 'sub_AGENCY');
    const first = await enqueueEmail({
      to: 'cancel@test.com',
      subject: 'first',
      html: '<p>first</p>',
      templateKey: 'plan_cancellation',
      idempotencyKey: key,
    });
    expect(first.sent).toBe(true);
    expect(outboxRows.length).toBe(1);

    // Second enqueue with the SAME key — must produce no second row.
    const second = await enqueueEmail({
      to: 'cancel@test.com',
      subject: 'second',
      html: '<p>second</p>',
      templateKey: 'plan_cancellation',
      idempotencyKey: key,
    });
    expect(second.sent).toBe(true); // enqueueEmail returns sent:true even on conflict — the row is still considered "accepted for delivery".
    expect(outboxRows.length).toBe(1);
    expect(outboxRows[0].subject).toBe('first'); // first wins; second is a no-op.
  });

  it('(d-bis) tryEnqueueRecoveredCancellationEmail no-ops when audit history has no paid previousPlan', async () => {
    // Defensive: a brand-new account that's been on free forever has no
    // 'subscription_cancelled' rows. The recovery helper should NOT
    // enqueue a misleading "your subscription was cancelled" email in
    // that case.
    installPoolQuery({ auditRows: [] });

    await tryEnqueueRecoveredCancellationEmail({
      userId: 'user_NEW',
      email: 'fresh@test.com',
      source: 'test',
    });

    expect(outboxRows.length).toBe(0);
  });
});
