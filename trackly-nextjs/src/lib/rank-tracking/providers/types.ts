/**
 * SERP provider interface. Everything outside providers/ talks to this,
 * so a provider can be swapped (env RANK_SERP_PROVIDER /
 * RANK_SERP_FALLBACK) without touching the checker, scheduler or UI.
 *
 * `fetchSerpPage` is the one required call: one Google results page of
 * 10 organic results (page 1 = positions 1-10, page 2 = 11-20, ...).
 *
 * Queued providers (DataForSEO Standard queue) can also post a page and
 * collect it on a later tick, which is far cheaper than a live call and
 * keeps the cron request short. The scheduler uses submit/ready/collect
 * when a provider has them and falls back to fetchSerpPage otherwise.
 */
export type Device = 'desktop' | 'mobile';

export interface SerpPageRequest {
  keyword: string;
  /** Provider location code (DataForSEO location_code). */
  locationCode: number | null;
  /** Full location name, "Austin,Texas,United States". */
  locationName: string;
  device: Device;
  language: string;
  /** 1-based results page. */
  page: number;
}

export interface OrganicResult {
  /** Organic position on Google (ads, local pack and AI overview excluded). */
  position: number;
  url: string;
  domain: string;
  title: string;
}

export interface SerpPage {
  organic: OrganicResult[];
  raw?: unknown;
  /** What this page cost, in USD. */
  cost: number;
}

export interface SerpProvider {
  name: string;
  /** List price of one page, in USD, for estimates. */
  costPerPage: number;
  configured(): boolean;
  fetchSerpPage(req: SerpPageRequest): Promise<SerpPage>;
  /** Queued providers: post one page, return the provider's task id. */
  submitPage?(req: SerpPageRequest): Promise<string>;
  /** Queued providers: ids of finished tasks waiting to be collected. */
  readyTaskIds?(): Promise<string[]>;
  /** Queued providers: read a finished task. */
  collectPage?(taskId: string): Promise<SerpPage>;
}

export class ProviderError extends Error {
  constructor(public provider: string, message: string, public retryable = true) {
    super(`${provider}: ${message}`);
  }
}
