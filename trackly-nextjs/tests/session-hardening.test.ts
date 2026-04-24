/**
 * Regression tests for the session-hardening pass:
 *
 *   1. Admin PUT /api/admin-backend/users/:id
 *        - rejects an email collision with 409
 *        - revokes all sessions when email changes
 *        - revokes all sessions when password changes
 *        - does NOT revoke sessions on a plan-only edit
 *   2. POST /api/auth/2fa/disable revokes all sessions after the TOTP secret
 *      is cleared (otherwise a hijacked session can downgrade the account
 *      back to single-factor and keep its refresh token alive).
 *   3. GET /api/auth/sessions lists only the authenticated user's sessions
 *      and flags the row matching the current refresh cookie as is_current.
 *   4. DELETE /api/auth/sessions/:id scopes the DELETE to user_id so a user
 *      cannot revoke another user's session by guessing an id.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long-abc';

const { queryFn } = vi.hoisted(() => ({
  queryFn: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  pool: {
    query: (sql: string, params: unknown[] = []) => queryFn(sql, params),
  },
  ensureColumns: vi.fn().mockResolvedValue(undefined),
  auditLog: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  rateLimitResponse: vi.fn(() => new Response('rate-limited', { status: 429 })),
  checkUserIpRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PUT as adminUserPut } from '@/app/api/admin-backend/users/[id]/route';
import { POST as twofaDisablePost } from '@/app/api/auth/2fa/disable/route';
import { GET as sessionsGet } from '@/app/api/auth/sessions/route';
import { DELETE as sessionDelete } from '@/app/api/auth/sessions/[id]/route';
import { hashToken } from '@/lib/auth';

const ADMIN_ID = 'admin_A';
const USER_A = 'user_A';
const USER_B = 'user_B';

function token(userId: string): string {
  return jwt.sign({ id: userId, email: `${userId}@test.com` }, process.env.JWT_SECRET!);
}

function req(
  url: string,
  opts: { method?: string; userId?: string; body?: unknown; cookie?: string } = {}
): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (opts.userId) headers.set('authorization', `Bearer ${token(opts.userId)}`);
  if (opts.cookie) headers.set('cookie', opts.cookie);
  return new Request(url, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

beforeEach(() => {
  queryFn.mockReset();
});

// ─── Admin PUT /api/admin-backend/users/:id ─────────────────────────────────
describe('admin-backend PUT /users/:id', () => {
  it('409 when the new email already belongs to another user', async () => {
    queryFn.mockImplementation((sql: string) => {
      if (/SELECT role FROM users/.test(sql)) return { rows: [{ role: 'admin' }] };
      if (/SELECT id FROM users WHERE LOWER\(email\) = LOWER\(\$1\) AND id <> \$2/.test(sql)) {
        return { rows: [{ id: 'someone_else' }] };
      }
      return { rows: [] };
    });

    const res = await adminUserPut(
      req('http://t/api/admin-backend/users/' + USER_A, {
        method: 'PUT',
        userId: ADMIN_ID,
        body: { email: 'taken@example.com' },
      }),
      { params: Promise.resolve({ id: USER_A }) }
    );
    expect(res.status).toBe(409);
  });

  it('400 on syntactically invalid email', async () => {
    queryFn.mockImplementation((sql: string) => {
      if (/SELECT role FROM users/.test(sql)) return { rows: [{ role: 'admin' }] };
      return { rows: [] };
    });
    const res = await adminUserPut(
      req('http://t/api/admin-backend/users/' + USER_A, {
        method: 'PUT',
        userId: ADMIN_ID,
        body: { email: 'not-an-email' },
      }),
      { params: Promise.resolve({ id: USER_A }) }
    );
    expect(res.status).toBe(400);
  });

  it('revokes all sessions when email is changed', async () => {
    const calls: string[] = [];
    queryFn.mockImplementation((sql: string) => {
      calls.push(sql);
      if (/SELECT role FROM users/.test(sql)) return { rows: [{ role: 'admin' }] };
      if (/SELECT id FROM users WHERE LOWER\(email\)/.test(sql)) return { rows: [] };
      if (/^UPDATE users SET/.test(sql)) {
        return { rows: [{ id: USER_A, email: 'new@example.com', name: null, plan: 'free', role: 'user', email_verified: true }] };
      }
      if (/DELETE FROM user_sessions WHERE user_id = \$1/.test(sql)) return { rows: [] };
      return { rows: [] };
    });

    const res = await adminUserPut(
      req('http://t/api/admin-backend/users/' + USER_A, {
        method: 'PUT',
        userId: ADMIN_ID,
        body: { email: 'new@example.com' },
      }),
      { params: Promise.resolve({ id: USER_A }) }
    );
    expect(res.status).toBe(200);
    expect(calls.some(s => /DELETE FROM user_sessions WHERE user_id = \$1/.test(s))).toBe(true);
  });

  it('revokes all sessions when password is changed', async () => {
    const calls: string[] = [];
    queryFn.mockImplementation((sql: string) => {
      calls.push(sql);
      if (/SELECT role FROM users/.test(sql)) return { rows: [{ role: 'admin' }] };
      if (/^UPDATE users SET/.test(sql)) {
        return { rows: [{ id: USER_A, email: 'a@example.com', name: null, plan: 'free', role: 'user', email_verified: true }] };
      }
      if (/DELETE FROM user_sessions WHERE user_id = \$1/.test(sql)) return { rows: [] };
      return { rows: [] };
    });

    const res = await adminUserPut(
      req('http://t/api/admin-backend/users/' + USER_A, {
        method: 'PUT',
        userId: ADMIN_ID,
        body: { password: 'NewPassword123!' },
      }),
      { params: Promise.resolve({ id: USER_A }) }
    );
    expect(res.status).toBe(200);
    expect(calls.some(s => /DELETE FROM user_sessions WHERE user_id = \$1/.test(s))).toBe(true);
  });

  it('does NOT revoke sessions when only the plan changes', async () => {
    const calls: string[] = [];
    queryFn.mockImplementation((sql: string) => {
      calls.push(sql);
      if (/SELECT role FROM users/.test(sql)) return { rows: [{ role: 'admin' }] };
      if (/^UPDATE users SET/.test(sql)) {
        return { rows: [{ id: USER_A, email: 'a@example.com', name: null, plan: 'pro', role: 'user', email_verified: true }] };
      }
      return { rows: [] };
    });

    const res = await adminUserPut(
      req('http://t/api/admin-backend/users/' + USER_A, {
        method: 'PUT',
        userId: ADMIN_ID,
        body: { plan: 'pro' },
      }),
      { params: Promise.resolve({ id: USER_A }) }
    );
    expect(res.status).toBe(200);
    expect(calls.some(s => /DELETE FROM user_sessions/.test(s))).toBe(false);
  });
});

// ─── POST /api/auth/2fa/disable ─────────────────────────────────────────────
describe('2FA disable', () => {
  it('revokes all sessions for the user after clearing the TOTP secret', async () => {
    const hash = await bcrypt.hash('correct-password', 4);
    const calls: string[] = [];
    queryFn.mockImplementation((sql: string) => {
      calls.push(sql);
      if (/SELECT password_hash, settings FROM users/.test(sql)) {
        return { rows: [{ password_hash: hash, settings: {} }] };
      }
      if (/^UPDATE users SET settings/.test(sql)) return { rows: [] };
      if (/DELETE FROM user_sessions WHERE user_id = \$1/.test(sql)) return { rows: [] };
      return { rows: [] };
    });

    const res = await twofaDisablePost(
      req('http://t/api/auth/2fa/disable', {
        method: 'POST',
        userId: USER_A,
        body: { password: 'correct-password' },
      })
    );
    expect(res.status).toBe(200);
    expect(calls.some(s => /DELETE FROM user_sessions WHERE user_id = \$1/.test(s))).toBe(true);
  });

  it('does NOT revoke sessions if the password check fails', async () => {
    const hash = await bcrypt.hash('correct-password', 4);
    const calls: string[] = [];
    queryFn.mockImplementation((sql: string) => {
      calls.push(sql);
      if (/SELECT password_hash, settings FROM users/.test(sql)) {
        return { rows: [{ password_hash: hash, settings: {} }] };
      }
      return { rows: [] };
    });

    const res = await twofaDisablePost(
      req('http://t/api/auth/2fa/disable', {
        method: 'POST',
        userId: USER_A,
        body: { password: 'wrong-password' },
      })
    );
    expect(res.status).toBe(400);
    expect(calls.some(s => /DELETE FROM user_sessions/.test(s))).toBe(false);
  });
});

// ─── GET /api/auth/sessions ─────────────────────────────────────────────────
describe('GET /api/auth/sessions', () => {
  it('401 without a JWT', async () => {
    const res = await sessionsGet(req('http://t/api/auth/sessions'));
    expect(res.status).toBe(401);
  });

  it('scopes the SELECT to user_id and flags the current session', async () => {
    const currentToken = 'the-current-refresh-token';
    const currentHash = hashToken(currentToken);
    const capturedParams: unknown[] = [];
    queryFn.mockImplementation((sql: string, params: unknown[]) => {
      capturedParams.push(...(params || []));
      expect(sql).toMatch(/FROM user_sessions\s+WHERE user_id = \$1/);
      return {
        rows: [
          { id: 's1', user_agent: 'ua', ip: '1.1.1.1', created_at: new Date(), last_used_at: new Date(), refresh_token_hash: currentHash },
          { id: 's2', user_agent: 'ua2', ip: '2.2.2.2', created_at: new Date(), last_used_at: new Date(), refresh_token_hash: 'other-hash' },
        ],
      };
    });

    const res = await sessionsGet(
      req('http://t/api/auth/sessions', {
        userId: USER_A,
        cookie: `livesov_refresh=${currentToken}`,
      })
    );
    expect(res.status).toBe(200);
    expect(capturedParams[0]).toBe(USER_A);
    const body = await res.json() as { sessions: Array<{ id: string; is_current: boolean; refresh_token_hash?: string }> };
    expect(body.sessions).toHaveLength(2);
    expect(body.sessions[0].is_current).toBe(true);
    expect(body.sessions[1].is_current).toBe(false);
    // Hash must never leak to the client.
    expect(body.sessions[0].refresh_token_hash).toBeUndefined();
  });
});

// ─── DELETE /api/auth/sessions/:id ──────────────────────────────────────────
describe('DELETE /api/auth/sessions/:id', () => {
  it('401 without a JWT', async () => {
    const res = await sessionDelete(
      req('http://t/api/auth/sessions/s_B', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 's_B' }) }
    );
    expect(res.status).toBe(401);
  });

  it("404 when USER_A tries to revoke USER_B's session id (DELETE is scoped to user_id)", async () => {
    queryFn.mockImplementation((sql: string, params: unknown[]) => {
      expect(sql).toMatch(/DELETE FROM user_sessions WHERE id = \$1 AND user_id = \$2/);
      expect(params).toEqual(['s_B', USER_A]);
      return { rows: [], rowCount: 0 };
    });

    const res = await sessionDelete(
      req('http://t/api/auth/sessions/s_B', { method: 'DELETE', userId: USER_A }),
      { params: Promise.resolve({ id: 's_B' }) }
    );
    expect(res.status).toBe(404);
  });

  it('200 when the caller owns the session', async () => {
    queryFn.mockImplementation((sql: string) => {
      expect(sql).toMatch(/DELETE FROM user_sessions WHERE id = \$1 AND user_id = \$2/);
      return { rows: [], rowCount: 1 };
    });
    const res = await sessionDelete(
      req('http://t/api/auth/sessions/s_A', { method: 'DELETE', userId: USER_A }),
      { params: Promise.resolve({ id: 's_A' }) }
    );
    expect(res.status).toBe(200);
  });
});
