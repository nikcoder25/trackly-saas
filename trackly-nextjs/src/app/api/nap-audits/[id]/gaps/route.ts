/**
 * /api/nap-audits/[id]/gaps — citation gap finder (Phase 3).
 *
 * POST { industry, region?, competitors?[] } → asks an AI platform for the most
 * important citation directories for that business type/region (optionally
 * biased toward where named competitors are listed), then diffs the result
 * against the directories this saved audit already covers.
 */
import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getNapAudit } from '@/lib/nap-audits';
import { findCitationGaps, type RecommendedDirectory } from '@/lib/nap-verify';
import { queryAI, getDefaultModel, pickBestKey } from '@/lib/ai-platforms';
import { getServerKeys } from '@/lib/server-keys';

function buildPrompt(industry: string, region: string, competitors: string[]): string {
  const where = region ? ` operating in ${region}` : '';
  const comp = competitors.length
    ? ` Pay special attention to directories where these competitors are typically listed: ${competitors.join(', ')}.`
    : '';
  return [
    `List the most important local SEO citation and directory websites for a "${industry}" business${where}.`,
    comp,
    'Focus on general directories (e.g. Yelp, Yell), industry-specific directories, and data aggregators that influence local search.',
    'Respond with ONLY a JSON array of objects, each {"domain": "example.com", "reason": "why it matters"}. No prose, max 25 entries.',
  ].join(' ');
}

function parseDirectories(text: string): RecommendedDirectory[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: RecommendedDirectory[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const domain = typeof o.domain === 'string' ? o.domain.trim() : '';
    if (!domain) continue;
    out.push({ domain, reason: typeof o.reason === 'string' ? o.reason.trim().slice(0, 200) : undefined });
    if (out.length >= 25) break;
  }
  return out;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const industry = typeof body.industry === 'string' ? body.industry.trim().slice(0, 120) : '';
  if (!industry) return Response.json({ error: 'An industry / category is required' }, { status: 400 });
  const region = typeof body.region === 'string' ? body.region.trim().slice(0, 120) : '';
  const competitors = Array.isArray(body.competitors)
    ? body.competitors.filter((c): c is string => typeof c === 'string' && c.trim().length > 0).map((c) => c.trim().slice(0, 80)).slice(0, 10)
    : [];

  try {
    const audit = await getNapAudit(auth.id, id);
    if (!audit) return Response.json({ error: 'Audit not found' }, { status: 404 });

    const keys = getServerKeys();
    const apiKey = pickBestKey(keys.perplexity) || pickBestKey(keys.openai);
    if (!apiKey) return Response.json({ error: 'No AI platform is currently available.' }, { status: 503 });
    const platform: 'Perplexity' | 'ChatGPT' = pickBestKey(keys.perplexity) ? 'Perplexity' : 'ChatGPT';
    const model = getDefaultModel(platform);

    const result = await queryAI(platform, buildPrompt(industry, region, competitors), apiKey, model);
    const recommended = parseDirectories(result.text || '');
    if (recommended.length === 0) {
      return Response.json({ error: 'The AI did not return any directories. Try a more specific industry.' }, { status: 502 });
    }

    const gaps = findCitationGaps(audit.urls, recommended);
    return Response.json({ platform, model, industry, region, ...gaps });
  } catch (e) {
    logger.error('nap_audits.gaps_failed', { err: (e as Error).message, id });
    return Response.json({ error: 'Failed to find citation gaps' }, { status: 500 });
  }
}
