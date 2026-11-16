import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redactPasswordForAudit } from '@/lib/audit-redact';

describe('redactPasswordForAudit', () => {
  it('replaces a password with passwordChanged: true', () => {
    expect(redactPasswordForAudit({ plan: 'pro', password: 'Secret123!' })).toEqual({ plan: 'pro', passwordChanged: true });
  });
  it('drops an empty password without claiming a change', () => {
    expect(redactPasswordForAudit({ name: 'x', password: '' })).toEqual({ name: 'x' });
  });
  it('leaves bodies without a password alone', () => {
    const body = { plan: 'pro' };
    expect(redactPasswordForAudit(body)).toBe(body);
    expect(redactPasswordForAudit(null)).toBe(null);
  });
  it('does not mutate the original body', () => {
    const body = { password: 'Secret123!' };
    redactPasswordForAudit(body);
    expect(body).toEqual({ password: 'Secret123!' });
  });
});

describe('startup scrub of passwords already in audit_logs', () => {
  it('removes the password key from jsonb details', async () => {
    const sqls: string[] = [];
    vi.resetModules();
    vi.doMock('pg', () => ({
      Pool: class {
        async query(sql: string) {
          sqls.push(sql);
          if (/information_schema\.columns/.test(sql) && /audit_logs/.test(sql)) return { rows: [{ data_type: 'jsonb' }] };
          return { rows: [] };
        }
        on() {}
      },
    }));
    const g = globalThis as unknown as { pool?: unknown; dbMigrated?: boolean };
    const savedPool = g.pool;
    const savedMigrated = g.dbMigrated;
    g.pool = undefined;
    g.dbMigrated = undefined;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const db = await import('@/lib/db');
      await db.ensureColumns();
      const scrub = sqls.find((s) => /UPDATE audit_logs/.test(s));
      expect(scrub).toBeDefined();
      expect(scrub).toMatch(/details - 'password'/);
      expect(scrub).toMatch(/details \? 'password'/);
    } finally {
      g.pool = savedPool;
      g.dbMigrated = savedMigrated;
      vi.doUnmock('pg');
      vi.resetModules();
    }
  });
});

// ─── Routes ──────────────────────────────────────────────────────────────
const { poolQuery, auditLogFn } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  auditLogFn: vi.fn(),
}));

describe('admin-backend user routes', () => {
  beforeEach(() => {
    vi.resetModules();
    poolQuery.mockReset();
    auditLogFn.mockReset();
    vi.doMock('@/lib/db', () => ({
      pool: { query: (sql: string, params?: unknown[]) => poolQuery(sql, params) },
      auditLog: (...args: unknown[]) => auditLogFn(...args),
    }));
    vi.doMock('@/lib/admin-auth', () => ({
      requireAdmin: async () => ({ id: 'admin_1', email: 'admin@example.com' }),
    }));
    vi.doMock('@/lib/auth', async () => {
      const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
      return { validatePasswordComplexity: actual.validatePasswordComplexity, revokeAllSessions: vi.fn() };
    });
    poolQuery.mockImplementation(async (sql: string) => {
      if (/^UPDATE users SET/.test(sql)) {
        return { rows: [{ id: 'user_1', email: 'u@example.com', name: null, plan: 'free', role: 'user', email_verified: true }] };
      }
      if (/^\s*INSERT INTO users/.test(sql)) {
        return { rows: [{ id: 'user_new', email: 'new@example.com' }] };
      }
      return { rows: [] };
    });
  });

  function req(method: string, body: unknown): Request {
    return new Request('http://t/api/admin-backend/users/user_1', {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  const params = { params: Promise.resolve({ id: 'user_1' }) };

  it('PUT does not write the plaintext password to the audit log', async () => {
    const { PUT } = await import('@/app/api/admin-backend/users/[id]/route');
    const res = await PUT(req('PUT', { plan: 'pro', password: 'NewPassword123!' }), params);
    expect(res.status).toBe(200);
    expect(auditLogFn).toHaveBeenCalledTimes(1);
    const details = auditLogFn.mock.calls[0][4];
    expect(details).toEqual({ plan: 'pro', passwordChanged: true });
    expect(JSON.stringify(auditLogFn.mock.calls)).not.toContain('NewPassword123!');
  });

  it('PUT rejects a weak password with 400', async () => {
    const { PUT } = await import('@/app/api/admin-backend/users/[id]/route');
    const res = await PUT(req('PUT', { password: 'short' }), params);
    expect(res.status).toBe(400);
    expect(poolQuery.mock.calls.some((c) => /^UPDATE users/.test(String(c[0])))).toBe(false);
  });

  it('PUT rejects a non-string password with 400 instead of 500', async () => {
    const { PUT } = await import('@/app/api/admin-backend/users/[id]/route');
    const res = await PUT(req('PUT', { password: 12345678 }), params);
    expect(res.status).toBe(400);
  });

  it('POST create rejects a weak password with 400', async () => {
    const { POST } = await import('@/app/api/admin-backend/users/route');
    const res = await POST(req('POST', { email: 'new@example.com', password: 'password' }));
    expect(res.status).toBe(400);
    expect(poolQuery.mock.calls.some((c) => /INSERT INTO users/.test(String(c[0])))).toBe(false);
  });

  it('POST create rejects a non-string password with 400 instead of 500', async () => {
    const { POST } = await import('@/app/api/admin-backend/users/route');
    const res = await POST(req('POST', { email: 'new@example.com', password: { a: 1 } }));
    expect(res.status).toBe(400);
  });

  it('POST create accepts a strong password and logs no password', async () => {
    const { POST } = await import('@/app/api/admin-backend/users/route');
    const res = await POST(req('POST', { email: 'new@example.com', password: 'NewPassword123!' }));
    expect(res.status).toBe(201);
    expect(JSON.stringify(auditLogFn.mock.calls)).not.toContain('NewPassword123!');
  });
});
