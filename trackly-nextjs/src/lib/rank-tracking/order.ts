import type { RankSiteKeyword } from './types';

/** Keyword table order: starred first, then best current rank, not ranking last, then A-Z. */
export function siteKeywordOrder(a: RankSiteKeyword, b: RankSiteKeyword): number {
  return Number(b.starred) - Number(a.starred) || (a.current ?? 1e9) - (b.current ?? 1e9) || a.keyword.localeCompare(b.keyword);
}
