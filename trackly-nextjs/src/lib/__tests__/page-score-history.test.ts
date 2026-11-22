import { describe, it, expect, vi } from 'vitest';

vi.mock('../db', () => ({ pool: { query: vi.fn() } }));

import { pageUrlKey, compareSnapshots, type Snapshot } from '../page-score-history';

const snap = (overall: number, cats: Record<string, number>, at: string): Snapshot => ({
  id: at, url: 'https://site.com/page', overallScore: overall, wordCount: 100, createdAt: at,
  categories: Object.entries(cats).map(([name, score]) => ({ name, score })),
});

describe('pageUrlKey', () => {
  it('treats www, trailing slash, query, hash and case as the same page', () => {
    const key = pageUrlKey('https://site.com/page');
    expect(pageUrlKey('https://www.Site.com/page/?utm=1#top')).toBe(key);
    expect(pageUrlKey('http://site.com/page')).toBe(key);
    expect(key).toBe('site.com/page');
  });
  it('keeps different paths apart', () => {
    expect(pageUrlKey('https://site.com/a')).not.toBe(pageUrlKey('https://site.com/b'));
    expect(pageUrlKey('https://site.com/')).toBe('site.com');
  });
});

describe('compareSnapshots', () => {
  it('reports overall and per-category change', () => {
    const c = compareSnapshots(
      snap(48, { Schema: 20, Content: 60 }, '2026-01-01T00:00:00.000Z'),
      snap(76, { Schema: 80, Content: 55 }, '2026-02-01T00:00:00.000Z'),
      3,
    );
    expect(c.delta).toBe(28);
    expect(c.checks).toBe(3);
    expect(c.categories).toEqual([
      { name: 'Schema', before: 20, after: 80, delta: 60 },
      { name: 'Content', before: 60, after: 55, delta: -5 },
    ]);
  });
  it('gives a zero change for a category the baseline did not have', () => {
    const c = compareSnapshots(snap(50, {}, 'a'), snap(60, { New: 70 }, 'b'));
    expect(c.categories[0]).toEqual({ name: 'New', before: 70, after: 70, delta: 0 });
  });
});
