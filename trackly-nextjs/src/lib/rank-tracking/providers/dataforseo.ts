/**
 * DataForSEO Google Organic SERP adapter.
 *
 * Standard queue first: task_post, then tasks_ready + task_get/advanced on
 * a later tick. One task = one results page of 10: page 1 has no
 * search_param, pages 2 and 3 pass "&start=10" / "&start=20". At list
 * price the queue is $0.0006 a page against $0.002 for the live endpoint,
 * so the live endpoint is only used by fetchSerpPage, the synchronous path
 * the scheduler takes when a queued task never comes back.
 *
 * Also here, because they share the credentials: the location list for
 * the city autocomplete (free) and Google Ads search volume.
 */
import { normalizeDomain } from '../domain';
import { ProviderError, type OrganicResult, type SerpPage, type SerpPageRequest, type SerpProvider } from './types';

const API_BASE = (process.env.DATAFORSEO_BASE_URL || 'https://api.dataforseo.com/v3').replace(/\/+$/, '');
const OK = 20000;
const TIMEOUT_MS = Number(process.env.DATAFORSEO_TIMEOUT_MS) || 30000;
export const DFS_STANDARD_PAGE_COST = 0.0006;

function auth(): string | null {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return null;
  return `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
}

interface DfsTask<T> {
  id?: string;
  status_code?: number;
  status_message?: string;
  cost?: number;
  result?: T[] | null;
}
interface DfsEnvelope<T> {
  status_code?: number;
  status_message?: string;
  cost?: number;
  tasks?: DfsTask<T>[];
}

async function call<T>(path: string, body?: unknown): Promise<DfsTask<T>> {
  const a = auth();
  if (!a) throw new ProviderError('dataforseo', 'not configured', false);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: a, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new ProviderError('dataforseo', `request failed: ${(e as Error).message}`);
  }
  if (!res.ok) throw new ProviderError('dataforseo', `HTTP ${res.status}`, res.status === 429 || res.status >= 500);
  const j = (await res.json()) as DfsEnvelope<T>;
  if (j.status_code !== OK) throw new ProviderError('dataforseo', j.status_message || `status ${j.status_code}`);
  const t = j.tasks?.[0];
  if (!t) throw new ProviderError('dataforseo', 'empty response');
  // 20100 = task created (task_post); anything at or above 40000 is an error.
  if ((t.status_code || 0) >= 40000) throw new ProviderError('dataforseo', t.status_message || `task status ${t.status_code}`, (t.status_code || 0) >= 50000);
  return t;
}

function task(req: SerpPageRequest): Record<string, unknown> {
  const t: Record<string, unknown> = {
    keyword: req.keyword,
    language_code: req.language || 'en',
    device: req.device,
    depth: 10,
  };
  // Codes below zero come from the bundled city list, not DataForSEO.
  if (req.locationCode && req.locationCode > 0) t.location_code = req.locationCode;
  else t.location_name = req.locationName || 'United States';
  if (req.page > 1) t.search_param = `&start=${(req.page - 1) * 10}`;
  return t;
}

interface RawItem {
  type?: string;
  rank_group?: number;
  rank_absolute?: number;
  url?: string;
  domain?: string;
  title?: string;
}

/**
 * Organic results only (ads, local pack, AI overview and every other
 * feature are dropped), with their position on Google. With a start
 * offset DataForSEO numbers the page from 1 again, so the offset is added
 * back when every rank on a later page is 10 or under.
 */
export function parseOrganic(items: RawItem[] | null | undefined, page: number): OrganicResult[] {
  const organic = (items || []).filter((i) => i && i.type === 'organic' && i.url);
  organic.sort((a, b) => (a.rank_group || 0) - (b.rank_group || 0));
  const offset = page > 1 && organic.every((i) => (i.rank_group || 0) <= 10) ? (page - 1) * 10 : 0;
  return organic.map((i, idx) => ({
    position: (i.rank_group || idx + 1) + offset,
    url: String(i.url),
    domain: normalizeDomain(i.domain || i.url),
    title: String(i.title || ''),
  }));
}

export const dataForSeoProvider: SerpProvider = {
  name: 'dataforseo',
  costPerPage: DFS_STANDARD_PAGE_COST,
  configured: () => !!auth(),

  async fetchSerpPage(req) {
    const t = await call<{ items?: RawItem[] }>('/serp/google/organic/live/advanced', [task(req)]);
    return { organic: parseOrganic(t.result?.[0]?.items, req.page), raw: t.result?.[0], cost: Number(t.cost) || 0 };
  },

  async submitPage(req) {
    const t = await call<unknown>('/serp/google/organic/task_post', [{ ...task(req), tag: `p${req.page}` }]);
    if (!t.id) throw new ProviderError('dataforseo', 'task_post returned no id');
    return t.id;
  },

  async readyTaskIds() {
    const t = await call<{ id?: string }>('/serp/google/organic/tasks_ready');
    return (t.result || []).map((r) => String(r.id || '')).filter(Boolean);
  },

  async collectPage(taskId) {
    const t = await call<{ items?: RawItem[] }>(`/serp/google/organic/task_get/advanced/${encodeURIComponent(taskId)}`);
    const tag = String((t as { data?: { tag?: string } }).data?.tag || '');
    const page = Number(tag.replace(/^p/, '')) || 1;
    // Standard queue is billed when the task is posted; the cost on the
    // task_get answer is that charge.
    return { organic: parseOrganic(t.result?.[0]?.items, page), raw: t.result?.[0], cost: Number(t.cost) || DFS_STANDARD_PAGE_COST };
  },
};

export interface DfsLocation {
  code: number;
  name: string;
  countryIso: string | null;
  type: string | null;
}

/** Every Google location DataForSEO knows (free endpoint, ~100k rows). */
export async function fetchDfsLocations(): Promise<DfsLocation[]> {
  const t = await call<{ location_code?: number; location_name?: string; country_iso_code?: string; location_type?: string }>('/serp/google/locations');
  return (t.result || [])
    .filter((r) => r.location_code && r.location_name)
    .map((r) => ({ code: Number(r.location_code), name: String(r.location_name), countryIso: r.country_iso_code || null, type: r.location_type || null }));
}

/** Monthly Google search volume per keyword for one location. Best effort: errors return an empty map. */
export async function fetchSearchVolume(keywords: string[], locationCode: number | null, language = 'en', locationName = 'United States'): Promise<{ volumes: Map<string, number>; cost: number }> {
  const volumes = new Map<string, number>();
  if (!keywords.length || !auth()) return { volumes, cost: 0 };
  try {
    const body: Record<string, unknown> = { keywords: keywords.slice(0, 1000), language_code: language };
    if (locationCode && locationCode > 0) body.location_code = locationCode;
    else body.location_name = locationName;
    const t = await call<{ keyword?: string; search_volume?: number | null }>('/keywords_data/google_ads/search_volume/live', [body]);
    for (const r of t.result || []) {
      if (r.keyword && typeof r.search_volume === 'number') volumes.set(r.keyword.toLowerCase(), r.search_volume);
    }
    return { volumes, cost: Number(t.cost) || 0 };
  } catch {
    return { volumes, cost: 0 };
  }
}
