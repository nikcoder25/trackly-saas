/**
 * DataForSEO API integration - Google AI Overviews detection
 *
 * Uses the SERP API to check whether Google shows an AI Overview for each
 * of the brand's tracked queries, and whether the brand is mentioned in it.
 *
 * Credentials: DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD env vars (Basic Auth).
 */

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const DEFAULT_LOCATION_CODE = 2840; // United States
const DEFAULT_LANGUAGE_CODE = 'en';
const REQUEST_TIMEOUT_MS = 30000;

// Simple in-memory cache
const cache = new Map<string, { result: AiOverviewResult; ts: number }>();

export interface AiOverviewResult {
  hasAiOverview: boolean;
  content: string | null;
  brandMentioned: boolean;
  citations: Array<{ url: string; title: string; domain: string }>;
  competitorMentions: string[];
  position: number | null;
}

function getCredentials(): string | null {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return null;
  return Buffer.from(`${login}:${password}`).toString('base64');
}

export function isConfigured(): boolean {
  return !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

async function apiRequest(path: string, body: unknown): Promise<Record<string, unknown>> {
  const auth = getCredentials();
  if (!auth) throw new Error('DataForSEO credentials not configured');

  const payload = JSON.stringify(body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const resp = await fetch(`https://api.dataforseo.com${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: payload,
      signal: controller.signal,
    });

    const data = await resp.json();
    if (resp.ok && data.status_code === 20000) {
      return data;
    }
    throw new Error(`DataForSEO API error: ${data.status_message || `HTTP ${resp.status}`}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function checkAiOverview(
  keyword: string,
  brandName: string,
  competitors?: string[],
  options: { locationCode?: number; languageCode?: string } = {}
): Promise<AiOverviewResult> {
  // Check cache
  const cacheKey = `${keyword}:${options.locationCode || DEFAULT_LOCATION_CODE}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    // Re-evaluate brand mention against cached content (brand may differ)
    const result = { ...cached.result };
    result.brandMentioned = isBrandMentioned(result.content, result.citations, brandName);
    result.competitorMentions = findCompetitorMentions(result.content, result.citations, competitors || []);
    return result;
  }

  const taskData = {
    keyword,
    location_code: options.locationCode || DEFAULT_LOCATION_CODE,
    language_code: options.languageCode || DEFAULT_LANGUAGE_CODE,
    device: 'desktop',
    os: 'windows',
  };

  const response = await apiRequest('/v3/serp/google/organic/live/advanced', [taskData]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks = response.tasks as any[];
  const task = tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(`DataForSEO task error: ${task?.status_message || 'No task returned'}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = task.result?.[0]?.items || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiOverviewItem = items.find((item: any) => item.type === 'ai_overview');

  if (!aiOverviewItem) {
    const result: AiOverviewResult = {
      hasAiOverview: false, content: null, brandMentioned: false,
      citations: [], competitorMentions: [], position: null,
    };
    cache.set(cacheKey, { result, ts: Date.now() });
    return result;
  }

  const content = extractAiOverviewText(aiOverviewItem);
  const citations = extractAiOverviewCitations(aiOverviewItem);
  const brandMentioned = isBrandMentioned(content, citations, brandName);
  const competitorMentions = findCompetitorMentions(content, citations, competitors || []);

  const result: AiOverviewResult = {
    hasAiOverview: true, content, brandMentioned, citations, competitorMentions,
    position: aiOverviewItem.rank_group || aiOverviewItem.position || 1,
  };

  cache.set(cacheKey, { result, ts: Date.now() });
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAiOverviewText(item: any): string {
  const parts: string[] = [];

  if (item.text) parts.push(item.text);
  if (item.items && Array.isArray(item.items)) {
    for (const sub of item.items) {
      if (sub.text) parts.push(sub.text);
      if (sub.title) parts.push(sub.title);
      if (sub.items && Array.isArray(sub.items)) {
        for (const nested of sub.items) {
          if (nested.text) parts.push(nested.text);
          if (nested.title) parts.push(nested.title);
        }
      }
    }
  }
  if (item.references && Array.isArray(item.references)) {
    for (const ref of item.references) {
      if (ref.text) parts.push(ref.text);
      if (ref.title) parts.push(ref.title);
    }
  }

  return parts.join('\n').trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAiOverviewCitations(item: any): Array<{ url: string; title: string; domain: string }> {
  const citations: Array<{ url: string; title: string; domain: string }> = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function collectUrls(obj: any) {
    if (!obj) return;
    if (obj.url) citations.push({ url: obj.url, title: obj.title || '', domain: obj.domain || extractDomain(obj.url) });
    if (obj.source) citations.push({ url: obj.source, title: obj.title || '', domain: extractDomain(obj.source) });
    if (Array.isArray(obj.items)) obj.items.forEach(collectUrls);
    if (Array.isArray(obj.references)) obj.references.forEach(collectUrls);
  }

  collectUrls(item);

  const seen = new Set<string>();
  return citations.filter(c => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function isBrandMentioned(
  content: string | null,
  citations: Array<{ url: string; title: string; domain: string }>,
  brandName: string,
): boolean {
  if (!brandName) return false;
  const lower = (content || '').toLowerCase();
  const brandLower = brandName.toLowerCase();

  if (lower.includes(brandLower)) return true;

  const stripped = brandLower.replace(/\s+(llc|inc|corp|ltd|co|company|group)\.?$/i, '').trim();
  if (stripped !== brandLower && lower.includes(stripped)) return true;

  for (const cite of citations) {
    const domain = (cite.domain || '').toLowerCase();
    const title = (cite.title || '').toLowerCase();
    if (domain.includes(stripped) || title.includes(stripped)) return true;
  }

  return false;
}

function findCompetitorMentions(
  content: string | null,
  citations: Array<{ url: string; title: string; domain: string }>,
  competitors: string[],
): string[] {
  if (!competitors.length) return [];
  const lower = (content || '').toLowerCase();
  const mentioned: string[] = [];

  for (const comp of competitors) {
    const compLower = comp.toLowerCase().trim();
    if (!compLower) continue;
    const compName = compLower.replace(/\.(com|net|org|co|io|biz)$/i, '').replace(/[.-]/g, ' ').trim();

    if (lower.includes(compLower) || lower.includes(compName)) {
      mentioned.push(comp);
      continue;
    }

    for (const cite of citations) {
      const domain = (cite.domain || '').toLowerCase();
      const title = (cite.title || '').toLowerCase();
      if (domain.includes(compName) || title.includes(compLower)) {
        mentioned.push(comp);
        break;
      }
    }
  }

  return mentioned;
}
