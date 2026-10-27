/**
 * Litescrape client for AI answer engines (Google AI Overview, Google AI
 * Mode, Gemini). Flat $0.15 per 1,000 successful calls on every endpoint,
 * so a Gemini answer costs $0.00015 against ~$0.035 for a grounded
 * Gemini API call, and AI Overview / AI Mode cost the same.
 *
 * Tested Oct 2026: AI Overview ~3 s and city-level via `location`; AI
 * Mode ~12 s, city-level, returns the cited businesses; Gemini 12-38 s
 * and occasionally 503s after ~100 s, so callers keep a fallback.
 *
 * The rank tracker has its own Google Search adapter in
 * rank-tracking/providers/litescrape.ts; this file is for AI answers.
 */
interface LitescrapeError extends Error { isRateLimit?: boolean; isTransient?: boolean; budgetExhausted?: boolean }
function tagError(msg: string, flags: Partial<LitescrapeError>): LitescrapeError {
  const e = new Error(msg) as LitescrapeError;
  Object.assign(e, flags);
  return e;
}

const BASE = 'https://api.litescrape.com/api/google';

/** USD per successful call, for the cost ledger. */
export const LITESCRAPE_CALL_USD = Number(process.env.LITESCRAPE_COST_PER_PAGE) || 0.00015;

export function litescrapeConfigured(): boolean {
  return !!process.env.LITESCRAPE_API_KEY;
}

export interface LitescrapeAnswer {
  text: string;
  citations: string[];
  /** Google showed no AI answer for this query (not billed by Litescrape). */
  empty: boolean;
}

interface TextBlock {
  type?: string;
  snippet?: string;
  title?: string;
  link?: string;
  list?: TextBlock[];
  table?: Array<{ cells?: string[] }>;
}

interface Reference { link?: string; title?: string; snippet?: string }

/** Flatten Litescrape text_blocks (paragraph, heading, list, table) into plain text. */
export function flattenTextBlocks(blocks: TextBlock[] | undefined): string {
  const out: string[] = [];
  const walk = (b: TextBlock, depth: number) => {
    if (!b || depth > 4) return;
    const line = [b.title, b.snippet].filter(Boolean).join(' ').trim();
    // Google's own UI chrome, not part of the answer.
    if (line && !/^(shared|share public link)$/i.test(line)) out.push(line);
    for (const item of b.list || []) walk(item, depth + 1);
    for (const row of b.table || []) if (row.cells?.length) out.push(row.cells.join(' | '));
  };
  for (const b of blocks || []) walk(b, 0);
  return out.join('\n');
}

function referenceLinks(refs: Reference[] | undefined, blocks: TextBlock[] | undefined): string[] {
  const links = new Set<string>();
  for (const r of refs || []) if (r.link) links.add(r.link);
  const walk = (b: TextBlock) => { if (b.link) links.add(b.link); (b.list || []).forEach(walk); };
  (blocks || []).forEach(walk);
  return [...links];
}

async function call(path: string, params: Record<string, string>, timeoutMs: number, signal?: AbortSignal): Promise<unknown> {
  const key = process.env.LITESCRAPE_API_KEY;
  if (!key) throw tagError('Litescrape: LITESCRAPE_API_KEY is not set', { budgetExhausted: true });
  const timeout = AbortSignal.timeout(timeoutMs);
  const res = await fetch(`${BASE}/${path}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!res.ok) {
    throw tagError(`Litescrape ${path}: HTTP ${res.status}`, { isRateLimit: res.status === 429 });
  }
  const j = (await res.json()) as { error?: string };
  if (j && typeof j === 'object' && j.error) throw tagError(`Litescrape ${path}: ${j.error}`, {});
  return j;
}

/** "Clinton, MA" or "Austin,Texas,United States" -> Litescrape location + gl. */
export function locationParams(location?: string | null): Record<string, string> {
  const p: Record<string, string> = { hl: 'en', gl: 'us' };
  const parts = (location || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length) p.location = parts.join(', ');
  return p;
}

const AIO_TIMEOUT_MS = Number(process.env.LITESCRAPE_AIO_TIMEOUT_MS) || 45000;
const AIMODE_TIMEOUT_MS = Number(process.env.LITESCRAPE_AIMODE_TIMEOUT_MS) || 60000;
const GEMINI_TIMEOUT_MS = Number(process.env.LITESCRAPE_GEMINI_TIMEOUT_MS) || 60000;

export async function googleAiOverview(query: string, location?: string | null, signal?: AbortSignal): Promise<LitescrapeAnswer> {
  const j = (await call('ai-overview', { q: query, ...locationParams(location) }, AIO_TIMEOUT_MS, signal)) as {
    ai_overview?: { text_blocks?: TextBlock[]; references?: Reference[] } | null;
  };
  const a = j.ai_overview;
  if (!a) return { text: '', citations: [], empty: true };
  const text = flattenTextBlocks(a.text_blocks);
  return { text, citations: referenceLinks(a.references, a.text_blocks), empty: !text };
}

export async function googleAiMode(query: string, location?: string | null, signal?: AbortSignal): Promise<LitescrapeAnswer> {
  const j = (await call('ai-mode', { q: query, ...locationParams(location) }, AIMODE_TIMEOUT_MS, signal)) as {
    text_blocks?: TextBlock[]; references?: Reference[];
  };
  // AI Mode references often name a business with no link; keep their
  // titles in the text so brand detection still sees them.
  const refText = (j.references || []).map((r) => [r.title, r.snippet].filter(Boolean).join(': ')).filter(Boolean);
  const text = [flattenTextBlocks(j.text_blocks), ...refText].filter(Boolean).join('\n');
  return { text, citations: referenceLinks(j.references, j.text_blocks), empty: !text };
}

export async function geminiChat(prompt: string, signal?: AbortSignal): Promise<LitescrapeAnswer> {
  const j = (await call('gemini', { prompt }, GEMINI_TIMEOUT_MS, signal)) as { text?: string };
  const text = String(j.text || '').trim();
  return { text, citations: [], empty: !text };
}
