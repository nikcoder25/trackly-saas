/**
 * Litescrape adapter (real Google results, synchronous, city-level via
 * `location`). Cheapest tested provider at a flat $0.15 per 1,000 pages.
 * Becomes the primary automatically when LITESCRAPE_API_KEY is set and
 * RANK_SERP_PROVIDER is not, so DataForSEO/Serper only answer the pages
 * Litescrape fails on.
 *
 * Page 1 only. Tested Oct 2026 on 16 keywords from Clinton, MA: page 1
 * matched DataForSEO as well as Serper did, but pages 2+ (start=10, 20)
 * came back as unrelated results (state .gov pages, recipe blogs) for
 * most keywords. So later pages are refused as non-retryable and the
 * fallback provider answers them. With early stop most checks end on
 * page 1, which is where the saving is. ~5 s a page; 503 under load is
 * retryable and falls through to the next provider.
 *
 * LITESCRAPE_COST_PER_PAGE sets the price used for the spend log
 * (default $0.00015).
 */
import { normalizeDomain } from '../domain';
import { ProviderError, type SerpProvider } from './types';

const COST = Number(process.env.LITESCRAPE_COST_PER_PAGE) || 0.00015;

interface LitescrapeOrganic { title?: string; link?: string; position?: number }

export const litescrapeProvider: SerpProvider = {
  name: 'litescrape',
  costPerPage: COST,
  configured: () => !!process.env.LITESCRAPE_API_KEY,

  async fetchSerpPage(req) {
    const key = process.env.LITESCRAPE_API_KEY;
    if (!key) throw new ProviderError('litescrape', 'not configured', false);
    if (req.page > 1) throw new ProviderError('litescrape', 'page 1 only (later pages are unreliable)', false);
    const parts = req.locationName.split(',').map((s) => s.trim()).filter(Boolean);
    const country = parts[parts.length - 1] || 'United States';
    const params = new URLSearchParams({
      q: req.keyword,
      hl: req.language || 'en',
      device: req.device === 'mobile' ? 'mobile' : 'desktop',
    });
    if (parts.length) params.set('location', parts.join(', '));
    if (country.toLowerCase() === 'united states') params.set('gl', 'us');
    let res: Response;
    try {
      res = await fetch(`https://api.litescrape.com/api/google/search?${params}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(Number(process.env.LITESCRAPE_TIMEOUT_MS) || 45000),
      });
    } catch (e) {
      throw new ProviderError('litescrape', `request failed: ${(e as Error).message}`);
    }
    if (!res.ok) {
      throw new ProviderError('litescrape', `HTTP ${res.status}`, res.status === 429 || res.status >= 500);
    }
    const j = (await res.json()) as { organic_results?: LitescrapeOrganic[]; error?: string };
    if (j.error) throw new ProviderError('litescrape', j.error);
    const organic = (j.organic_results || [])
      .filter((o) => o.link)
      .map((o, i) => {
        return {
          position: Number(o.position) || i + 1,
          url: String(o.link),
          domain: normalizeDomain(o.link),
          title: String(o.title || ''),
        };
      });
    return { organic, raw: j, cost: COST };
  },
};
