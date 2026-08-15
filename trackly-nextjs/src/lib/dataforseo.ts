/**
 * DataForSEO client - real demand data for prompt discovery.
 *
 * Two endpoints, chosen because they answer questions an LLM can only
 * guess at:
 *
 *   AI search volume - how often a prompt is actually asked of an AI
 *     assistant, with 12 months of history. Generated prompts otherwise
 *     get ranked on a model's intuition about what people ask, which is
 *     not evidence.
 *
 *   Search intent - commercial / transactional / informational /
 *     navigational, classified from SERP data rather than by asking a
 *     model to introspect.
 *
 * COVERAGE, AND WHY IT SHAPES THE API HERE
 *
 * These two datasets do NOT have the same reach, and the difference
 * matters for a product whose customers are local service businesses:
 *
 *   - Search intent covers local queries fine ("best hvac company in
 *     auburn wa" -> commercial, p=0.95).
 *   - AI search volume does NOT. Localized and "near me" prompts come
 *     back with no data at all, while national head terms are well
 *     populated.
 *
 * So volume is exposed as an OPTIONAL ANNOTATION, never as a filter. For
 * a local HVAC company the zero-volume prompt "best hvac company in
 * auburn wa" is the single most valuable thing to track; dropping it for
 * want of a national volume figure would be exactly backwards. Callers
 * get `null` volume and are expected to keep the prompt.
 *
 * Everything here is best-effort: no credentials, a network failure, or
 * an unexpected payload all degrade to "no data" rather than throwing,
 * because discovery has to work for tenants who never configure this.
 */

import { logger } from './logger';
import { safeFetch } from './safe-fetch';

const API_BASE = 'https://api.dataforseo.com/v3';

/**
 * Endpoint paths, kept together so a path correction is a one-line
 * change. Both follow DataForSEO's `<api>/<sub-api>/<endpoint>/live`
 * convention. On a 404 the failure is logged with the path, so a wrong
 * one is immediately visible in logs rather than looking like empty data.
 */
const ENDPOINTS = {
  aiSearchVolume: '/ai_optimization/ai_keyword_data/keywords_search_volume/live',
  searchIntent: '/dataforseo_labs/google/search_intent/live',
} as const;

/** DataForSEO's own success code, distinct from the HTTP status. */
const OK_STATUS = 20000;

const REQUEST_TIMEOUT_MS = Number(process.env.DATAFORSEO_TIMEOUT_MS) || 20000;

/** Both endpoints accept up to 1000 keywords per task. */
export const MAX_KEYWORDS_PER_REQUEST = 1000;

export function isDataForSeoConfigured(): boolean {
  return !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

function authHeader(): string | null {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return null;
  return `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
}

/**
 * POST one task to a DataForSEO live endpoint and return `result[0].items`.
 *
 * DataForSEO wraps everything twice: an outer envelope with its own
 * status_code, then a per-task status_code, and the payload under
 * `tasks[0].result[0].items`. A task can fail while HTTP returns 200, so
 * both layers are checked before anything is read.
 */
async function callEndpoint<T>(
  path: string,
  task: Record<string, unknown>,
): Promise<T[]> {
  const auth = authHeader();
  if (!auth) return [];

  try {
    const res = await safeFetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      // The body is always an ARRAY of tasks, even for a single one.
      body: JSON.stringify([task]),
      timeoutMs: REQUEST_TIMEOUT_MS,
    });

    if (!res.ok) {
      logger.warn('dataforseo.http_error', { path, status: res.status });
      return [];
    }

    const body = await res.json() as {
      status_code?: number;
      status_message?: string;
      tasks?: Array<{
        status_code?: number;
        status_message?: string;
        result?: Array<{ items?: T[] }> | null;
      }>;
    };

    if (body.status_code !== OK_STATUS) {
      logger.warn('dataforseo.api_error', {
        path,
        statusCode: body.status_code,
        statusMessage: (body.status_message || '').slice(0, 200),
      });
      return [];
    }

    const firstTask = body.tasks?.[0];
    if (!firstTask || firstTask.status_code !== OK_STATUS) {
      logger.warn('dataforseo.task_error', {
        path,
        statusCode: firstTask?.status_code,
        statusMessage: (firstTask?.status_message || '').slice(0, 200),
      });
      return [];
    }

    // A task that legitimately found nothing returns result: null, which
    // is not an error - it is the "no data for these keywords" answer.
    return firstTask.result?.[0]?.items ?? [];
  } catch (e) {
    logger.warn('dataforseo.request_failed', {
      path,
      errorMessage: (e as Error).message,
    });
    return [];
  }
}

export interface AiVolume {
  keyword: string;
  /** Monthly AI search volume, or null when the dataset has no entry. */
  volume: number | null;
  /**
   * Direction over the trailing year: 'rising' | 'falling' | 'flat', or
   * null without enough history to say. Computed rather than returned by
   * the API - a prompt whose volume halved since December is a different
   * proposition from one holding steady, and the raw number hides that.
   */
  trend: 'rising' | 'falling' | 'flat' | null;
}

interface RawVolumeItem {
  keyword?: string;
  ai_search_volume?: number;
  ai_monthly_searches?: Record<string, number>;
}

/**
 * Classify a 12-month series as rising / falling / flat by comparing the
 * most recent quarter against the one a year prior. A +/-20% band keeps
 * ordinary month-to-month noise from reading as a trend.
 */
export function classifyTrend(monthly: Record<string, number> | undefined): AiVolume['trend'] {
  if (!monthly) return null;
  // Keys are 'YYYY-MM', so a lexical sort is chronological.
  const months = Object.keys(monthly).sort();
  if (months.length < 6) return null;
  const recent = months.slice(-3);
  const older = months.slice(0, 3);
  const mean = (keys: string[]) =>
    keys.reduce((sum, k) => sum + (monthly[k] || 0), 0) / (keys.length || 1);
  const now = mean(recent);
  const then = mean(older);
  if (then === 0) return now > 0 ? 'rising' : null;
  const change = (now - then) / then;
  if (change > 0.2) return 'rising';
  if (change < -0.2) return 'falling';
  return 'flat';
}

/**
 * Look up AI search volume for a batch of prompts.
 *
 * Returns a map keyed by the lowercased prompt. Prompts absent from the
 * dataset are simply missing from the map - callers must treat that as
 * "unknown", never as zero demand.
 */
export async function getAiSearchVolume(
  keywords: string[],
  opts: { locationName?: string; languageCode?: string } = {},
): Promise<Map<string, AiVolume>> {
  const out = new Map<string, AiVolume>();
  const unique = [...new Set(keywords.map(k => k.trim()).filter(Boolean))]
    .slice(0, MAX_KEYWORDS_PER_REQUEST);
  if (!unique.length || !isDataForSeoConfigured()) return out;

  const items = await callEndpoint<RawVolumeItem>(ENDPOINTS.aiSearchVolume, {
    keywords: unique,
    language_code: opts.languageCode || 'en',
    location_name: opts.locationName || 'United States',
  });

  for (const item of items) {
    if (!item?.keyword) continue;
    const volume = typeof item.ai_search_volume === 'number' ? item.ai_search_volume : null;
    out.set(item.keyword.toLowerCase(), {
      keyword: item.keyword,
      volume,
      trend: classifyTrend(item.ai_monthly_searches),
    });
  }
  return out;
}

export type IntentLabel = 'informational' | 'navigational' | 'commercial' | 'transactional';

export interface KeywordIntent {
  keyword: string;
  label: IntentLabel;
  probability: number;
  /** Other intents the classifier considered plausible. */
  secondary: Array<{ label: IntentLabel; probability: number }>;
}

interface RawIntentItem {
  keyword?: string;
  keyword_intent?: { label?: string; probability?: number };
  secondary_keyword_intents?: Array<{ label?: string; probability?: number }> | null;
}

const VALID_INTENTS: IntentLabel[] = [
  'informational', 'navigational', 'commercial', 'transactional',
];

function asIntent(label: unknown): IntentLabel | null {
  return typeof label === 'string' && (VALID_INTENTS as string[]).includes(label)
    ? label as IntentLabel
    : null;
}

/**
 * Classify prompts by search intent. Returns a map keyed by the
 * lowercased prompt; unclassified prompts are absent.
 */
export async function getSearchIntent(
  keywords: string[],
  opts: { languageCode?: string } = {},
): Promise<Map<string, KeywordIntent>> {
  const out = new Map<string, KeywordIntent>();
  const unique = [...new Set(keywords.map(k => k.trim()).filter(Boolean))]
    .slice(0, MAX_KEYWORDS_PER_REQUEST);
  if (!unique.length || !isDataForSeoConfigured()) return out;

  const items = await callEndpoint<RawIntentItem>(ENDPOINTS.searchIntent, {
    keywords: unique,
    language_code: opts.languageCode || 'en',
  });

  for (const item of items) {
    if (!item?.keyword) continue;
    const label = asIntent(item.keyword_intent?.label);
    if (!label) continue;
    out.set(item.keyword.toLowerCase(), {
      keyword: item.keyword,
      label,
      probability: typeof item.keyword_intent?.probability === 'number'
        ? item.keyword_intent.probability
        : 0,
      secondary: (item.secondary_keyword_intents || [])
        .map(s => ({ label: asIntent(s?.label), probability: s?.probability ?? 0 }))
        .filter((s): s is { label: IntentLabel; probability: number } => s.label !== null),
    });
  }
  return out;
}

/**
 * Whether a prompt is worth tracking for a business that wants enquiries.
 *
 * Commercial and transactional obviously qualify. Informational does too
 * when it is the *secondary* read of a query the classifier was unsure
 * about - "emergency ac repair near me" comes back transactional at only
 * p=0.49, and a naive top-label-with-high-confidence rule would throw
 * away exactly the prompts that convert.
 *
 * Comparison queries ("trane vs carrier") classify as informational, and
 * they are deliberately NOT rescued here - they matter for brand
 * visibility but they are not the buying questions discovery is for, and
 * the caller keeps a floor so nothing is over-trimmed anyway.
 */
export function isBuyingIntent(intent: KeywordIntent | undefined): boolean {
  if (!intent) return true; // Unknown intent is not evidence against it.
  if (intent.label === 'commercial' || intent.label === 'transactional') return true;
  return intent.secondary.some(
    s => s.label === 'commercial' || s.label === 'transactional',
  );
}

/**
 * Strip a location suffix so a local prompt can borrow its head term's
 * volume as a labelled proxy. "best hvac company in auburn wa" ->
 * "best hvac company".
 *
 * Returns null when nothing was stripped, so callers can tell a real
 * de-localization from a no-op and avoid presenting a prompt's own
 * volume as a proxy for itself.
 */
export function deLocalize(prompt: string, city?: string): string | null {
  let out = prompt;
  if (city) {
    const escaped = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\s*\\b(in|near|around|serving)?\\s*${escaped}\\b[,\\s]*`, 'ig'), ' ');
  }
  out = out
    .replace(/\s*\bnear\s+me\b/ig, ' ')
    .replace(/\s*\b(in|near)\s+my\s+area\b/ig, ' ')
    // A trailing two-letter state code left behind by the city strip.
    .replace(/[,\s]+\b[a-z]{2}\b\s*$/i, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s,]+$/, '')
    .trim();
  if (!out || out.toLowerCase() === prompt.trim().toLowerCase()) return null;
  // Guard against stripping so much that nothing meaningful is left.
  return out.split(/\s+/).length >= 2 ? out : null;
}
