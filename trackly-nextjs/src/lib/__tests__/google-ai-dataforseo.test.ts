import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseAiItems } from '../google-ai-dataforseo';

describe('parseAiItems', () => {
  it('reads markdown and reference urls from ai_overview items', () => {
    const a = parseAiItems([
      { type: 'organic', title: 'x' },
      { type: 'ai_overview', markdown: 'IG Metall Rechner is a salary tool.', references: [{ url: 'https://a.com' }],
        items: [{ type: 'ai_overview_element', references: [{ url: 'https://b.com' }] }] },
    ]);
    expect(a.empty).toBe(false);
    expect(a.text).toContain('IG Metall Rechner');
    expect(a.citations).toEqual(['https://a.com', 'https://b.com']);
  });

  it('falls back to element text when markdown is missing', () => {
    const a = parseAiItems([{ type: 'ai_overview', items: [{ title: 'Heading', text: 'Body' }] }]);
    expect(a.text).toBe('Heading\nBody');
  });

  it('is empty when Google showed no AI answer', () => {
    expect(parseAiItems([{ type: 'organic' }]).empty).toBe(true);
    expect(parseAiItems(null).empty).toBe(true);
  });
});

describe('litescrape 402', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('marks the account exhausted and skips further calls', async () => {
    process.env.LITESCRAPE_API_KEY = 'k';
    const fetchMock = vi.fn(async () => new Response('{}', { status: 402 }));
    vi.stubGlobal('fetch', fetchMock);
    const ls = await import('../litescrape');
    await expect(ls.googleAiOverview('q')).rejects.toMatchObject({ budgetExhausted: true });
    expect(ls.litescrapeConfigured()).toBe(false);
    await expect(ls.googleAiMode('q')).rejects.toMatchObject({ budgetExhausted: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    delete process.env.LITESCRAPE_API_KEY;
  });
});
