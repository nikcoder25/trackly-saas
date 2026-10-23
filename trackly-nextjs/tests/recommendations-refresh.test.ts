/**
 * Open recommendations must track the latest scans: a rule that still
 * holds refreshes its open row with the new numbers (UPDATE, not a second
 * INSERT), and the row retires once the condition is gone.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryFn } = vi.hoisted(() => ({ queryFn: vi.fn() }));

vi.mock('@/lib/db', () => ({
  pool: {
    query: (sql: string, params: unknown[] = []) => queryFn(sql, params),
  },
  safeConnect: vi.fn(),
  ensureColumns: vi.fn().mockResolvedValue(undefined),
  auditLog: vi.fn(),
}));

import { refreshRecommendationsAfterRun } from '@/lib/recommendations-engine';

interface QueryCall { sql: string; params: unknown[] }

function makeResponder(opts: {
  plan?: string;
  grok: { runs: number; mentions: number };
  calls: QueryCall[];
}) {
  return (sql: string, params: unknown[] = []) => {
    opts.calls.push({ sql, params });
    if (/SELECT user_id, data FROM brands/.test(sql)) {
      return { rows: [{ user_id: 'user_A', data: { platforms: ['ChatGPT', 'Grok'] } }] };
    }
    if (/SELECT plan, trial_ends_at FROM users/.test(sql)) {
      return { rows: [{ plan: opts.plan ?? 'pro', trial_ends_at: null }] };
    }
    if (/SELECT batch_id/.test(sql)) return { rows: [{ batch_id: 'run_2' }, { batch_id: 'run_1' }] };
    if (/AVG\(CASE WHEN mentioned/.test(sql)) {
      return { rows: [{ total: String(10 + opts.grok.runs), mentions: String(9 + opts.grok.mentions), avg_rank: null }] };
    }
    if (/GROUP BY platform/.test(sql)) {
      return { rows: [{ platform: 'ChatGPT', runs: 10, mentions: 9 }, { platform: 'Grok', ...opts.grok }] };
    }
    if (/SELECT COUNT\(\*\)::int AS cnt/.test(sql)) return { rows: [{ cnt: 0 }] };
    if (/SELECT type, prompt FROM recommendations/.test(sql)) {
      return { rows: [{ type: 'platform_gap', prompt: 'Grok' }] };
    }
    return { rows: [] };
  };
}

beforeEach(() => {
  queryFn.mockReset();
});

describe('refreshRecommendationsAfterRun', () => {
  it('updates an open platform_gap row with the new numbers instead of inserting', async () => {
    const calls: QueryCall[] = [];
    queryFn.mockImplementation(makeResponder({ grok: { runs: 10, mentions: 0 }, calls }));

    await refreshRecommendationsAfterRun('brand_A');

    expect(calls.some(c => /INSERT INTO recommendations/.test(c.sql))).toBe(false);
    const update = calls.find(c => /UPDATE recommendations\s+SET severity/.test(c.sql));
    expect(update).toBeDefined();
    expect(update!.params[1]).toBe('Low visibility on Grok (0% vs 45% average)');
    expect(update!.params.slice(4)).toEqual(['brand_A', 'platform_gap', 'Grok']);
    expect(JSON.parse(update!.params[3] as string)).toEqual({ platform: 'Grok', rate: 0, avgRate: 0.45 });
    expect(calls.some(c => /SET status = 'done'/.test(c.sql))).toBe(false);

    // Rules judge only the recent scans
    const platformQuery = calls.find(c => /GROUP BY platform/.test(c.sql))!;
    expect(platformQuery.sql).toMatch(/batch_id = ANY\(\$2\)/);
    expect(platformQuery.params).toEqual(['brand_A', ['run_2', 'run_1']]);
  });

  it('retires the open platform_gap row once the gap is gone', async () => {
    const calls: QueryCall[] = [];
    queryFn.mockImplementation(makeResponder({ grok: { runs: 10, mentions: 9 }, calls }));

    await refreshRecommendationsAfterRun('brand_A');

    expect(calls.some(c => /INSERT INTO recommendations/.test(c.sql))).toBe(false);
    expect(calls.some(c => /UPDATE recommendations\s+SET severity/.test(c.sql))).toBe(false);
    const retire = calls.find(c => /SET status = 'done'/.test(c.sql));
    expect(retire).toBeDefined();
    expect(retire!.params).toEqual(['brand_A', 'platform_gap', 'Grok']);
  });

  it('skips plans without recommendations and never throws', async () => {
    const calls: QueryCall[] = [];
    queryFn.mockImplementation(makeResponder({ plan: 'starter', grok: { runs: 10, mentions: 0 }, calls }));
    await refreshRecommendationsAfterRun('brand_A');
    expect(calls.some(c => /FROM prompt_runs/.test(c.sql))).toBe(false);

    queryFn.mockReset();
    queryFn.mockRejectedValue(new Error('db down'));
    await expect(refreshRecommendationsAfterRun('brand_A')).resolves.toBeUndefined();
  });
});
