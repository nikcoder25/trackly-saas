import { afterEach, describe, expect, it, vi } from 'vitest';

import { flattenTextBlocks, geminiChat, googleAiMode, googleAiOverview, locationParams } from '../litescrape';
import { capPlatformsForPlan, isGoogleAiEngine } from '../constants';
import { engineName } from '../mcp/summarize';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('litescrape AI answers', () => {
  it('flattens paragraph, list and table blocks and drops Google UI chrome', () => {
    const text = flattenTextBlocks([
      { type: 'heading', snippet: 'Shared' },
      { type: 'paragraph', snippet: 'Top HVAC in Clinton:' },
      { type: 'list', list: [{ title: 'Granger AC', snippet: '24/7 service' }, { snippet: 'Whitney Brothers' }] },
      { type: 'table', table: [{ cells: ['Name', 'Rating'] }, { cells: ['TCS', '5.0'] }] },
      { type: 'heading', snippet: 'Share public link' },
    ]);
    expect(text).toBe('Top HVAC in Clinton:\nGranger AC 24/7 service\nWhitney Brothers\nName | Rating\nTCS | 5.0');
  });

  it('splits the "Google" label glued to AI Mode business names', () => {
    expect(flattenTextBlocks([{ type: 'list', list: [{ snippet: 'GoogleThe Comfort Specialists provides HVAC' }] }]))
      .toBe('The Comfort Specialists provides HVAC');
    expect(flattenTextBlocks([{ type: 'paragraph', snippet: 'Google reviews say Googlebot' }])).toBe('Google reviews say Googlebot');
  });

  it('passes the brand city as location', () => {
    expect(locationParams('Clinton, MA')).toEqual({ hl: 'en', gl: 'us', location: 'Clinton, MA' });
    expect(locationParams(null)).toEqual({ hl: 'en', gl: 'us' });
  });

  it('reads an AI Overview with its citations', async () => {
    vi.stubEnv('LITESCRAPE_API_KEY', 'k');
    const f = vi.fn(async () => json({
      ai_overview: {
        text_blocks: [{ type: 'paragraph', snippet: 'The Comfort Specialists are rated 5.0.' }],
        references: [{ link: 'https://tcs-ma.com/' }, { link: 'https://yelp.com/x' }],
      },
    }));
    vi.stubGlobal('fetch', f);
    const a = await googleAiOverview('best hvac clinton ma', 'Clinton, MA');
    expect(a).toEqual({ text: 'The Comfort Specialists are rated 5.0.', citations: ['https://tcs-ma.com/', 'https://yelp.com/x'], empty: false });
    const url = new URL((f.mock.calls[0] as unknown as [string])[0]);
    expect(url.pathname).toBe('/api/google/ai-overview');
    expect(url.searchParams.get('location')).toBe('Clinton, MA');
    expect(url.searchParams.get('q')).toBe('best hvac clinton ma');
  });

  it('marks a query with no AI Overview as empty, not an error', async () => {
    vi.stubEnv('LITESCRAPE_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(async () => json({ ai_overview: null })));
    expect(await googleAiOverview('q', null)).toEqual({ text: '', citations: [], empty: true });
  });

  it('keeps AI Mode reference titles in the text so brand detection sees them', async () => {
    vi.stubEnv('LITESCRAPE_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(async () => json({
      text_blocks: [{ type: 'paragraph', snippet: 'Here are local options.' }],
      references: [{ title: 'Granger AC Repair', snippet: '185 High St' }],
    })));
    const a = await googleAiMode('q', 'Clinton, MA');
    expect(a.text).toContain('Granger AC Repair: 185 High St');
  });

  it('sends Gemini the prompt param and throws on HTTP errors', async () => {
    vi.stubEnv('LITESCRAPE_API_KEY', 'k');
    const f = vi.fn(async () => json({ text: 'Answer' }));
    vi.stubGlobal('fetch', f);
    expect((await geminiChat('hello')).text).toBe('Answer');
    expect(new URL((f.mock.calls[0] as unknown as [string])[0]).searchParams.get('prompt')).toBe('hello');
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 503)));
    await expect(geminiChat('hello')).rejects.toThrow('HTTP 503');
  });

  it('throws without a key', async () => {
    vi.stubEnv('LITESCRAPE_API_KEY', '');
    await expect(googleAiOverview('q')).rejects.toThrow('LITESCRAPE_API_KEY');
  });
});

describe('Google AI engines and plan limits', () => {
  it('do not count toward the plan platform limit', () => {
    const picked = ['Google AI Overview', 'ChatGPT', 'Claude', 'Google AI Mode', 'Gemini'];
    expect(capPlatformsForPlan(picked, 2)).toEqual(['Google AI Overview', 'ChatGPT', 'Claude', 'Google AI Mode']);
    expect(isGoogleAiEngine('Gemini')).toBe(false);
  });

  it('are not misread as Gemini by the MCP summariser', () => {
    expect(engineName('Google AI Overview')).toBe('Google AI Overview');
    expect(engineName('Google AI Mode')).toBe('Google AI Mode');
    expect(engineName('Gemini')).toBe('Gemini');
  });
});
