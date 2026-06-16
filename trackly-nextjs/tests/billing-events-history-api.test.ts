/**
 * Tests for /api/payments/history reading from billing_events.
 *
 * The endpoint must:
 *   - Filter by the authenticated user's id only.
 *   - Return rows in DESC chronological order.
 *   - Surface from_plan / to_plan so the UI can render "Pro → Agency"
 *     transition rows for every plan lifecycle event, not just
 *     cancellations.
 *   - Map event_type to a stable status string (upgraded, downgraded,
 *     cancelled, renewed, ...) the UI's filter dropdown relies on.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { poolQuery, verifyRequestAuthFn } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  verifyRequestAuthFn: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  pool: { query: (sql: string, params: unknown[] = []) => poolQuery(sql, params) },
  safeConnect: vi.fn(),
  auditLog: vi.fn(),
  ensureColumns: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth', () => ({
  verifyRequestAuth: (req: Request) => verifyRequestAuthFn(req),
}));

import { GET as historyGet } from '@/app/api/payments/history/route';

beforeEach(() => {
  poolQuery.mockReset();
  verifyRequestAuthFn.mockReset();
});

describe('/api/payments/history - billing_events source', () => {
  it('returns 401 when unauthenticated', async () => {
    verifyRequestAuthFn.mockReturnValue(null);
    const res = await historyGet(new Request('http://t/api/payments/history'));
    expect(res.status).toBe(401);
  });

  it('queries billing_events scoped to the authenticated user, ORDER BY created_at DESC', async () => {
    verifyRequestAuthFn.mockReturnValue({ id: 'user_A' });
    poolQuery.mockResolvedValue({ rows: [] });
    await historyGet(new Request('http://t/api/payments/history'));
    expect(poolQuery).toHaveBeenCalledOnce();
    const [sql, params] = poolQuery.mock.calls[0];
    expect(sql).toMatch(/FROM billing_events/);
    expect(sql).toMatch(/WHERE user_id = \$1/);
    expect(sql).toMatch(/ORDER BY created_at DESC/);
    expect(params).toEqual(['user_A']);
  });

  it('exposes from_plan and to_plan for plan transitions', async () => {
    verifyRequestAuthFn.mockReturnValue({ id: 'user_A' });
    poolQuery.mockResolvedValue({
      rows: [
        {
          event_type: 'plan_upgraded',
          from_plan: 'pro',
          to_plan: 'agency',
          subscription_id: 'sub_X',
          source: 'webhook',
          details: { eventType: 'subscription.plan_changed' },
          created_at: '2026-04-01T00:00:00Z',
        },
        {
          event_type: 'plan_cancelled',
          from_plan: 'agency',
          to_plan: 'free',
          subscription_id: 'sub_X',
          source: 'cancel_route',
          details: {},
          created_at: '2026-05-01T00:00:00Z',
        },
      ],
    });
    const res = await historyGet(new Request('http://t/api/payments/history'));
    const json = await res.json();
    expect(json.history).toHaveLength(2);

    const upgrade = json.history[0];
    expect(upgrade.event_type).toBe('plan_upgraded');
    expect(upgrade.from_plan).toBe('pro');
    expect(upgrade.to_plan).toBe('agency');
    expect(upgrade.status).toBe('upgraded');

    const cancel = json.history[1];
    expect(cancel.event_type).toBe('plan_cancelled');
    expect(cancel.from_plan).toBe('agency');
    expect(cancel.to_plan).toBe('free');
    expect(cancel.status).toBe('cancelled');
  });

  it('maps every known event_type to a stable status string', async () => {
    verifyRequestAuthFn.mockReturnValue({ id: 'user_A' });
    poolQuery.mockResolvedValue({
      rows: [
        { event_type: 'plan_upgraded', from_plan: 'free', to_plan: 'pro', subscription_id: null, source: 'webhook', details: {}, created_at: '2026-01-01T00:00:00Z' },
        { event_type: 'plan_downgraded', from_plan: 'pro', to_plan: 'starter', subscription_id: null, source: 'webhook', details: {}, created_at: '2026-01-02T00:00:00Z' },
        { event_type: 'plan_cancelled', from_plan: 'starter', to_plan: 'free', subscription_id: null, source: 'webhook', details: {}, created_at: '2026-01-03T00:00:00Z' },
        { event_type: 'plan_renewed', from_plan: 'pro', to_plan: 'pro', subscription_id: null, source: 'webhook', details: {}, created_at: '2026-01-04T00:00:00Z' },
        { event_type: 'subscription_on_hold', from_plan: null, to_plan: null, subscription_id: null, source: 'webhook', details: {}, created_at: '2026-01-05T00:00:00Z' },
        { event_type: 'subscription_paused', from_plan: null, to_plan: null, subscription_id: null, source: 'webhook', details: {}, created_at: '2026-01-06T00:00:00Z' },
        { event_type: 'superseded_sub_cancelled', from_plan: null, to_plan: null, subscription_id: 'sub_OLD', source: 'webhook', details: {}, created_at: '2026-01-07T00:00:00Z' },
      ],
    });
    const res = await historyGet(new Request('http://t/api/payments/history'));
    const json = await res.json();
    const byType: Record<string, string> = {};
    for (const r of json.history) byType[r.event_type] = r.status;
    expect(byType).toEqual({
      plan_upgraded: 'upgraded',
      plan_downgraded: 'downgraded',
      plan_cancelled: 'cancelled',
      plan_renewed: 'renewed',
      subscription_on_hold: 'on_hold',
      subscription_paused: 'paused',
      superseded_sub_cancelled: 'orphan_cancelled',
    });
  });

  it('returns empty history on DB error rather than 500ing', async () => {
    verifyRequestAuthFn.mockReturnValue({ id: 'user_A' });
    poolQuery.mockRejectedValueOnce(new Error('connection refused'));
    const res = await historyGet(new Request('http://t/api/payments/history'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ history: [] });
  });
});
