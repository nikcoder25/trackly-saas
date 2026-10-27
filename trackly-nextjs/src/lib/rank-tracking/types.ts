/** Shapes the rank tracking API returns. The pages import these. */
import type { AiStatus } from './ai';

export type { AiStatus };
export type ComparePeriod = 'last' | '7' | '30' | '90';

export interface RankCreditStatus {
  plan: string;
  allowance: number;
  /** Credits the tracked keywords use per month at their frequency and depth. */
  committed: number;
  /** Credits charged by checks since the start of the month (the ledger). */
  usedThisMonth: number;
  resetsAt: string;
  allowsDaily: boolean;
  allowsTop100: boolean;
}

export interface WebsiteSummary {
  id: string;
  domain: string;
  /** Most common "City, ST" the keywords are checked from. */
  city: string;
  keywords: number;
  avg: number | null;
  top10: number;
  /** Average position change (positive = better). */
  change: number;
  sov: number | null;
  /** Average position per week, oldest first, 8 weeks; null = no data. */
  trend: (number | null)[];
}

export interface GroupSummary extends Omit<WebsiteSummary, 'domain' | 'sov'> {
  websiteId: string;
  domain: string;
  name: string;
}

export interface RankSummary {
  credits: RankCreditStatus;
  stats: { keywords: number; websites: number; avg: number | null; avgChange: number; top3: number; top3Change: number; top10: number; top10Change: number; dropped: number };
  /** Top 3, 4-10, 11-20, 21-30, not ranking. */
  spread: [number, number, number, number, number];
  lastCheck: string | null;
  nextCheck: string | null;
  websites: WebsiteSummary[];
  groups: GroupSummary[];
  providersConfigured: boolean;
}

export interface KeywordDto {
  id: string;
  keyword: string;
  groupId: string | null;
  groupName: string | null;
  starred: boolean;
  rank: number | null;
  prevRank: number | null;
  hasPrev: boolean;
  change: number;
  best: number | null;
  url: string | null;
  locationName: string;
  locationCode: number | null;
  city: string;
  device: 'desktop' | 'mobile';
  frequency: 'weekly' | 'daily';
  depth: number;
  volume: number | null;
  ai: AiStatus;
  checkedAt: string | null;
  nextCheckAt: string;
  pending: boolean;
  error: string | null;
  /** Last 8 ranks, oldest first (null = not ranking). */
  spark: (number | null)[];
}

export interface WebsiteDetail {
  website: { id: string; domain: string; createdAt: string };
  groups: { id: string; name: string; count: number }[];
  stats: { up: number; down: number; top10: number; ranking: number; total: number; nextCheck: string | null };
  keywords: KeywordDto[];
  sov: number | null;
}

export interface HistoryPoint { at: string; rank: number | null }
export interface KeywordHistory { points: HistoryPoint[]; best: number | null; worst: number | null; depth: number }

export interface MoverDto { keywordId: string; websiteId: string; keyword: string; domain: string; rank: number | null; change: number }

export interface RankOverview {
  stats: { up: number; down: number; top10: number; ranking: number; total: number; sov: number | null };
  gainers: MoverDto[];
  losers: MoverDto[];
  sites: { id: string; domain: string; keywords: number; city: string; change: number }[];
  activity: { message: string; kind: string; at: string }[];
}
