/**
 * Fix Engine - decay, cannibalisation, content-gap and the shared helpers
 * they introduced (comparison windows, zero-click screening, depth
 * extraction, robots parsing).
 *
 * All pure logic or GSC-mocked: no network, no DB.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FixContext } from '@/lib/fix-engine/types';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const gscState = vi.hoisted(() => ({
  recentRows: [] as any[],
  prevRows: [] as any[],
  rows: [] as any[],
  token: { accessToken: 'tok', siteUrl: 'https://acme.test/' } as any,
  callCount: 0,
}));

vi.mock('@/lib/fix-engine/gsc', async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return {
    ...actual,
    getValidAccessToken: vi.fn(async () => gscState.token),
    // comparisonWindows is deliberately NOT mocked — it is under test below.
    // detect() issues the recent window first and the previous one second
    // (Promise.all preserves array order of invocation), so the call counter
    // is what tells them apart.
    searchAnalytics: vi.fn(async () => {
      if (gscState.rows.length) return gscState.rows;
      return gscState.callCount++ === 0 ? gscState.recentRows : gscState.prevRows;
    }),
    trailingDateRange: () => ({ startDate: '2026-01-01', endDate: '2026-01-28' }),
  };
});

vi.mock('@/lib/fix-engine/crawl', () => ({
  crawlPage: vi.fn(async () => ({
    title: 't', metaDescription: 'm', text: 'body', headings: [], h1s: [],
    jsonLd: [], wordCount: 2, hasFaqSchema: false, url: 'u', status: 200,
    lastModified: null,
  })),
  jsonLdHasType: (blocks: unknown[], type: string) =>
    JSON.stringify(blocks).includes(`"${type}"`),
}));

import { comparisonWindows } from '@/lib/fix-engine/gsc';
import {
  aggregateByPage, classifyDecay, searchDecayModule,
  MIN_PREV_CLICKS, ROUTING,
} from '@/lib/fix-engine/modules/search-decay';
import { findCompetingPages } from '@/lib/fix-engine/modules/cannibalization';
import {
  isExcludedUrl, isBrandedQuery, scoreCandidate,
} from '@/lib/fix-engine/modules/content-gap';
import { hasZeroClickShape, screenZeroClickQueries } from '@/lib/fix-engine/intent';
import {
  visibleText, extractHeadings, hasDataTable, hasContentList,
  medianWordCount, profileFromHtml,
} from '@/lib/fix-engine/depth';
import { parseRobots } from '@/lib/page-render';
import { topicTokens } from '@/lib/fix-engine/ai-capture';
import { DECAY_VECTORS } from '@/lib/fix-engine/prompts';

const ctx = {
  brand: { id: 'b1', userId: 'u1', name: 'Acme Movers', website: 'https://acme.test' },
  tenantId: 'u1', userKeysLegacy: {},
} as unknown as FixContext;

beforeEach(() => {
  gscState.recentRows = [];
  gscState.prevRows = [];
  gscState.rows = [];
  gscState.token = { accessToken: 'tok', siteUrl: 'https://acme.test/' };
  gscState.callCount = 0;
  delete process.env.DATAFORSEO_LOGIN;
  delete process.env.DATAFORSEO_PASSWORD;
  vi.clearAllMocks();
});

// ── comparison windows ────────────────────────────────────────────

describe('comparisonWindows', () => {
  it('produces two adjacent windows that never share a day', () => {
    const { recent, previous } = comparisonWindows(28);
    expect(previous.endDate < recent.startDate).toBe(true);
    const gapDays =
      (Date.parse(recent.startDate) - Date.parse(previous.endDate)) / 86_400_000;
    expect(gapDays).toBe(1);
  });

  it('makes both windows the requested length', () => {
    const { recent, previous } = comparisonWindows(28);
    const len = (r: { startDate: string; endDate: string }) =>
      (Date.parse(r.endDate) - Date.parse(r.startDate)) / 86_400_000;
    expect(len(recent)).toBe(28);
    expect(len(previous)).toBe(28);
  });

  it('honours the GSC reporting lag', () => {
    const { recent } = comparisonWindows(28);
    const daysAgo = (Date.now() - Date.parse(recent.endDate)) / 86_400_000;
    expect(daysAgo).toBeGreaterThanOrEqual(1.5);
  });
});

// ── decay classification ──────────────────────────────────────────

const w = (clicks: number, impressions: number, position: number) => ({
  clicks, impressions, ctr: impressions ? clicks / impressions : 0, position,
});

describe('classifyDecay', () => {
  it('flags a quiet decay when clicks fall but the ranking holds', () => {
    expect(classifyDecay(w(40, 1000, 3.1), w(20, 1000, 3.2)))
      .toEqual({ decayed: true, pattern: 'quiet' });
  });

  it('flags drifting decay when the position also slipped moderately', () => {
    expect(classifyDecay(w(40, 1000, 3), w(20, 900, 6)))
      .toEqual({ decayed: true, pattern: 'drifting' });
  });

  it('flags a collapse when the ranking dropped sharply', () => {
    expect(classifyDecay(w(40, 1000, 3), w(20, 800, 22)))
      .toEqual({ decayed: true, pattern: 'collapsed' });
  });

  it('treats a page that vanished entirely as a collapse, not quiet decay', () => {
    // The recent window reports position 0 because there is no row at all.
    // Reading that as "improved to position 0" would be the obvious bug.
    expect(classifyDecay(w(40, 1000, 4), w(0, 0, 0)))
      .toEqual({ decayed: true, pattern: 'collapsed' });
  });

  it('ignores a large relative drop on tiny numbers', () => {
    // 3 → 1 clicks is a 67% fall and means nothing.
    expect(classifyDecay(w(3, 90, 5), w(1, 88, 5)).decayed).toBe(false);
  });

  it('ignores a small relative drop on big numbers', () => {
    expect(classifyDecay(w(500, 9000, 3), w(480, 9000, 3)).decayed).toBe(false);
  });

  it('requires the absolute loss floor as well as the relative one', () => {
    // 11 → 8 is 27% down, clearing the relative floor, but only 3 clicks.
    expect(classifyDecay(w(11, 400, 4), w(8, 400, 4)).decayed).toBe(false);
  });

  it('uses a click floor an ordinary local-business page can clear', () => {
    // The widely-copied version of this agent requires 100 prior clicks,
    // which no page on a small local site ever reaches.
    expect(MIN_PREV_CLICKS).toBeLessThanOrEqual(10);
    expect(classifyDecay(w(12, 500, 3), w(4, 500, 3)).decayed).toBe(true);
  });

  it('flags an impressions collapse even when clicks were always few', () => {
    expect(classifyDecay(w(4, 900, 8), w(1, 200, 9)))
      .toEqual({ decayed: true, pattern: 'impressions_lost' });
  });

  it('does not flag a healthy, growing page', () => {
    expect(classifyDecay(w(40, 1000, 4), w(60, 1300, 3)).decayed).toBe(false);
  });
});

describe('aggregateByPage', () => {
  it('weights position by impressions so a stray long-tail query cannot skew it', () => {
    const agg = aggregateByPage([
      { keys: ['/p', 'main'], clicks: 10, impressions: 1000, position: 2 },
      { keys: ['/p', 'stray'], clicks: 0, impressions: 5, position: 60 },
    ]);
    const p = agg.get('/p')!;
    const position = p.posSum / p.posWeight;
    // A flat mean would give 31 and read as a catastrophic page.
    expect(position).toBeLessThan(3);
  });

  it('sums clicks and impressions across queries', () => {
    const agg = aggregateByPage([
      { keys: ['/p', 'a'], clicks: 3, impressions: 100, position: 4 },
      { keys: ['/p', 'b'], clicks: 2, impressions: 50, position: 8 },
    ]);
    expect(agg.get('/p')!.clicks).toBe(5);
    expect(agg.get('/p')!.impressions).toBe(150);
  });
});

describe('search-decay detect', () => {
  it('flags the decayed page and leaves the healthy one alone', async () => {
    gscState.prevRows = [
      { keys: ['https://acme.test/dying', 'q1'], clicks: 40, impressions: 1000, ctr: 0.04, position: 3 },
      { keys: ['https://acme.test/fine', 'q2'], clicks: 30, impressions: 800, ctr: 0.037, position: 4 },
    ];
    gscState.recentRows = [
      { keys: ['https://acme.test/dying', 'q1'], clicks: 12, impressions: 1000, ctr: 0.012, position: 3.1 },
      { keys: ['https://acme.test/fine', 'q2'], clicks: 33, impressions: 820, ctr: 0.04, position: 3.8 },
    ];
    const issues = await searchDecayModule.detect(ctx);
    expect(issues.map((i) => i.targetUrl)).toEqual(['https://acme.test/dying']);
    expect(issues[0].detected.pattern).toBe('quiet');
    expect(issues[0].summary).toContain('-70%');
  });

  it('catches a page that disappeared from the recent window', async () => {
    gscState.prevRows = [
      { keys: ['https://acme.test/gone', 'q1'], clicks: 30, impressions: 900, ctr: 0.033, position: 5 },
    ];
    gscState.recentRows = [];
    const issues = await searchDecayModule.detect(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].detected.pattern).toBe('collapsed');
    expect(issues[0].severity).toBe('critical');
  });

  it('orders the worst loss first', async () => {
    gscState.prevRows = [
      { keys: ['https://acme.test/small', 'q'], clicks: 20, impressions: 500, ctr: 0.04, position: 4 },
      { keys: ['https://acme.test/big', 'q'], clicks: 200, impressions: 5000, ctr: 0.04, position: 4 },
    ];
    gscState.recentRows = [
      { keys: ['https://acme.test/small', 'q'], clicks: 10, impressions: 500, ctr: 0.02, position: 4 },
      { keys: ['https://acme.test/big', 'q'], clicks: 50, impressions: 5000, ctr: 0.01, position: 4 },
    ];
    const issues = await searchDecayModule.detect(ctx);
    expect(issues[0].targetUrl).toBe('https://acme.test/big');
  });

  it('returns nothing when GSC is not connected', async () => {
    gscState.token = null;
    expect(await searchDecayModule.detect(ctx)).toEqual([]);
  });

  it('is marked diagnostic so it stays out of outcome measurement', () => {
    expect(searchDecayModule.diagnostic).toBe(true);
  });

  it('writes nothing when shipped', async () => {
    const res = await searchDecayModule.ship(
      { key: 'k', targetUrl: 'https://acme.test/p', severity: 'high', summary: '', detected: {} },
      { generated: { primaryCause: 'stale_content', confidence: 7, routeTo: ROUTING.stale_content } },
      ctx,
    );
    expect(res.ok).toBe(true);
    expect(res.detail.diagnostic).toBe(true);
    expect(res.detail.recommendedModule).toBe('content-freshness');
  });

  it('routes every possible diagnosis to a module', () => {
    for (const vector of DECAY_VECTORS) {
      expect(ROUTING[vector]?.module).toBeTruthy();
    }
  });
});

// ── cannibalisation ───────────────────────────────────────────────

describe('findCompetingPages', () => {
  it('flags a query served by two of our pages', () => {
    const out = findCompetingPages([
      { keys: ['/a', 'movers near me'], clicks: 5, impressions: 300, position: 4 },
      { keys: ['/b', 'movers near me'], clicks: 2, impressions: 200, position: 9 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].pages.map((p) => p.url)).toEqual(['/a', '/b']);
  });

  it('ignores stray long-tail overlap below the share floor', () => {
    const out = findCompetingPages([
      { keys: ['/a', 'q'], clicks: 50, impressions: 1000, position: 2 },
      { keys: ['/b', 'q'], clicks: 0, impressions: 12, position: 40 },
    ]);
    expect(out).toEqual([]);
  });

  it('ignores queries without enough total demand', () => {
    const out = findCompetingPages([
      { keys: ['/a', 'q'], clicks: 1, impressions: 30, position: 4 },
      { keys: ['/b', 'q'], clicks: 1, impressions: 30, position: 6 },
    ]);
    expect(out).toEqual([]);
  });

  it('ignores a query served by only one page', () => {
    const out = findCompetingPages([
      { keys: ['/a', 'q'], clicks: 20, impressions: 900, position: 3 },
    ]);
    expect(out).toEqual([]);
  });

  it('orders the highest-demand conflict first', () => {
    const out = findCompetingPages([
      { keys: ['/a', 'small'], clicks: 1, impressions: 120, position: 5 },
      { keys: ['/b', 'small'], clicks: 1, impressions: 110, position: 7 },
      { keys: ['/c', 'big'], clicks: 9, impressions: 900, position: 5 },
      { keys: ['/d', 'big'], clicks: 4, impressions: 800, position: 7 },
    ]);
    expect(out[0].query).toBe('big');
  });
});

// ── content-gap selection ─────────────────────────────────────────

describe('content-gap target selection', () => {
  it('excludes formats a content expansion cannot help', () => {
    expect(isExcludedUrl('https://a.test/guide.pdf')).toBe(true);
    expect(isExcludedUrl('https://a.test/tag/moving/')).toBe(true);
    expect(isExcludedUrl('https://a.test/checkout')).toBe(true);
    expect(isExcludedUrl('https://a.test/privacy-policy')).toBe(true);
    expect(isExcludedUrl('https://a.test/long-distance-moving')).toBe(false);
  });

  it('treats navigational queries as branded', () => {
    expect(isBrandedQuery('acme login', 'Acme Movers')).toBe(true);
    expect(isBrandedQuery('contact', 'Acme Movers')).toBe(true);
  });

  it('does not treat an industry word in the brand name as branded', () => {
    // "Green Bay Moving Co" must not make every "moving" query navigational.
    expect(isBrandedQuery('cost of moving a piano', 'Green Bay Moving Co')).toBe(false);
  });

  it('does not swallow the geo+service money query', () => {
    // "green bay movers" shares every word with the brand name and is the
    // most valuable commercial query the business has. Skipping it would be
    // the worst possible false positive.
    expect(isBrandedQuery('green bay movers', 'Green Bay Moving Co', 'Green Bay')).toBe(false);
  });

  it('recognises a distinctive brand token', () => {
    expect(isBrandedQuery('acme reviews', 'Acme Movers', 'Dallas')).toBe(true);
    expect(isBrandedQuery('long distance moving cost', 'Acme Movers', 'Dallas')).toBe(false);
  });

  it('ranks commercial intent above a same-volume informational query', () => {
    const base = { url: '/a', clicks: 1, impressions: 500, position: 10 };
    const commercial = scoreCandidate({ ...base, query: 'buy widgets', intent: 'commercial' });
    const informational = scoreCandidate({ ...base, query: 'widget history', intent: 'informational' });
    expect(commercial).toBeGreaterThan(informational);
  });

  it('ranks a more winnable position above a deeper one', () => {
    const near = scoreCandidate({ url: '/a', query: 'q', clicks: 1, impressions: 500, position: 7 });
    const far = scoreCandidate({ url: '/b', query: 'q', clicks: 1, impressions: 500, position: 19 });
    expect(near).toBeGreaterThan(far);
  });

  it('lets volume outweigh phrasing', () => {
    const big = scoreCandidate({ url: '/a', query: 'movers', clicks: 1, impressions: 5000, position: 12 });
    const small = scoreCandidate({ url: '/b', query: 'best movers', clicks: 1, impressions: 300, position: 12 });
    expect(big).toBeGreaterThan(small);
  });
});

// ── zero-click screening ──────────────────────────────────────────

describe('zero-click shape', () => {
  it('recognises definitional and conversion queries', () => {
    expect(hasZeroClickShape('what is seer rating')).toBe(true);
    expect(hasZeroClickShape('what does seer mean')).toBe(true);
    expect(hasZeroClickShape('define hvac')).toBe(true);
    expect(hasZeroClickShape('how many btu in a ton')).toBe(true);
    expect(hasZeroClickShape('btu calculator')).toBe(true);
  });

  it('leaves ordinary informational queries alone', () => {
    expect(hasZeroClickShape('how to clean an air filter')).toBe(false);
    expect(hasZeroClickShape('why is my ac freezing up')).toBe(false);
  });

  it('does not treat price queries as zero-click', () => {
    // For a service business these are the top of the buying funnel.
    expect(hasZeroClickShape('how much does a new furnace cost')).toBe(false);
  });

  it('excludes suspects on shape alone when intent data is unavailable', async () => {
    const excluded = await screenZeroClickQueries(['what is seer rating', 'best hvac company']);
    expect(excluded.has('what is seer rating')).toBe(true);
    expect(excluded.has('best hvac company')).toBe(false);
  });
});

// ── depth extraction ──────────────────────────────────────────────

describe('depth extraction', () => {
  it('strips scripts, styles and chrome from the text', () => {
    const html = '<nav>Home About</nav><script>var x=1</script><style>.a{}</style><p>Real body copy.</p>';
    const text = visibleText(html);
    expect(text).toBe('Real body copy.');
  });

  it('reads headings in order with their level', () => {
    const html = '<h1>Title</h1><h2>First <em>part</em></h2><h3>Detail</h3>';
    expect(extractHeadings(html)).toEqual(['H1: Title', 'H2: First part', 'H3: Detail']);
  });

  it('counts a data table but not a layout table', () => {
    const data = '<table><tr><th>a</th></tr><tr><td>1</td></tr><tr><td>2</td></tr></table>';
    const layout = '<table><tr><td>logo</td></tr></table>';
    expect(hasDataTable(data)).toBe(true);
    expect(hasDataTable(layout)).toBe(false);
  });

  it('counts a content list but not a nav menu', () => {
    const nav = '<ul><li>Home</li><li>About</li><li>Contact</li></ul>';
    const content = `<ul>${'<li>' + 'a substantial list item with real explanatory prose in it '.repeat(2) + '</li>'.repeat(1)}`
      + '<li>another substantial item carrying real explanatory content for the reader</li>'
      + '<li>a third item that also carries a meaningful amount of prose text</li></ul>';
    expect(hasContentList(nav)).toBe(false);
    expect(hasContentList(content)).toBe(true);
  });

  it('profiles a page into comparable metrics', () => {
    const html = '<title>Guide</title><h2>Costs</h2><p>' + 'word '.repeat(400) + '</p>'
      + '<script type="application/ld+json">{"@type":"FAQPage"}</script>';
    const p = profileFromHtml('https://x.test/g', html, false);
    expect(p.read).toBe(true);
    expect(p.title).toBe('Guide');
    expect(p.wordCount).toBeGreaterThan(300);
    expect(p.hasFaqSchema).toBe(true);
    expect(p.headings).toContain('H2: Costs');
  });

  it('takes the median so one huge competitor does not set the bar', () => {
    const mk = (wordCount: number) => ({ read: true, wordCount } as any);
    expect(medianWordCount([mk(800), mk(1000), mk(9000)])).toBe(1000);
  });

  it('ignores unread pages when computing the median', () => {
    const profiles = [
      { read: true, wordCount: 1000 }, { read: false, wordCount: 0 }, { read: true, wordCount: 1400 },
    ] as any[];
    expect(medianWordCount(profiles)).toBe(1200);
  });
});

// ── robots.txt parsing ────────────────────────────────────────────

describe('parseRobots', () => {
  it('prefers a group naming our agent over the wildcard group', () => {
    const rules = parseRobots(
      'User-agent: *\nDisallow: /\n\nUser-agent: livesov\nDisallow: /private\n',
      'livesov',
    );
    expect(rules.disallow).toEqual(['/private']);
  });

  it('falls back to the wildcard group', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /admin\n', 'livesov');
    expect(rules.disallow).toEqual(['/admin']);
  });

  it('treats an empty Disallow as no restriction', () => {
    const rules = parseRobots('User-agent: *\nDisallow:\n', 'livesov');
    expect(rules.disallow).toEqual([]);
  });

  it('ignores comments and blank lines', () => {
    const rules = parseRobots('# a comment\nUser-agent: *\nDisallow: /x # trailing\n', 'livesov');
    expect(rules.disallow).toEqual(['/x']);
  });

  it('collects Allow rules alongside Disallow', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /blog\nAllow: /blog/public\n', 'livesov');
    expect(rules.disallow).toEqual(['/blog']);
    expect(rules.allow).toEqual(['/blog/public']);
  });

  it('shares one rule block across consecutive user-agent lines', () => {
    const rules = parseRobots('User-agent: googlebot\nUser-agent: *\nDisallow: /x\n', 'livesov');
    expect(rules.disallow).toEqual(['/x']);
  });
});

// ── AI capture topic matching ─────────────────────────────────────

describe('topicTokens', () => {
  it('drops stopwords and short words', () => {
    const tokens = topicTokens(['what is the best furnace repair in dallas']);
    expect(tokens).toContain('furnace');
    expect(tokens).toContain('repair');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('best');
  });

  it('ranks repeated terms first', () => {
    const tokens = topicTokens(['furnace repair', 'furnace install', 'furnace tune up']);
    expect(tokens[0]).toBe('furnace');
  });

  it('returns nothing for queries made only of stopwords', () => {
    expect(topicTokens(['what is the best'])).toEqual([]);
  });
});
