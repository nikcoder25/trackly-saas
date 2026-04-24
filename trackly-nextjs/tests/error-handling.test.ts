import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Sentry BEFORE importing anything that might pull in the logger. The
// `logger` module forwards to `Sentry.logger.*`; without the mock any error
// logs would try to go to a real Sentry client. `vi.mock` is hoisted, so
// the mock factory can't close over top-level variables — use vi.hoisted.
const sentryLoggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@sentry/nextjs', () => ({
  logger: sentryLoggerMocks,
}));

import {
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  serverError,
  logError,
  scrubLogContext,
} from '../src/lib/api-error';
import { scrubSentryEvent } from '../src/lib/sentry-scrub';

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe('api-error helpers', () => {
  beforeEach(() => {
    Object.values(sentryLoggerMocks).forEach(fn => fn.mockReset());
  });

  it('serverError() with no args returns the static safe shape', async () => {
    const res = serverError();
    expect(res.status).toBe(500);
    expect(await readJson(res)).toEqual({ error: 'Internal server error' });
  });

  it('serverError() accepts a safe user-facing message and an optional code', async () => {
    const res = serverError({ message: 'Failed to delete alert', code: 'alerts.delete_failed' });
    expect(res.status).toBe(500);
    expect(await readJson(res)).toEqual({
      error: 'Failed to delete alert',
      code: 'alerts.delete_failed',
    });
  });

  it('4xx helpers preserve caller messages verbatim (frontend copy is stable)', async () => {
    expect(await readJson(badRequest('Invalid email'))).toEqual({ error: 'Invalid email' });
    expect(await readJson(unauthorized('No token'))).toEqual({ error: 'No token' });
    expect(await readJson(forbidden('Admins only'))).toEqual({ error: 'Admins only' });
    expect(await readJson(notFound('User not found'))).toEqual({ error: 'User not found' });
  });

  it('4xx helpers pass through extra fields (e.g. requiresConfirm)', async () => {
    const res = badRequest('Confirmation required', { extra: { requiresConfirm: true } });
    const body = await readJson(res);
    expect(res.status).toBe(400);
    expect(body.error).toBe('Confirmation required');
    expect(body.requiresConfirm).toBe(true);
  });

  it('a thrown Error reaches the client as `{error:"Internal server error"}` with no stack', async () => {
    // Simulated handler body: catch the thrown Error and return
    // serverError(). This is the canonical pattern the audit enforces.
    async function handler(): Promise<Response> {
      try {
        throw new Error('SELECT on users failed: column "plan_" does not exist');
      } catch (e) {
        logError('test.unhandled', e);
        return serverError();
      }
    }

    const res = await handler();
    const body = await readJson(res);

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: 'Internal server error' });
    // No stack trace, no raw DB text, no internal identifiers.
    expect(JSON.stringify(body)).not.toMatch(/column|does not exist|at Object\./i);
  });

  it('logError scrubs sensitive context fields before emitting to the logger', () => {
    logError('auth.login.failed', new Error('bad credentials'), {
      email: 'user@example.com',
      password: 'hunter2',
      token: 'eyJhbGciOi.xxx',
      api_key: 'sk-live-abc',
      userId: 'u_123',
    });

    expect(sentryLoggerMocks.error).toHaveBeenCalledTimes(1);
    const [event, attrs] = sentryLoggerMocks.error.mock.calls[0];
    expect(event).toBe('auth.login.failed');
    expect(attrs.password).toBe('[Filtered]');
    expect(attrs.token).toBe('[Filtered]');
    expect(attrs.api_key).toBe('[Filtered]');
    // Non-sensitive fields survive.
    expect(attrs.userId).toBe('u_123');
    // The Error's .message is preserved under the `error` key (it's the
    // root cause we need for debugging), but it MUST NOT be in the
    // response body — that's asserted by the previous test.
    expect(attrs.error).toBe('bad credentials');
  });

  it('scrubLogContext is recursive and handles arrays', () => {
    const cleaned = scrubLogContext({
      outer: {
        password: 'secret',
        nested: { api_key: 'x', ok: 'value' },
        list: [{ session_token: 'abc' }, { ok: 1 }],
      },
    });
    const outer = cleaned.outer as Record<string, unknown>;
    expect(outer.password).toBe('[Filtered]');
    expect((outer.nested as Record<string, unknown>).api_key).toBe('[Filtered]');
    expect((outer.nested as Record<string, unknown>).ok).toBe('value');
    const list = outer.list as Record<string, unknown>[];
    expect(list[0].session_token).toBe('[Filtered]');
    expect(list[1].ok).toBe(1);
  });
});

describe('Sentry beforeSend scrubber', () => {
  it('redacts authorization, cookie, and x-csrf-token from request headers', () => {
    const event = {
      request: {
        url: 'https://example.com/api/auth/login',
        method: 'POST',
        headers: {
          authorization: 'Bearer super-secret-jwt',
          Authorization: 'Bearer duplicate',
          cookie: 'session=abc123; other=xyz',
          'x-csrf-token': 't-12345',
          'user-agent': 'Mozilla/5.0',
          'x-api-key': 'sk_live_xxx',
        },
      },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event) as unknown as {
      request: { headers: Record<string, string> };
    };

    expect(scrubbed.request.headers.authorization).toBe('[Filtered]');
    expect(scrubbed.request.headers.Authorization).toBe('[Filtered]');
    expect(scrubbed.request.headers.cookie).toBe('[Filtered]');
    expect(scrubbed.request.headers['x-csrf-token']).toBe('[Filtered]');
    expect(scrubbed.request.headers['x-api-key']).toBe('[Filtered]');
    // Non-sensitive headers survive — triage still needs user-agent etc.
    expect(scrubbed.request.headers['user-agent']).toBe('Mozilla/5.0');
  });

  it('drops the parsed request.cookies field outright', () => {
    const event = {
      request: {
        cookies: { session: 'abc', refresh_token: 'xyz' },
      },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event) as unknown as {
      request: { cookies: unknown };
    };
    expect(scrubbed.request.cookies).toBe('[Filtered]');
  });

  it('scrubs password, token, secret, and api_key fields from request.data', () => {
    const event = {
      request: {
        data: {
          email: 'user@example.com',
          password: 'hunter2',
          refresh_token: 'eyJ...',
          api_key: 'sk_live_xxx',
          webhook_secret: 'whsec_yyy',
          nested: { client_secret: 'cs_xxx', keep: 'me' },
        },
      },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event) as unknown as {
      request: { data: Record<string, unknown> };
    };
    const data = scrubbed.request.data;
    expect(data.password).toBe('[Filtered]');
    expect(data.refresh_token).toBe('[Filtered]');
    expect(data.api_key).toBe('[Filtered]');
    expect(data.webhook_secret).toBe('[Filtered]');
    expect((data.nested as Record<string, unknown>).client_secret).toBe('[Filtered]');
    expect((data.nested as Record<string, unknown>).keep).toBe('me');
    // Email is not automatically scrubbed here (Sentry's sendDefaultPii=false
    // handles user-object PII); what matters is that credentials are gone.
    expect(data.email).toBe('user@example.com');
  });

  it('reduces the user object to {id} so PII fields (email/ip) can never leak', () => {
    const event = {
      user: {
        id: 'u_123',
        email: 'user@example.com',
        ip_address: '203.0.113.1',
        username: 'alice',
      },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event) as unknown as {
      user: Record<string, unknown>;
    };
    expect(scrubbed.user).toEqual({ id: 'u_123' });
  });

  it('scrubs extra and contexts recursively', () => {
    const event = {
      extra: { password: 'p', nested: { api_key: 'x' } },
      contexts: { runtime: { token: 'y' } },
    } as unknown as Parameters<typeof scrubSentryEvent>[0];

    const scrubbed = scrubSentryEvent(event) as unknown as {
      extra: Record<string, unknown>;
      contexts: Record<string, Record<string, unknown>>;
    };
    expect(scrubbed.extra.password).toBe('[Filtered]');
    expect((scrubbed.extra.nested as Record<string, unknown>).api_key).toBe('[Filtered]');
    expect(scrubbed.contexts.runtime.token).toBe('[Filtered]');
  });

  it('never throws on a malformed event — returning the event unchanged is better than losing it', () => {
    const weird = { request: 'not-an-object' } as unknown as Parameters<typeof scrubSentryEvent>[0];
    expect(() => scrubSentryEvent(weird)).not.toThrow();
  });
});
