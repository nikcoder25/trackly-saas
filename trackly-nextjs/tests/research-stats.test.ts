import { describe, it, expect, vi, beforeEach } from 'vitest';

// Tests for the State of AI Search aggregate module. The privacy gates are
// the load-bearing behavior here: thin samples and low brand-diversity
// platforms must never be published.

const { queryFn } = vi.hoisted(() => ({ queryFn: vi.fn() }));

vi.mock('@/lib/db', () => ({
  pool: { query: (sql: string, params?: unknown[]) => queryFn(sql, params) },
}));

import { getStateOfAiSearchStats, __clearResearchStatsCache } from '@/lib/research-stats';

function mockDb({
  totals,
  platforms = [],
  citations = [],
  issues = [],
}: {
  totals: Record<string, unknown>;
  platforms?: Array<Record<string, unknown>>;
  citations?: Array<Record<string, unknown>>;
  issues?: Array<Record<string, unknown>>;
}) {
  queryFn.mockImplementation(async (sql: string) => {
    if (sql.includes('COUNT(DISTINCT prompt)')) return { rows: [totals] };
    if (sql.includes('GROUP BY platform') && sql.includes('mention_rate')) return { rows: platforms };
    if (sql.includes('jsonb_array_elements_text')) return { rows: citations };
    if (sql.includes('FROM accuracy_issues')) return { rows: issues };
    throw new Error('unexpected SQL: ' + sql.slice(0, 80));
  });
}

const goodTotals = {
  responses: '10000',
  brands: '40',
  prompts: '300',
  window_start: '2026-03-12T00:00:00Z',
  window_end: '2026-06-10T00:00:00Z',
};

const platformRow = (platform: string, over: Record<string, unknown> = {}) => ({
  platform,
  responses: '2000',
  brands: '30',
  mention_rate: '0.25',
  recommendation_rate: '0.10',
  pos: '500',
  neu: '1200',
  neg: '300',
  avg_list_position: '2.4',
  ...over,
});

describe('getStateOfAiSearchStats', () => {
  beforeEach(() => {
    queryFn.mockReset();
    __clearResearchStatsCache();
  });

  it('returns null when the total sample is below the publication threshold', async () => {
    mockDb({ totals: { ...goodTotals, responses: '100' } });
    expect(await getStateOfAiSearchStats()).toBeNull();
  });

  it('returns null (not a crash) when the database is unreachable', async () => {
    queryFn.mockRejectedValue(new Error('connection refused'));
    expect(await getStateOfAiSearchStats()).toBeNull();
  });

  it('excludes platforms below the per-platform response or brand-diversity gates', async () => {
    mockDb({
      totals: goodTotals,
      platforms: [
        platformRow('ChatGPT'),
        platformRow('Claude', { responses: '50' }), // below MIN_RESPONSES
        platformRow('Grok', { brands: '2' }), // below MIN_BRANDS (k-anonymity)
      ],
    });
    const stats = await getStateOfAiSearchStats();
    expect(stats).not.toBeNull();
    expect(stats!.platforms.map((p) => p.platform)).toEqual(['ChatGPT']);
  });

  it('returns null when no platform passes the gates', async () => {
    mockDb({ totals: goodTotals, platforms: [platformRow('Claude', { brands: '1' })] });
    expect(await getStateOfAiSearchStats()).toBeNull();
  });

  it('computes sentiment shares over labeled responses and accuracy per 1k', async () => {
    mockDb({
      totals: goodTotals,
      platforms: [platformRow('ChatGPT')],
      citations: [
        { domain: 'wikipedia.org', hits: '600' },
        { domain: 'reddit.com', hits: '400' },
      ],
      issues: [{ platform: 'ChatGPT', issues: '10' }],
    });
    const stats = await getStateOfAiSearchStats();
    expect(stats).not.toBeNull();
    const p = stats!.platforms[0];
    expect(p.mentionRate).toBeCloseTo(0.25);
    expect(p.sentiment.positive).toBeCloseTo(500 / 2000);
    expect(p.sentiment.neutral).toBeCloseTo(1200 / 2000);
    expect(p.avgListPosition).toBeCloseTo(2.4);
    expect(stats!.topCitedDomains).toEqual([
      { domain: 'wikipedia.org', share: 0.6 },
      { domain: 'reddit.com', share: 0.4 },
    ]);
    // 10 issues over 2000 responses = 5 per 1k
    expect(stats!.accuracyIssuesPer1k).toEqual([{ platform: 'ChatGPT', per1k: 5 }]);
  });

  it('caches the computed result (and caches null results too)', async () => {
    mockDb({ totals: goodTotals, platforms: [platformRow('ChatGPT')] });
    await getStateOfAiSearchStats();
    const callsAfterFirst = queryFn.mock.calls.length;
    await getStateOfAiSearchStats();
    expect(queryFn.mock.calls.length).toBe(callsAfterFirst);
  });
});
