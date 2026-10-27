/**
 * Serper.dev adapter (real Google results, synchronous). Used as the
 * fallback when the primary provider errors or returns nothing, or as the
 * primary when RANK_SERP_PROVIDER=serper. Serper has no device switch, so
 * mobile checks are answered with its default (desktop) results.
 *
 * SERPER_API_KEY is the same key the Fix Engine's SERP lookups use.
 * SERPER_COST_PER_PAGE sets the price used for the spend log (default
 * $0.001, the pay-as-you-go list price of one 10-result search).
 */
import { normalizeDomain } from '../domain';
import { ProviderError, type SerpProvider } from './types';

const COST = Number(process.env.SERPER_COST_PER_PAGE) || 0.001;

interface SerperOrganic { title?: string; link?: string; position?: number }

export const serperProvider: SerpProvider = {
  name: 'serper',
  costPerPage: COST,
  configured: () => !!process.env.SERPER_API_KEY,

  async fetchSerpPage(req) {
    const key = process.env.SERPER_API_KEY;
    if (!key) throw new ProviderError('serper', 'not configured', false);
    const country = req.locationName.split(',').map((s) => s.trim()).pop() || 'United States';
    let res: Response;
    try {
      res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: req.keyword,
          location: req.locationName.split(',').map((s) => s.trim()).join(', ') || undefined,
          gl: country.toLowerCase() === 'united states' ? 'us' : undefined,
          hl: req.language || 'en',
          num: 10,
          page: req.page,
        }),
        signal: AbortSignal.timeout(Number(process.env.SERPER_TIMEOUT_MS) || 20000),
      });
    } catch (e) {
      throw new ProviderError('serper', `request failed: ${(e as Error).message}`);
    }
    if (!res.ok) throw new ProviderError('serper', `HTTP ${res.status}`, res.status === 429 || res.status >= 500);
    const j = (await res.json()) as { organic?: SerperOrganic[] };
    const offset = (req.page - 1) * 10;
    const organic = (j.organic || [])
      .filter((o) => o.link)
      .map((o, i) => {
        const pos = Number(o.position) || i + 1;
        return {
          // Serper numbers each page from 1 or continues the count, depending on the request.
          position: pos <= 10 && req.page > 1 ? pos + offset : pos,
          url: String(o.link),
          domain: normalizeDomain(o.link),
          title: String(o.title || ''),
        };
      });
    return { organic, raw: j, cost: COST };
  },
};
