import { afterEach, describe, expect, it, vi } from 'vitest';

import { litescrapeProvider } from '../rank-tracking/providers/litescrape';
import { fetchPageWithFallback, primaryProvider } from '../rank-tracking/providers';
import { ProviderError, type SerpPageRequest } from '../rank-tracking/providers/types';

const req = (page: number): SerpPageRequest => ({
  keyword: 'ac repair clinton ma',
  locationCode: null,
  locationName: 'Clinton,Massachusetts,United States',
  device: 'desktop',
  language: 'en',
  page,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('litescrape provider', () => {
  it('sends city location and bearer key for page 1', async () => {
    vi.stubEnv('LITESCRAPE_API_KEY', 'k1');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      organic_results: [
        { position: 1, link: 'https://www.tcs-ma.com/ac-repair/', title: 'AC Repair' },
        { position: 2, link: 'https://yelp.com/x', title: 'Yelp' },
        { position: 3, title: 'no link' },
      ],
    })));
    vi.stubGlobal('fetch', fetchMock);
    const page = await litescrapeProvider.fetchSerpPage(req(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const u = new URL(url);
    expect(u.searchParams.get('location')).toBe('Clinton, Massachusetts, United States');
    expect(u.searchParams.get('gl')).toBe('us');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k1');
    expect(page.organic.map((o) => [o.position, o.domain])).toEqual([[1, 'tcs-ma.com'], [2, 'yelp.com']]);
  });

  it('refuses pages after 1 so the fallback answers them', async () => {
    vi.stubEnv('LITESCRAPE_API_KEY', 'k1');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const e = await litescrapeProvider.fetchSerpPage(req(2)).catch((x) => x);
    expect(e).toBeInstanceOf(ProviderError);
    expect(e.retryable).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls through to the next provider for page 2', async () => {
    vi.stubEnv('LITESCRAPE_API_KEY', 'k1');
    const other = { name: 'serper', costPerPage: 0.001, configured: () => true,
      fetchSerpPage: async () => ({ organic: [{ position: 11, url: 'https://a.com', domain: 'a.com', title: 'a' }], cost: 0.001 }) };
    const r = await fetchPageWithFallback(req(2), [litescrapeProvider, other], async () => {});
    expect(r.provider).toBe('serper');
  });

  it('treats 503 as retryable and 401 as final', async () => {
    vi.stubEnv('LITESCRAPE_API_KEY', 'k1');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    const e1 = await litescrapeProvider.fetchSerpPage(req(1)).catch((e) => e);
    expect(e1).toBeInstanceOf(ProviderError);
    expect(e1.retryable).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    const e2 = await litescrapeProvider.fetchSerpPage(req(1)).catch((e) => e);
    expect(e2.retryable).toBe(false);
  });

  it('is the default primary only when its key is set', () => {
    vi.stubEnv('RANK_SERP_PROVIDER', '');
    vi.stubEnv('LITESCRAPE_API_KEY', '');
    expect(primaryProvider().name).toBe('dataforseo');
    vi.stubEnv('LITESCRAPE_API_KEY', 'k1');
    expect(primaryProvider().name).toBe('litescrape');
    vi.stubEnv('RANK_SERP_PROVIDER', 'serper');
    expect(primaryProvider().name).toBe('serper');
  });
});
