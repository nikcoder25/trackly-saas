/**
 * Tests for the durable email outbox (audit item D).
 *
 * Pre-fix, every transactional email was a single fire-and-forget Resend
 * fetch - no retry, no DB record, no visibility. A network blip / Resend
 * outage / server restart mid-call lost the email forever. The fix
 * inserts each email into the email_outbox Postgres table on enqueue;
 * the /api/cron/process-email-outbox worker picks up rows on a ~2-min
 * cadence, dispatches via deliverEmailViaProvider, and updates the row
 * to sent / failed / dead based on the outcome.
 *
 * Test cases pinned by PR scope:
 *   T1  enqueueEmail INSERTs row pending; no Resend fetch.
 *   T2  worker happy path: pending row -> 200 -> status=sent, sent_at set.
 *   T3  worker retryable (500): status=failed, next_attempt_at=now+1m,
 *       attempts incremented; same row picked up next run, succeeds,
 *       status=sent.
 *   T4  worker non-retryable (422): status=dead immediately, no retry.
 *   T5  worker max-attempts: row at attempts=4 (max=5) fails again ->
 *       status=dead.
 *   T6  idempotency: enqueueEmail twice with same key -> single row,
 *       second call no-op.
 *   T7  lock contention: acquireCronLock returns false -> worker exits
 *       cleanly without claiming, no fetch.
 *   T8  SKIP LOCKED concurrency: two parallel workers see disjoint row
 *       sets; no row processed twice.
 *   T9  stuck-sending reaper: row in 'sending' with updated_at older
 *       than 5 min -> reaper flips it to 'failed' with last_error
 *       'worker crashed mid-send', then normal pickup retries.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.CRON_SECRET = 'test_cron_secret_value_32chars_long_xxxx';
  process.env.EMAIL_API_KEY = 'test_resend_api_key';
  process.env.EMAIL_FROM = 'Livesov <noreply@livesov.com>';
  process.env.EMAIL_API_URL = 'https://api.resend.com/emails';
});

const { poolQuery, safeConnectFn, cronLockFn, auditLogFn, loggerInfo, loggerWarn } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  safeConnectFn: vi.fn(),
  cronLockFn: vi.fn(),
  auditLogFn: vi.fn().mockResolvedValue(true),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
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

import { enqueueEmail } from '@/lib/email';
import { GET as processOutbox } from '@/app/api/cron/process-email-outbox/route';

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

interface QueryRecord { sql: string; params: unknown[] }

function makeFakeClient(opts: {
  pickupRows?: Array<Record<string, unknown>>;
  /** When set, second SELECT FOR UPDATE returns this row set instead.
   *  Lets T8 simulate two parallel workers seeing disjoint rows. */
  pickupRowsSecondCall?: Array<Record<string, unknown>>;
}): {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
  recorded: QueryRecord[];
} {
  const recorded: QueryRecord[] = [];
  let pickupCallIndex = 0;
  const query = vi.fn((sql: string, params: unknown[] = []) => {
    recorded.push({ sql, params });
    if (/SELECT id, to_email, subject, body_html, reply_to, template_key/.test(sql)) {
      pickupCallIndex++;
      if (pickupCallIndex === 2 && opts.pickupRowsSecondCall) {
        return Promise.resolve({ rows: opts.pickupRowsSecondCall });
      }
      return Promise.resolve({ rows: opts.pickupRows ?? [] });
    }
    return Promise.resolve({ rows: [] });
  });
  const release = vi.fn();
  return { query, release, recorded };
}

function authedRequest(): Request {
  return new Request('http://t/api/cron/process-email-outbox', {
    method: 'GET',
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
}

beforeEach(() => {
  poolQuery.mockReset();
  safeConnectFn.mockReset();
  cronLockFn.mockReset();
  cronLockFn.mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) });
  auditLogFn.mockReset();
  auditLogFn.mockResolvedValue(true);
  loggerInfo.mockReset();
  loggerWarn.mockReset();
});

describe('email outbox - durable delivery', () => {
  it('T1: enqueueEmail INSERTs a pending row with attempts=0 and never calls Resend', async () => {
    poolQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    const fetchMock = installFetchMock(async () => new Response('{}', { status: 200 }));

    try {
      const result = await enqueueEmail({
        to: 'a@test.com',
        subject: 'hi',
        html: '<p>hi</p>',
        templateKey: 'verification',
        idempotencyKey: 'verification:abc-123',
      });
      expect(result.sent).toBe(true);

      // Exactly one INSERT against email_outbox; no SELECT/UPDATE in
      // the enqueue path.
      expect(poolQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = poolQuery.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO email_outbox/);
      // Defaults from the schema (status='pending', attempts=0,
      // next_attempt_at=NOW(), max_attempts=5) are NOT in the params -
      // they fall through from column defaults. Params we send: id,
      // to_email, subject, body_html, body_text, reply_to,
      // template_key, payload_json, idempotency_key.
      expect(params[1]).toBe('a@test.com');
      expect(params[2]).toBe('hi');
      expect(params[3]).toBe('<p>hi</p>');
      expect(params[6]).toBe('verification');
      expect(params[8]).toBe('verification:abc-123');

      // Crucial: no Resend fetch fired during enqueue.
      expect(fetchMock.calls).toHaveLength(0);
    } finally {
      fetchMock.restore();
    }
  });

  it('T2: worker happy path - pending row, fetch 200, status=sent, sent_at set', async () => {
    const row = {
      id: '11111111-1111-1111-1111-111111111111',
      to_email: 'a@test.com',
      subject: 'plan upgraded',
      body_html: '<p>upgraded</p>',
      reply_to: null,
      template_key: 'plan_upgrade',
      attempts: 0,
      max_attempts: 5,
    };
    const fake = makeFakeClient({ pickupRows: [row] });
    safeConnectFn.mockResolvedValue(fake);
    poolQuery.mockResolvedValue({ rows: [] });

    const fetchMock = installFetchMock(async (url) => {
      if (url.includes('api.resend.com')) {
        return new Response(JSON.stringify({ id: 'resend_msg_123' }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });

    try {
      const res = await processOutbox(authedRequest());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ claimed: 1, sent: 1, retried: 0, dead: 0 });

      // Sent-row UPDATE was issued via the pool (not the claim client)
      // and sets status='sent' + sent_at + clears last_error.
      const sentUpdate = poolQuery.mock.calls.find(
        ([sql]) => /UPDATE email_outbox\s*SET status = 'sent'/.test(sql as string),
      );
      expect(sentUpdate, 'expected status=sent UPDATE').toBeTruthy();

      // info log uses the stable structured-log key.
      const sentLog = loggerInfo.mock.calls.find(c => c[0] === 'email.outbox.sent');
      expect(sentLog).toBeTruthy();
    } finally {
      fetchMock.restore();
    }
  });

  it('T3: worker retryable - fetch 500 marks row failed with backoff, attempts incremented; next run succeeds', async () => {
    const row = {
      id: '22222222-2222-2222-2222-222222222222',
      to_email: 'a@test.com',
      subject: 'plan cancelled',
      body_html: '<p>cancelled</p>',
      reply_to: null,
      template_key: 'plan_cancellation',
      attempts: 0,
      max_attempts: 5,
    };

    // ── Run 1: Resend returns 500 (retryable) ────────────────────────
    {
      const fake = makeFakeClient({ pickupRows: [row] });
      safeConnectFn.mockResolvedValue(fake);
      poolQuery.mockResolvedValue({ rows: [] });

      const fetchMock = installFetchMock(async (url) => {
        if (url.includes('api.resend.com')) {
          return new Response('upstream timeout', { status: 500 });
        }
        return new Response('{}', { status: 200 });
      });

      try {
        const res = await processOutbox(authedRequest());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toMatchObject({ claimed: 1, retried: 1, sent: 0, dead: 0 });

        // Failed-row UPDATE: status='failed', next_attempt_at = now()+1m
        // (first backoff slot), last_error stringifies the 500 response.
        // Tighten regex to exclude the reaper UPDATE (which also sets
        // status='failed' but doesn't touch next_attempt_at).
        const failedUpdate = poolQuery.mock.calls.find(
          ([sql]) => /SET status = 'failed'/.test(sql as string)
            && /next_attempt_at = NOW\(\)/.test(sql as string),
        );
        expect(failedUpdate, 'expected status=failed UPDATE with next_attempt_at').toBeTruthy();
        const params = failedUpdate![1] as unknown[];
        expect(params[1]).toBe(String(60_000)); // 1m backoff for attempt 1

        // Stable log key.
        const retryLog = loggerInfo.mock.calls.find(c => c[0] === 'email.outbox.retry');
        expect(retryLog).toBeTruthy();
      } finally {
        fetchMock.restore();
      }
    }

    // ── Run 2: Resend now returns 200; same row succeeds ─────────────
    {
      poolQuery.mockReset();
      loggerInfo.mockReset();
      // The claimed row now has attempts=1 (incremented by run 1's
      // claim) - simulate that for the second tick.
      const rowAfterRetry = { ...row, attempts: 1 };
      const fake = makeFakeClient({ pickupRows: [rowAfterRetry] });
      safeConnectFn.mockResolvedValue(fake);
      poolQuery.mockResolvedValue({ rows: [] });

      const fetchMock = installFetchMock(async (url) => {
        if (url.includes('api.resend.com')) {
          return new Response(JSON.stringify({ id: 'resend_msg_ok' }), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      });

      try {
        const res = await processOutbox(authedRequest());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toMatchObject({ claimed: 1, sent: 1, retried: 0, dead: 0 });

        const sentUpdate = poolQuery.mock.calls.find(
          ([sql]) => /UPDATE email_outbox\s*SET status = 'sent'/.test(sql as string),
        );
        expect(sentUpdate).toBeTruthy();
      } finally {
        fetchMock.restore();
      }
    }
  });

  it('T4: worker non-retryable - fetch 422 marks row dead immediately, audit row recorded', async () => {
    const row = {
      id: '33333333-3333-3333-3333-333333333333',
      to_email: 'invalid@test.com',
      subject: 'never delivered',
      body_html: '<p>x</p>',
      reply_to: null,
      template_key: 'plan_upgrade',
      attempts: 0,
      max_attempts: 5,
    };
    const fake = makeFakeClient({ pickupRows: [row] });
    safeConnectFn.mockResolvedValue(fake);
    poolQuery.mockResolvedValue({ rows: [] });

    const fetchMock = installFetchMock(async (url) => {
      if (url.includes('api.resend.com')) {
        return new Response('{"error":"invalid recipient"}', { status: 422 });
      }
      return new Response('{}', { status: 200 });
    });

    try {
      const res = await processOutbox(authedRequest());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ claimed: 1, dead: 1, sent: 0, retried: 0 });

      // Dead-row UPDATE.
      const deadUpdate = poolQuery.mock.calls.find(
        ([sql]) => /UPDATE email_outbox\s*SET status = 'dead'/.test(sql as string),
      );
      expect(deadUpdate, 'expected status=dead UPDATE').toBeTruthy();

      // Audit row written.
      const audited = auditLogFn.mock.calls.find(c => c[1] === 'email_outbox_dead');
      expect(audited).toBeTruthy();

      // Warn log fired with the stable key.
      const deadLog = loggerWarn.mock.calls.find(c => c[0] === 'email.outbox.dead');
      expect(deadLog).toBeTruthy();
    } finally {
      fetchMock.restore();
    }
  });

  it('T5: worker max-attempts - row at attempts=4 (max=5) fails again -> status=dead', async () => {
    // After the claim's attempts++, this row sits at attempts=5 which
    // equals max_attempts. Even though the response is retryable, the
    // worker promotes it to dead because the next retry would be
    // attempt 6 - exceeding max.
    const row = {
      id: '44444444-4444-4444-4444-444444444444',
      to_email: 'a@test.com',
      subject: 'kept failing',
      body_html: '<p>x</p>',
      reply_to: null,
      template_key: 'plan_cancellation',
      attempts: 4,
      max_attempts: 5,
    };
    const fake = makeFakeClient({ pickupRows: [row] });
    safeConnectFn.mockResolvedValue(fake);
    poolQuery.mockResolvedValue({ rows: [] });

    const fetchMock = installFetchMock(async (url) => {
      if (url.includes('api.resend.com')) {
        // Retryable error class - but max-attempts trumps retryability.
        return new Response('upstream', { status: 503 });
      }
      return new Response('{}', { status: 200 });
    });

    try {
      const res = await processOutbox(authedRequest());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ claimed: 1, dead: 1, retried: 0, sent: 0 });

      const deadUpdate = poolQuery.mock.calls.find(
        ([sql]) => /UPDATE email_outbox\s*SET status = 'dead'/.test(sql as string),
      );
      expect(deadUpdate).toBeTruthy();
      const audited = auditLogFn.mock.calls.find(c => c[1] === 'email_outbox_dead');
      expect(audited).toBeTruthy();
    } finally {
      fetchMock.restore();
    }
  });

  it('T6: idempotency - enqueueEmail twice with same idempotency_key inserts only one row', async () => {
    // The second INSERT hits ON CONFLICT (idempotency_key) DO NOTHING
    // and is a no-op. The mocked pool query records both calls but
    // Postgres would reject the duplicate; we assert the behaviour at
    // the SQL-shape level (ON CONFLICT clause is present and the
    // idempotency_key parameter is identical across both calls).
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const sharedKey = 'plan_email:user_A:wh_evt_xyz';
    const r1 = await enqueueEmail({
      to: 'a@test.com', subject: 's', html: '<p>x</p>',
      templateKey: 'plan_upgrade', idempotencyKey: sharedKey,
    });
    const r2 = await enqueueEmail({
      to: 'a@test.com', subject: 's', html: '<p>x</p>',
      templateKey: 'plan_upgrade', idempotencyKey: sharedKey,
    });

    expect(r1.sent).toBe(true);
    expect(r2.sent).toBe(true);

    // Both calls hit the same INSERT … ON CONFLICT statement with the
    // same idempotency_key. Postgres deduplicates at the unique index;
    // the test verifies the SQL contract that lets that work.
    expect(poolQuery).toHaveBeenCalledTimes(2);
    for (const [sql, params] of poolQuery.mock.calls) {
      expect(sql as string).toMatch(/ON CONFLICT \(idempotency_key\) DO NOTHING/);
      expect((params as unknown[])[8]).toBe(sharedKey);
    }
  });

  it('T7: lock contention - acquireCronLock returns false, worker exits without claiming', async () => {
    cronLockFn.mockResolvedValue(false);
    const fetchMock = installFetchMock(async () => new Response('{}', { status: 200 }));

    try {
      const res = await processOutbox(authedRequest());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ skipped: true, reason: 'locked' });

      // No DB queries (no claim, no reaper) and no Resend fetch.
      expect(safeConnectFn).not.toHaveBeenCalled();
      expect(poolQuery).not.toHaveBeenCalled();
      expect(fetchMock.calls.length).toBe(0);
    } finally {
      fetchMock.restore();
    }
  });

  it('T8: SKIP LOCKED concurrency - two parallel workers see disjoint row sets', async () => {
    // Real Postgres FOR UPDATE SKIP LOCKED would prevent two concurrent
    // workers from claiming the same row. With acquireCronLock active
    // this is belt-and-braces; the test simulates the SQL contract by
    // returning disjoint row sets to two simultaneous claim transactions.
    const rowsForFirst = [{
      id: '55555555-5555-5555-5555-555555555555',
      to_email: 'a@test.com', subject: 's1', body_html: '<p>1</p>',
      reply_to: null, template_key: 'plan_upgrade',
      attempts: 0, max_attempts: 5,
    }];
    const rowsForSecond = [{
      id: '66666666-6666-6666-6666-666666666666',
      to_email: 'b@test.com', subject: 's2', body_html: '<p>2</p>',
      reply_to: null, template_key: 'plan_upgrade',
      attempts: 0, max_attempts: 5,
    }];

    const fake = makeFakeClient({
      pickupRows: rowsForFirst,
      pickupRowsSecondCall: rowsForSecond,
    });
    safeConnectFn.mockResolvedValue(fake);
    poolQuery.mockResolvedValue({ rows: [] });

    const seenIds = new Set<string>();
    const fetchMock = installFetchMock(async (url, init) => {
      if (url.includes('api.resend.com')) {
        // Capture the row-id implied by the body's recipient.
        const body = JSON.parse((init?.body as string) || '{}');
        seenIds.add(body.to[0]);
        return new Response('{"id":"ok"}', { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });

    try {
      // Run two workers in parallel - each acquires the cron lock in
      // sequence (mock returns a fresh lock each call), each claim
      // transaction sees its disjoint row set.
      const [r1, r2] = await Promise.all([
        processOutbox(authedRequest()),
        processOutbox(authedRequest()),
      ]);
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);

      // The SELECT included FOR UPDATE SKIP LOCKED - the SQL contract
      // that makes disjoint claim sets safe under real concurrency.
      const selectCall = fake.recorded.find(r =>
        /SELECT id, to_email, subject, body_html, reply_to, template_key/.test(r.sql),
      );
      expect(selectCall, 'expected pickup SELECT').toBeTruthy();
      expect(selectCall!.sql).toMatch(/FOR UPDATE SKIP LOCKED/);

      // Each worker dispatched exactly its disjoint row.
      expect(seenIds.has('a@test.com')).toBe(true);
      expect(seenIds.has('b@test.com')).toBe(true);
      // No row processed twice.
      expect(seenIds.size).toBe(2);
    } finally {
      fetchMock.restore();
    }
  });

  it('T9: stuck-sending reaper - row in sending > 5min is flipped to failed at tick start, then retried', async () => {
    // The reaper UPDATE is the first poolQuery call in the worker.
    // We assert it ran with the right WHERE clause and that the run
    // also includes the normal claim/dispatch flow (so a reaped row
    // would naturally get picked up if the next pickup query saw it).
    poolQuery.mockResolvedValueOnce({ rows: [{ id: 'reaped_id_1' }] });
    poolQuery.mockResolvedValue({ rows: [] });

    const fake = makeFakeClient({ pickupRows: [] });
    safeConnectFn.mockResolvedValue(fake);

    const fetchMock = installFetchMock(async () => new Response('{}', { status: 200 }));

    try {
      const res = await processOutbox(authedRequest());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ reaped: 1 });

      // The reaper query is structured: status='sending' AND
      // updated_at older than the configured timeout, sets
      // status='failed' with last_error explaining the recovery.
      const reaperCall = poolQuery.mock.calls.find(([sql]) =>
        /UPDATE email_outbox\s*SET status = 'failed'/.test(sql as string)
        && /status = 'sending'/.test(sql as string)
        && /worker crashed mid-send/.test(sql as string),
      );
      expect(reaperCall, 'expected reaper UPDATE').toBeTruthy();

      // Stable log key for observability.
      const reaperLog = loggerInfo.mock.calls.find(c => c[0] === 'email.outbox.reaped');
      expect(reaperLog).toBeTruthy();
    } finally {
      fetchMock.restore();
    }
  });
});
