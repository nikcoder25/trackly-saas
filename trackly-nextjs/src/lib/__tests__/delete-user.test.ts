import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { poolQuery, clientQuery, release } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  clientQuery: vi.fn(),
  release: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  pool: { query: (sql: string, params?: unknown[]) => poolQuery(sql, params) },
  safeConnect: async () => ({ query: (sql: string, params?: unknown[]) => clientQuery(sql, params), release }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { deleteUserAccount, DELETE_STATEMENTS } from '@/lib/delete-user';

const USER = 'user_1';
const ALL_TABLES = DELETE_STATEMENTS.map(([t]) => t);

function userRow(subscriptionId: string | null) {
  poolQuery.mockImplementation(async (sql: string) => {
    if (/FROM users WHERE id = \$1/.test(sql)) {
      return { rows: [{ email: 'u@example.com', subscription_id: subscriptionId }] };
    }
    return { rows: [] };
  });
}

function clientOk(tables: string[] = ALL_TABLES) {
  clientQuery.mockImplementation(async (sql: string) => {
    if (/information_schema\.tables/.test(sql)) return { rows: tables.map((table_name) => ({ table_name })) };
    if (/^DELETE FROM users/.test(sql)) return { rows: [{ id: USER }] };
    return { rows: [] };
  });
}

let fetchMock: ReturnType<typeof vi.fn>;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  poolQuery.mockReset();
  clientQuery.mockReset();
  release.mockReset();
  fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  process.env.DODO_PAYMENTS_API_KEY = 'test_key';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.DODO_PAYMENTS_API_KEY;
});

function sqlCalls(): string[] {
  return clientQuery.mock.calls.map((c) => String(c[0]));
}

describe('deleteUserAccount', () => {
  it('cancels the Dodo subscription before deleting, inside one transaction', async () => {
    userRow('sub_123');
    clientOk();

    const res = await deleteUserAccount(USER);
    expect(res).toEqual({ ok: true, email: 'u@example.com', cancelledSubscriptionId: 'sub_123' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/subscriptions\/sub_123$/);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ status: 'cancelled' });

    const calls = sqlCalls();
    expect(calls[0]).toBe('BEGIN');
    expect(calls[calls.length - 1]).toBe('COMMIT');
    expect(calls.some((s) => /DELETE FROM users WHERE id = \$1/.test(s))).toBe(true);
    // Rank tracking and previously orphaned tables are covered.
    for (const t of ['rt_websites', 'rt_alert_rules', 'rt_reports', 'rt_client_users', 'tenant_api_keys', 'prompt_meta', 'prompt_fanout', 'prompt_discovery_jobs']) {
      expect(calls.some((s) => s.startsWith(`DELETE FROM ${t} `))).toBe(true);
    }
    // The audit trail is kept.
    expect(calls.some((s) => /DELETE FROM audit_logs/.test(s))).toBe(false);
    expect(calls.some((s) => /UPDATE audit_logs/.test(s))).toBe(false);
    // Every delete is parameterised with the user id.
    for (const c of clientQuery.mock.calls) {
      if (/^DELETE/.test(String(c[0]))) expect(c[1]).toEqual([USER]);
    }
    // Brands are deleted after their children, users last.
    const brandsIdx = calls.findIndex((s) => s.startsWith('DELETE FROM brands '));
    const runsIdx = calls.findIndex((s) => s.startsWith('DELETE FROM prompt_runs '));
    const usersIdx = calls.findIndex((s) => s.startsWith('DELETE FROM users '));
    expect(runsIdx).toBeLessThan(brandsIdx);
    expect(brandsIdx).toBeLessThan(usersIdx);
    expect(release).toHaveBeenCalled();
  });

  it('aborts without touching the database when Dodo returns a real error', async () => {
    userRow('sub_123');
    clientOk();
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));

    const res = await deleteUserAccount(USER);
    expect(res).toMatchObject({ ok: false, status: 502 });
    expect(clientQuery).not.toHaveBeenCalled();
  });

  it('aborts when the Dodo request fails at the network level', async () => {
    userRow('sub_123');
    clientOk();
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));

    const res = await deleteUserAccount(USER);
    expect(res).toMatchObject({ ok: false, status: 502 });
    expect(clientQuery).not.toHaveBeenCalled();
  });

  it('aborts when payments are not configured but the user has a subscription', async () => {
    userRow('sub_123');
    clientOk();
    delete process.env.DODO_PAYMENTS_API_KEY;

    const res = await deleteUserAccount(USER);
    expect(res).toMatchObject({ ok: false, status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(clientQuery).not.toHaveBeenCalled();
  });

  it.each([404, 409, 410])('treats Dodo %i (already cancelled / not found) as success', async (status) => {
    userRow('sub_123');
    clientOk();
    fetchMock.mockResolvedValue(new Response('{}', { status }));

    const res = await deleteUserAccount(USER);
    expect(res.ok).toBe(true);
    expect(sqlCalls()).toContain('COMMIT');
  });

  it('skips the Dodo call when there is no subscription', async () => {
    userRow(null);
    clientOk();

    const res = await deleteUserAccount(USER);
    expect(res).toEqual({ ok: true, email: 'u@example.com', cancelledSubscriptionId: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips tables that do not exist yet instead of failing the transaction', async () => {
    userRow(null);
    clientOk(['brands']);

    const res = await deleteUserAccount(USER);
    expect(res.ok).toBe(true);
    const deletes = sqlCalls().filter((s) => s.startsWith('DELETE'));
    expect(deletes).toEqual(['DELETE FROM brands WHERE user_id = $1', 'DELETE FROM users WHERE id = $1 RETURNING id']);
  });

  it('detaches audit_logs rows instead of deleting them when an FK to users exists', async () => {
    userRow(null);
    clientQuery.mockImplementation(async (sql: string) => {
      if (/information_schema\.tables/.test(sql)) return { rows: ALL_TABLES.map((table_name) => ({ table_name })) };
      if (/FROM pg_constraint/.test(sql)) return { rows: [{ '?column?': 1 }] };
      if (/^DELETE FROM users/.test(sql)) return { rows: [{ id: USER }] };
      return { rows: [] };
    });

    const res = await deleteUserAccount(USER);
    expect(res.ok).toBe(true);
    const calls = sqlCalls();
    const updateIdx = calls.findIndex((s) => /UPDATE audit_logs/.test(s));
    const usersIdx = calls.findIndex((s) => s.startsWith('DELETE FROM users '));
    expect(updateIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeLessThan(usersIdx);
    expect(calls[updateIdx]).toMatch(/deleted_user_id/);
    expect(calls.some((s) => /DELETE FROM audit_logs/.test(s))).toBe(false);
  });

  it('rolls back and rethrows when a delete fails', async () => {
    userRow(null);
    clientQuery.mockImplementation(async (sql: string) => {
      if (/information_schema\.tables/.test(sql)) return { rows: ALL_TABLES.map((table_name) => ({ table_name })) };
      if (/^DELETE FROM rt_websites/.test(sql)) throw new Error('db down');
      return { rows: [] };
    });

    await expect(deleteUserAccount(USER)).rejects.toThrow('db down');
    expect(sqlCalls()).toContain('ROLLBACK');
    expect(sqlCalls()).not.toContain('COMMIT');
    expect(release).toHaveBeenCalled();
  });

  it('returns 404 for an unknown user without calling Dodo', async () => {
    poolQuery.mockResolvedValue({ rows: [] });
    const res = await deleteUserAccount(USER);
    expect(res).toMatchObject({ ok: false, status: 404 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(clientQuery).not.toHaveBeenCalled();
  });
});
