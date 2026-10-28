/**
 * One rank check, Serpfox style: fetch page 1; if the tracked domain is on
 * it, stop. Otherwise fetch page 2, then page 3 (top 30), or on to page 10
 * for a top-100 check. Never pay for a page after the match, and stop
 * early when Google runs out of results.
 *
 * `afterPage` is the decision on its own so the queued (DataForSEO
 * Standard) path in scheduler.ts, which sees one page per tick, makes
 * exactly the same calls as the synchronous path here.
 */
import { findRank } from './domain';
import { fetchPageWithFallback, type FetchedPage } from './providers';
import type { OrganicResult, SerpPageRequest } from './providers/types';

export function maxPages(depth: number): number {
  return depth === 100 ? 10 : 3;
}

export type PageDecision =
  | { done: true; rank: number | null; url: string | null }
  | { done: false; nextPage: number };

export function afterPage(organic: OrganicResult[], page: number, depth: number, domain: string): PageDecision {
  const hit = findRank(organic, domain);
  if (hit) return { done: true, rank: hit.position, url: hit.url };
  if (page >= maxPages(depth) || (page > 1 && organic.length === 0)) return { done: true, rank: null, url: null };
  return { done: false, nextPage: page + 1 };
}

export interface CheckTarget {
  keyword: string;
  locationCode: number | null;
  locationName: string;
  device: 'desktop' | 'mobile';
  language: string;
  depth: number;
  domain: string;
}

export interface CheckOutcome {
  rank: number | null;
  url: string | null;
  pagesFetched: number;
  provider: string;
  cost: number;
}

export type PageFetcher = (req: SerpPageRequest) => Promise<FetchedPage>;

export async function runCheck(target: CheckTarget, fetchPage: PageFetcher = (r) => fetchPageWithFallback(r), startPage = 1): Promise<CheckOutcome> {
  let cost = 0;
  let pages = 0;
  const providers = new Set<string>();
  for (let page = startPage; ; ) {
    const res = await fetchPage({
      keyword: target.keyword,
      locationCode: target.locationCode,
      locationName: target.locationName,
      device: target.device,
      language: target.language,
      page,
    });
    cost += res.totalCost;
    pages++;
    providers.add(res.provider);
    const d = afterPage(res.organic, page, target.depth, target.domain);
    if (d.done) return { rank: d.rank, url: d.url, pagesFetched: pages, provider: [...providers].join('+'), cost };
    page = d.nextPage;
  }
}
