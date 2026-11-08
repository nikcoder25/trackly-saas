/**
 * DataForSEO Google Organic SERP adapter.
 *
 * Scheduled checks use the Standard queue (dfsQueue below): one task per
 * keyword at the keyword's full depth (30), priority 1, tagged with the
 * keyword id, up to 100 tasks per task_post request. Results are read with
 * tasks_ready + task_get/advanced on a later tick. The queue is several
 * times cheaper than the live endpoint, which is only reachable through
 * fetchSerpPage (one page, live) and is not used for scheduled checks.
 *
 * Google now often wraps organic links as https://google.com/goto?url=...
 * and DataForSEO then reports domain "google.com". The real site is in the
 * breadcrumb ("https://site.com › path › page"), so parseOrganic reads it
 * from there.
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
  breadcrumb?: string;
}

/** A Google redirect wrapper (google.com/goto?url=, /url?q=) that hides the real result. */
export function isGoogleWrapper(url: string | null | undefined, domain?: string | null): boolean {
  const d = normalizeDomain(domain || url);
  if (!/^google\.[a-z.]+$/.test(d)) return false;
  if (!url) return true;
  try {
    const u = new URL(url);
    return /^\/(goto|url)\/?$/.test(u.pathname) || !!u.searchParams.get('url') || !!u.searchParams.get('q');
  } catch {
    return true;
  }
}

/** "https://site.com › pages › stockists" -> https://site.com/pages/stockists. Truncated segments ("...") end the path. Null when it is not a URL ("4k+ followers"). */
export function urlFromBreadcrumb(breadcrumb: string | null | undefined): string | null {
  const b = String(breadcrumb || '').trim();
  const m = b.match(/^(https?:\/\/[^\s›>]+)/i);
  if (!m) return null;
  const segs: string[] = [];
  for (const raw of b.slice(m[1].length).split(/[›>]/)) {
    const seg = raw.trim();
    if (!seg) continue;
    if (/\.\.\.|…/.test(seg) || /\s/.test(seg)) break;
    segs.push(encodeURI(seg));
  }
  return m[1].replace(/\/+$/, '') + (segs.length ? `/${segs.join('/')}` : '/');
}

/** The result's real URL and domain: url/domain as given, or from the breadcrumb when Google wrapped the link. */
export function realTarget(i: RawItem): { url: string; domain: string } {
  if (!isGoogleWrapper(i.url, i.domain)) return { url: String(i.url || ''), domain: normalizeDomain(i.domain || i.url) };
  const fromCrumb = urlFromBreadcrumb(i.breadcrumb);
  return fromCrumb ? { url: fromCrumb, domain: normalizeDomain(fromCrumb) } : { url: '', domain: '' };
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
  return organic.map((i, idx) => {
    const t = realTarget(i);
    return { position: (i.rank_group || idx + 1) + offset, url: t.url, domain: t.domain, title: String(i.title || '') };
  });
}

export const dataForSeoProvider: SerpProvider = {
  name: 'dataforseo',
  costPerPage: DFS_STANDARD_PAGE_COST,
  configured: () => !!auth(),

  async fetchSerpPage(req) {
    const t = await call<{ items?: RawItem[] }>('/serp/google/organic/live/advanced', [task(req)]);
    return { organic: parseOrganic(t.result?.[0]?.items, req.page), raw: t.result?.[0], cost: Number(t.cost) || 0 };
  },
};

/* ── Standard queue for scheduled checks ─────────────────────────────── */

/** Task errors worth posting again: per the DataForSEO error list, transient search-engine / parser failures. */
export const DFS_REPOST_CODES = new Set([40101, 40102, 40106]);
/** Still being worked on (task_get before the task is done). */
export const DFS_PENDING_CODES = new Set([40601, 40602]);
export const DFS_MAX_TASKS_PER_POST = 100;

export interface DfsCheckTask {
  /** Our keyword id, sent as the task tag. */
  tag: string;
  keyword: string;
  locationCode: number | null;
  locationName: string;
  device: 'desktop' | 'mobile';
  language: string;
  depth: number;
}

export interface DfsPosted { tag: string; id: string | null; status: number; message: string; cost: number }
export interface DfsResult { id: string; tag: string; status: number; message: string; cost: number; organic: OrganicResult[] }

async function envelope<T>(path: string, body?: unknown): Promise<DfsEnvelope<T>> {
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
  return j;
}

export function checkTaskBody(t: DfsCheckTask): Record<string, unknown> {
  const body: Record<string, unknown> = {
    keyword: t.keyword, language_code: t.language || 'en', device: t.device, depth: t.depth, priority: 1, tag: t.tag,
  };
  if (t.locationCode && t.locationCode > 0) body.location_code = t.locationCode;
  else body.location_name = t.locationName || 'United States';
  return body;
}

type TaskWithData = DfsTask<unknown> & { data?: { tag?: string } };

export const dfsQueue = {
  configured: () => !!auth(),

  /** Post whole checks, up to 100 per request. One answer per task, in order; a failed request marks its whole batch failed (status 0). */
  async post(tasks: DfsCheckTask[]): Promise<DfsPosted[]> {
    const out: DfsPosted[] = [];
    for (let i = 0; i < tasks.length; i += DFS_MAX_TASKS_PER_POST) {
      const batch = tasks.slice(i, i + DFS_MAX_TASKS_PER_POST);
      try {
        const j = await envelope<unknown>('/serp/google/organic/task_post', batch.map(checkTaskBody));
        const byTag = new Map((j.tasks || []).map((t) => [String((t as TaskWithData).data?.tag || ''), t]));
        batch.forEach((b, idx) => {
          const t = byTag.get(b.tag) || j.tasks?.[idx];
          const status = Number(t?.status_code) || 0;
          out.push({ tag: b.tag, id: status === 20100 && t?.id ? String(t.id) : null, status, message: String(t?.status_message || ''), cost: Number(t?.cost) || 0 });
        });
      } catch (e) {
        for (const b of batch) out.push({ tag: b.tag, id: null, status: 0, message: (e as Error).message, cost: 0 });
      }
    }
    return out;
  },

  /** Finished tasks not yet collected: id and our tag. */
  async ready(): Promise<{ id: string; tag: string }[]> {
    const j = await envelope<{ id?: string; tag?: string }>('/serp/google/organic/tasks_ready');
    return (j.tasks?.[0]?.result || []).filter((r) => r.id).map((r) => ({ id: String(r.id), tag: String(r.tag || '') }));
  },

  /** Read one task. Task-level errors come back as a status, not an exception. */
  async get(id: string): Promise<DfsResult> {
    const j = await envelope<{ items?: RawItem[] }>(`/serp/google/organic/task_get/advanced/${encodeURIComponent(id)}`);
    const t = j.tasks?.[0] as (DfsTask<{ items?: RawItem[] }> & { data?: { tag?: string } }) | undefined;
    const status = Number(t?.status_code) || 0;
    return {
      id, tag: String(t?.data?.tag || ''), status, message: String(t?.status_message || ''), cost: Number(t?.cost) || 0,
      organic: status === OK ? parseOrganic(t?.result?.[0]?.items, 1) : [],
    };
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
