/**
 * Access tokens carry their session id (sid). Once that session row is
 * deleted (password change, reset, logout, device revoke) the access token
 * must stop working right away, not after its 15-minute TTL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long-abc';

const { queryFn, sessions } = vi.hoisted(() => ({
  queryFn: vi.fn(),
  sessions: new Set<string>(),
}));

vi.mock('@/lib/db', () => ({
  pool: { query: (sql: string, params: unknown[] = []) => queryFn(sql, params) },
}));

import { signAccessToken, verifyRequestAuthLive, requireVerifiedAuth } from '@/lib/auth';
import { pool } from '@/lib/db';

function req(token: string) {
  return new Request('https://livesov.com/api/x', { headers: { authorization: `Bearer ${token}` } });
}

beforeEach(() => {
  sessions.clear();
  queryFn.mockReset();
  queryFn.mockImplementation(async (sql: string, params: unknown[]) => {
    if (/FROM user_sessions WHERE id = \$1/.test(sql)) {
      return { rows: sessions.has(params[0] as string) ? [{ '?column?': 1 }] : [] };
    }
    if (/SELECT email_verified FROM users/.test(sql)) return { rows: [{ email_verified: true }] };
    return { rows: [] };
  });
});

describe('access token dies with its session', () => {
  it('verifyRequestAuthLive accepts a live session and rejects a revoked one', async () => {
    sessions.add('sessB');
    const token = signAccessToken({ id: 'u1', email: 'a@b.com', sid: 'sessB' });
    expect(await verifyRequestAuthLive(req(token))).not.toBeNull();
    sessions.delete('sessB'); // password changed on another device
    expect(await verifyRequestAuthLive(req(token))).toBeNull();
  });

  it('requireVerifiedAuth returns 401 once the session is revoked', async () => {
    sessions.add('sessB');
    const token = signAccessToken({ id: 'u1', email: 'a@b.com', sid: 'sessB' });
    const ok = await requireVerifiedAuth(req(token), pool);
    expect(ok).not.toBeInstanceOf(Response);
    sessions.delete('sessB');
    const res = await requireVerifiedAuth(req(token), pool);
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(401);
  });

  it('server-minted tokens without sid (MCP) still pass', async () => {
    const token = signAccessToken({ id: 'u1', email: 'a@b.com' });
    expect(await verifyRequestAuthLive(req(token))).not.toBeNull();
  });
});
