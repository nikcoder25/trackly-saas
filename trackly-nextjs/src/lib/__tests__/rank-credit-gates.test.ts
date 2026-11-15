import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('@/lib/db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));
vi.mock('../rank-tracking/schema', () => ({ ensureRankSchema: vi.fn(async () => {}) }));
const post = vi.fn();
vi.mock('../rank-tracking/providers/dataforseo', () => ({
  dfsQueue: { configured: () => true, post: (...a: unknown[]) => post(...a) },
  DFS_PENDING_CODES: new Set<number>(),
  DFS_REPOST_CODES: new Set<number>(),
  fetchSearchVolume: vi.fn(),
}));
vi.mock('../rank-tracking/providers', () => ({ providerChain: () => [{ name: 'dataforseo' }], fetchPageWithFallback: vi.fn() }));
vi.mock('../rank-tracking/locations', () => ({
  resolveLocation: vi.fn(async (i: { name?: string; code?: number }) => ({ code: i.code || 1026201, name: i.name || 'Austin,Texas,United States', type: 'City' })),
}));

import { canSpendCredits, checksWithinAllowance, spendRefusalMessage } from '../rank-tracking/credits';
import { dispatchDue } from '../rank-tracking/scheduler';
import { queueRecheck } from '../rank-tracking/sites';
import { updateKeywords } from '../rank-tracking/keywords';
import { importCommitment, importDepth, importKeywords, type ImportedKeyword } from '../rank-tracking/import';

type Handler = (sql: string, params: unknown[]) => { rows: unknown[]; rowCount?: number } | undefined;
function onQuery(h: Handler) {
  query.mockImplementation(async (sql: string, params: unknown[] = []) => h(sql.replace(/\s+/g, ' '), params) || { rows: [], rowCount: 0 });
}

const kw = (id: string, account: string, depth = 30) => ({
  id, website_id: 'w-' + account, account_id: account, domain: 'example.com', keyword: 'k ' + id, location_code: 1, location_name: 'Austin',
  device: 'desktop', language: 'en', frequency: 'weekly', depth, fail_count: 0, pending_provider: 'claim', pending_task_id: null,
  pending_page: null, pending_cost: 0, pending_pages: 0, pending_attempts: 0,
});
const future = new Date(Date.now() + 86400e3).toISOString();
const past = new Date(Date.now() - 86400e3).toISOString();

beforeEach(() => { query.mockReset(); post.mockReset(); });

describe('spend gate helpers', () => {
  it('refuses a plan with no allowance and spending past the allowance', () => {
    expect(canSpendCredits('free', 0, 1)).toMatchObject({ ok: false, reason: 'plan_no_rank_tracking' });
    expect(canSpendCredits('starter', 999, 2)).toMatchObject({ ok: false, reason: 'out_of_credits', remaining: 1 });
    expect(canSpendCredits('starter', 998, 2).ok).toBe(true);
    expect(spendRefusalMessage(canSpendCredits('starter', 999, 2))).toMatch(/needs 2 credits.*1 left of 1,000/);
  });

  it('keeps checks in order while they fit', () => {
    expect(checksWithinAllowance('free', 0, [30, 30])).toEqual([]);
    expect(checksWithinAllowance('trial', 197, [100, 30, 100, 30])).toEqual([0, 1]);
    expect(checksWithinAllowance('trial', 200, [30])).toEqual([]);
  });
});

describe('dispatchDue credit gate', () => {
  function setup(claimed: ReturnType<typeof kw>[], users: { id: string; plan: string; trial_ends_at?: string | null }[], used: Record<string, number>, inFlight: Record<string, number> = {}) {
    const calls: { sql: string; params: unknown[] }[] = [];
    onQuery((sql, params) => {
      calls.push({ sql, params });
      if (sql.startsWith('WITH due AS')) return { rows: claimed };
      if (sql.includes('FROM users')) return { rows: users };
      if (sql.includes('FROM rt_checks c')) return { rows: Object.entries(used).map(([account_id, n]) => ({ account_id, n })) };
      if (sql.includes('pending_provider IS NOT NULL AND NOT')) return { rows: Object.entries(inFlight).map(([account_id, n]) => ({ account_id, n })) };
      return undefined;
    });
    post.mockImplementation(async (tasks: { tag: string }[]) => tasks.map((t) => ({ tag: t.tag, id: 'task-' + t.tag, status: 20100, message: '', cost: 0.0006 })));
    return calls;
  }

  it('does not post for an expired trial or a cancelled (free) account and pushes them out a day', async () => {
    const calls = setup(
      [kw('a1', 'expired'), kw('b1', 'cancelled'), kw('c1', 'paid')],
      [{ id: 'expired', plan: 'trial', trial_ends_at: past }, { id: 'cancelled', plan: 'free' }, { id: 'paid', plan: 'starter' }],
      { paid: 10 });
    const r = await dispatchDue(10);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0].map((t: { tag: string }) => t.tag)).toEqual(['c1']);
    expect(r).toMatchObject({ claimed: 1, queued: 1 });
    const release = calls.find((c) => c.sql.includes("INTERVAL '24 hours'"));
    expect(release?.params[0]).toEqual(['a1', 'b1']);
    // Plans and usage are read once per tick for all accounts, not per keyword.
    expect(calls.filter((c) => c.sql.includes('FROM users'))).toHaveLength(1);
    expect(calls.filter((c) => c.sql.includes('FROM rt_checks c'))).toHaveLength(1);
  });

  it('stops an account at its allowance, counting checks already in flight', async () => {
    setup(
      [kw('t1', 'trial', 100), kw('t2', 'trial', 30), kw('t3', 'trial', 30)],
      [{ id: 'trial', plan: 'trial', trial_ends_at: future }],
      { trial: 190 }, { trial: 7 });
    const r = await dispatchDue(10);
    // 200 allowance - 190 used - 7 in flight = 3: the top-100 check (2) fits, then one top-30 (1).
    expect(post.mock.calls[0][0].map((t: { tag: string }) => t.tag)).toEqual(['t1', 't2']);
    expect(r.queued).toBe(2);
  });

  it('posts nothing when every claimed keyword is over its allowance', async () => {
    setup([kw('x1', 'full')], [{ id: 'full', plan: 'starter' }], { full: 1000 });
    expect(await dispatchDue(10)).toEqual({ claimed: 0, queued: 0, sync: 0 });
    expect(post).not.toHaveBeenCalled();
  });
});

describe('queueRecheck credit gate', () => {
  function setup(depths: number[], used: number) {
    const calls: string[] = [];
    onQuery((sql) => {
      calls.push(sql);
      if (sql.startsWith('SELECT k.depth')) return { rows: depths.map((depth) => ({ depth })) };
      if (sql.includes('FROM rt_checks c')) return { rows: [{ account_id: 'acc', n: used }] };
      if (sql.startsWith('UPDATE rt_keywords k SET next_check_at = NOW()')) return { rows: depths.map((_, i) => ({ id: 'k' + i })) };
      return undefined;
    });
    return calls;
  }

  it('refuses a plan with no rank allowance', async () => {
    const calls = setup([30], 0);
    const r = await queueRecheck('acc', 'free', ['k0']);
    expect(r).toMatchObject({ ok: false, status: 402 });
    if (!r.ok) expect(r.error).toMatch(/not part of your plan/);
    expect(calls.some((s) => s.startsWith('UPDATE'))).toBe(false);
  });

  it('refuses a recheck that would go over the allowance', async () => {
    const calls = setup([100, 100], 997);
    const r = await queueRecheck('acc', 'starter', ['k0', 'k1']);
    expect(r).toMatchObject({ ok: false, status: 402, credit: { needed: 4, remaining: 3 } });
    expect(calls.some((s) => s.startsWith('UPDATE'))).toBe(false);
  });

  it('queues when it fits', async () => {
    setup([30, 100], 10);
    expect(await queueRecheck('acc', 'pro', ['k0', 'k1'])).toEqual({ ok: true, queued: ['k0', 'k1'] });
  });
});

describe('location and device moves', () => {
  it('only requeue keywords with no check in flight', async () => {
    const calls: string[] = [];
    onQuery((sql) => {
      calls.push(sql);
      if (sql.startsWith('SELECT k.id FROM rt_keywords k JOIN rt_websites')) return { rows: [{ id: 'k1' }, { id: 'k2' }] };
      if (sql.startsWith('SELECT COUNT(*)')) return { rows: [{ n: 1 }] };
      return undefined;
    });
    const r = await updateKeywords('acc', 'pro', ['k1', 'k2'], { location: { name: 'Dallas,Texas,United States' }, device: 'mobile' });
    expect(r).toEqual({ ok: true, updated: 2, busy: 1 });
    const moves = calls.filter((s) => s.startsWith('UPDATE rt_keywords k SET location_code') || s.startsWith('UPDATE rt_keywords k SET device'));
    expect(moves).toHaveLength(2);
    for (const m of moves) expect(m).toContain('k.pending_provider IS NULL AND k.pending_task_id IS NULL');
  });
});

describe('import credit gate', () => {
  const item = (keyword: string, ranks: (number | null)[]): ImportedKeyword => ({
    keyword, domain: 'example.com', location: 'Austin,Texas,United States', device: 'desktop', url: null,
    history: ranks.map((rank, i) => ({ date: `2026-10-0${i + 1}`, rank })),
  });

  it('counts deep keywords at top 100 when the plan allows it', () => {
    const items = [item('a', [5]), item('b', [45, 12]), item('c', [null])];
    expect(importDepth(items[1], 'pro')).toBe(100);
    expect(importDepth(items[1], 'starter')).toBe(30);
    expect(importCommitment(items, 'pro')).toBe(4 + 8 + 4);
    expect(importCommitment(items, 'starter')).toBe(12);
  });

  it('refuses an import whose real depth goes over the allowance and inserts at the gated depth', async () => {
    const inserts: unknown[][] = [];
    const committed = (n: number) => onQuery((sql, params) => {
      if (sql.startsWith('SELECT k.frequency, k.depth')) return { rows: [{ frequency: 'weekly', depth: 30, count: n }] };
      if (sql.startsWith('INSERT INTO rt_websites')) return { rows: [{ id: 'w1', domain: 'example.com' }] };
      if (sql.startsWith('INSERT INTO rt_keywords')) { inserts.push(params); return { rows: [{ id: 'k' + inserts.length }] }; }
      return undefined;
    });
    // Trial allowance 200. 49 keywords committed = 196; one deep keyword needs 8: refused (a top-30 gate would have let 4 through).
    committed(49);
    const refused = await importKeywords('acc', 'trial', [item('deep', [80])], '');
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/need 8 credits a month/);
    expect(inserts).toHaveLength(0);

    committed(10);
    const ok = await importKeywords('acc', 'trial', [item('deep', [80]), item('shallow', [3])], '');
    expect(ok).toMatchObject({ ok: true, keywords: 2 });
    expect(inserts.map((p) => p[6])).toEqual([100, 30]);
  });
});
