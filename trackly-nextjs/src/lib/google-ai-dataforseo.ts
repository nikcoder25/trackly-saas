/**
 * DataForSEO fallback for Google AI Overview and Google AI Mode answers.
 * Used when Litescrape fails (out of balance HTTP 402, outage, timeout),
 * so a scan still returns real Google AI answers instead of "Error".
 *
 * Searches from the United States; DataForSEO needs its own canonical
 * location names, which the brand's free-text city doesn't match.
 */
import type { LitescrapeAnswer } from './litescrape';

const API_BASE = 'https://api.dataforseo.com/v3';
const OK = 20000;
const TIMEOUT_MS = Number(process.env.DATAFORSEO_AI_TIMEOUT_MS) || 90000;

/** Rough USD per call, for the cost ledger. */
export const DFS_AI_OVERVIEW_USD = 0.004;
export const DFS_AI_MODE_USD = 0.004;

export function dataForSeoAiConfigured(): boolean {
  return !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD)
    && process.env.GOOGLE_AI_DATAFORSEO_FALLBACK !== 'false';
}

interface DfsNode {
  type?: string;
  title?: string;
  text?: string;
  markdown?: string;
  url?: string;
  items?: DfsNode[];
  references?: DfsNode[];
}

/** Pull answer text and cited URLs out of every `ai_overview` item. */
export function parseAiItems(items: DfsNode[] | null | undefined): LitescrapeAnswer {
  const texts: string[] = [];
  const links = new Set<string>();
  const collectRefs = (n: DfsNode, depth: number) => {
    if (!n || depth > 5) return;
    for (const r of n.references || []) if (r?.url) links.add(r.url);
    for (const c of n.items || []) collectRefs(c, depth + 1);
  };
  for (const it of items || []) {
    if (it?.type !== 'ai_overview') continue;
    if (it.markdown) texts.push(it.markdown);
    else {
      for (const el of it.items || []) {
        const line = el.markdown || [el.title, el.text].filter(Boolean).join('\n');
        if (line) texts.push(line);
      }
    }
    collectRefs(it, 0);
  }
  const text = texts.join('\n').trim();
  return { text, citations: [...links], empty: !text };
}

async function post(path: string, task: Record<string, unknown>, signal?: AbortSignal): Promise<DfsNode[]> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error('DataForSEO is not configured');
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([task]),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!res.ok) throw new Error(`DataForSEO ${path}: HTTP ${res.status}`);
  const body = await res.json() as {
    status_code?: number; status_message?: string;
    tasks?: Array<{ status_code?: number; status_message?: string; result?: Array<{ items?: DfsNode[] }> | null }>;
  };
  if (body.status_code !== OK) throw new Error(`DataForSEO ${path}: ${body.status_message || body.status_code}`);
  const t = body.tasks?.[0];
  if (!t || t.status_code !== OK) throw new Error(`DataForSEO ${path}: ${t?.status_message || t?.status_code}`);
  return t.result?.[0]?.items || [];
}

const BASE_TASK = { location_name: 'United States', language_code: 'en', device: 'desktop' };

export async function dfsGoogleAiOverview(query: string, signal?: AbortSignal): Promise<LitescrapeAnswer> {
  const items = await post('/serp/google/organic/live/advanced',
    { ...BASE_TASK, keyword: query, depth: 10, load_async_ai_overview: true }, signal);
  return parseAiItems(items);
}

export async function dfsGoogleAiMode(query: string, signal?: AbortSignal): Promise<LitescrapeAnswer> {
  const items = await post('/serp/google/ai_mode/live/advanced', { ...BASE_TASK, keyword: query }, signal);
  return parseAiItems(items);
}
