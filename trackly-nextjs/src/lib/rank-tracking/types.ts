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
  top3: number;
  top10: number;
  /** Top 3, 4-10, 11-20, 21+, not ranking (latest check). */
  spread: [number, number, number, number, number];
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

/** What the change columns compare against. `limited` means the history is shorter than the period asked for. */
export interface RankComparison { comparedTo: string | null; historyDays: number; periodDays: number | null; limited: boolean }

export interface RankSummary {
  credits: RankCreditStatus;
  comparison: RankComparison;
  stats: {
    keywords: number; websites: number; avg: number | null; avgChange: number; top3: number; top3Change: number; top10: number; top10Change: number; dropped: number;
    /** Click-weighted share of the clicks the keywords could get (0-100), from Google CTR by position. */
    visibility: number | null; visibilityChange: number;
    /** Average AI share of voice of the websites. */
    sov: number | null;
  };
  /** Top 3, 4-10, 11-20, 21+, not ranking. */
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
  comparison: RankComparison;
}

export interface HistoryPoint { at: string; rank: number | null }
export interface KeywordHistory { points: HistoryPoint[]; best: number | null; worst: number | null; depth: number }

export interface MoverDto { keywordId: string; websiteId: string; keyword: string; domain: string; rank: number | null; change: number }

export interface RankOverview {
  comparison: RankComparison;
  stats: { up: number; down: number; upAvg: number; downAvg: number; top10: number; ranking: number; total: number; sov: number | null };
  gainers: MoverDto[];
  losers: MoverDto[];
  sites: { id: string; domain: string; keywords: number; city: string; change: number }[];
  activity: { message: string; kind: string; at: string }[];
  /** Keywords per position band at the end of each of the last 12 weeks, oldest first: top 3, 4-10, 11-20, 21+. */
  weeks: { end: string; spread: [number, number, number, number] }[];
}

/** GET /api/rank/sites: one row of the sites table. */
export interface RankSiteRow {
  id: string;
  domain: string;
  /** Most common "City, ST" the site's keywords are checked from. */
  location: string;
  device: 'desktop' | 'mobile';
  keywords: number;
  /** Best and worst current rank among ranking keywords. */
  high: number | null;
  low: number | null;
  /** Net positions gained (positive) or lost since each keyword's previous check. */
  change: number;
  improved: number;
  dropped: number;
  unchanged: number;
  checkedAt: string | null;
}

/** GET /api/rank/sites/:id/keywords: one keyword row. */
export interface RankSiteKeyword {
  id: string;
  keyword: string;
  /** Short "City, ST". */
  location: string;
  locationName: string;
  device: 'desktop' | 'mobile';
  starred: boolean;
  groupId: string | null;
  groupName: string | null;
  current: number | null;
  previous: number | null;
  hasPrevious: boolean;
  change: number;
  best: number | null;
  /** Last 30 positions, oldest first (null = not ranking). */
  history: (number | null)[];
  volume: number | null;
  rankingUrl: string | null;
  ai: AiStatus;
  /** null = no AI prompt covers the keyword. */
  aiMentioned: boolean | null;
  checkedAt: string | null;
  depth: number;
  pending: boolean;
  error: string | null;
}

export interface RankSiteKeywords { site: RankSiteRow; groups: { id: string; name: string }[]; keywords: RankSiteKeyword[] }

export type RankHistoryRange = '30d' | '90d' | '1y' | 'all';
/** GET /api/rank/keywords/:id/history: one stored check. */
export interface RankHistoryRow { date: string; position: number | null; url: string | null }
