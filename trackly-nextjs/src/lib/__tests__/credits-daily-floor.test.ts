import { describe, it, expect, vi, beforeEach } from 'vitest';

const queries: Array<{ sql: string; params: unknown[] }> = [];
vi.mock('../db', () => ({
  pool: {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (/^\s*UPDATE usage_counters\s+SET monthly_used = monthly_used \+/.test(sql)) {
        const [, amount, daily, , , monthlyCap, dailyCap] = params as number[];
        if (amount > monthlyCap || daily > dailyCap) return { rows: [] };
        return { rows: [{ monthly_used: amount, manual_daily_used: daily }] };
      }
      const today = new Date().toISOString().slice(0, 10);
      const month = today.slice(0, 8) + '01';
      return { rows: [{ user_id: 'u', period_month: month, monthly_used: 0, daily_date: today, manual_daily_used: 0 }], rowCount: 1 };
    }),
  },
}));

import { reserveCredits } from '../credits';

describe('manual daily cap floor', () => {
  beforeEach(() => { queries.length = 0; });

  it('blocks a 70-credit trial scan without the floor (cap 60)', async () => {
    const r = await reserveCredits('u', 'trial', 70, 'manual');
    expect(r.ok).toBe(false);
  });

  it('allows a 70-credit trial scan when at least 5 full runs per day are guaranteed', async () => {
    const r = await reserveCredits('u', 'trial', 70, 'manual', undefined, { minFullRunsPerDay: 5 });
    expect(r.ok).toBe(true);
    const upd = queries.find(q => /monthly_used = monthly_used \+/.test(q.sql))!;
    expect(upd.params[6]).toBe(350);
  });
});
