/**
 * Provider choice and fallback.
 *
 * RANK_SERP_PROVIDER picks the primary (default dataforseo),
 * RANK_SERP_FALLBACK the second (default serper). Either can be any
 * registered adapter; adding a cheaper API later (Serpent, Litescrape) is
 * one new file plus one line in PROVIDERS.
 *
 * fetchPageWithFallback: a provider error or an empty page is retried once
 * on the same provider, then the other provider gets the request.
 */
import { dataForSeoProvider } from './dataforseo';
import { serperProvider } from './serper';
import { ProviderError, type SerpPage, type SerpPageRequest, type SerpProvider } from './types';

export const PROVIDERS: Record<string, SerpProvider> = {
  dataforseo: dataForSeoProvider,
  serper: serperProvider,
};

export function primaryProvider(): SerpProvider {
  return PROVIDERS[(process.env.RANK_SERP_PROVIDER || 'dataforseo').toLowerCase()] || dataForSeoProvider;
}

export function fallbackProvider(): SerpProvider | null {
  const name = (process.env.RANK_SERP_FALLBACK || 'serper').toLowerCase();
  if (name === 'none') return null;
  const p = PROVIDERS[name];
  return p && p !== primaryProvider() ? p : null;
}

/** The providers to try in order, configured ones only. */
export function providerChain(): SerpProvider[] {
  return [primaryProvider(), fallbackProvider()].filter((p): p is SerpProvider => !!p && p.configured());
}

export interface FetchedPage extends SerpPage {
  provider: string;
  /** Cost of every attempt, failed ones included. */
  totalCost: number;
}

type Sleep = (ms: number) => Promise<void>;
const defaultSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchPageWithFallback(
  req: SerpPageRequest,
  chain: SerpProvider[] = providerChain(),
  sleep: Sleep = defaultSleep,
): Promise<FetchedPage> {
  if (!chain.length) throw new ProviderError('rank', 'no SERP provider is configured (DATAFORSEO_LOGIN/PASSWORD or SERPER_API_KEY)', false);
  let lastErr: unknown = null;
  let totalCost = 0;
  for (const p of chain) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const page = await p.fetchSerpPage(req);
        totalCost += page.cost;
        // An empty first page is never a real Google answer for a keyword
        // anyone tracks: treat it as a failure. A later page can be empty.
        if (!page.organic.length && req.page === 1) throw new ProviderError(p.name, 'empty results');
        return { ...page, provider: p.name, totalCost };
      } catch (e) {
        lastErr = e;
        if (e instanceof ProviderError && !e.retryable) break;
        if (attempt === 0) await sleep(1500);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
