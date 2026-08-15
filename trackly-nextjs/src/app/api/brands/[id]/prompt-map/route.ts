/**
 * Prompt map: the topic each tracked prompt belongs to, and the page on the
 * brand's own site that is supposed to win it.
 *
 *   GET   - read the current map plus the candidate page list
 *   POST  - (re)build the map with the classifier
 *   PATCH - set one prompt's topic/page by hand (marks it 'manual', which
 *           subsequent automatic rebuilds will then leave alone)
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logError, serverError } from '@/lib/api-error';
import { logger } from '@/lib/logger';
import { classifyPrompts, selectImportantPages } from '@/lib/prompt-map';
import {
  getPromptMeta,
  getPromptStats,
  normalizePromptKey,
  prunePromptMeta,
  sanitizePageUrl,
  sanitizeTopic,
  upsertPromptMeta,
  type PromptMeta,
  type PromptStats,
} from '@/lib/prompt-meta';

interface BrandShape {
  id: string;
  userId?: string;
  name?: string;
  industry?: string;
  city?: string;
  website?: string;
  queries?: unknown;
}

function trackedQueries(brand: BrandShape): string[] {
  return Array.isArray(brand.queries)
    ? (brand.queries as unknown[])
        .filter((q): q is string => typeof q === 'string')
        .map(q => q.trim())
        .filter(Boolean)
    : [];
}

/** Shape the map for the client: keyed by the prompt text as tracked. */
function serializeMap(queries: string[], meta: Map<string, PromptMeta>) {
  const out: Record<string, { topic: string | null; pageUrl: string | null; source: string }> = {};
  for (const q of queries) {
    const hit = meta.get(normalizePromptKey(q));
    out[q] = {
      topic: hit?.topic ?? null,
      pageUrl: hit?.pageUrl ?? null,
      source: hit?.source ?? 'auto',
    };
  }
  return out;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireVerifiedAuth(request, pool);
    if (authResult instanceof Response) return authResult;
    const user = authResult;
    const { id } = await params;

    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    const brand = access.brand as BrandShape;

    const queries = trackedQueries(brand);
    const sp = new URL(request.url).searchParams;
    const rawDays = Number(sp.get('days'));
    const days = Number.isFinite(rawDays) ? Math.min(365, Math.max(1, Math.trunc(rawDays))) : 30;

    const [meta, stats] = await Promise.all([
      getPromptMeta(id),
      getPromptStats(id, days),
    ]);

    // Pages are only needed when the caller wants to edit a binding, and
    // fetching a sitemap on every dashboard render would be wasteful.
    const wantPages = sp.get('pages') === '1';
    const pages = wantPages ? await selectImportantPages(brand.website) : [];

    const statsByQuery: Record<string, PromptStats> = {};
    for (const q of queries) {
      const hit = stats.get(q.trim().toLowerCase());
      if (hit) statsByQuery[q] = hit;
    }

    return Response.json({
      map: serializeMap(queries, meta),
      stats: statsByQuery,
      pages,
      days,
      classified: queries.filter(q => meta.get(normalizePromptKey(q))?.topic).length,
      total: queries.length,
    });
  } catch (e) {
    logError('prompt_map.get_failed', e);
    return serverError({ message: 'Failed to load the prompt map' });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireVerifiedAuth(request, pool);
    if (authResult instanceof Response) return authResult;
    const user = authResult;
    const { id } = await params;

    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    if (access.role === 'viewer') {
      return Response.json({ error: 'Viewers cannot rebuild the prompt map' }, { status: 403 });
    }
    const brand = access.brand as BrandShape;

    // Classification is an LLM call per 40 prompts - cheap, but not free,
    // and nothing good comes of letting a user hammer the button.
    const rl = await rateLimit(`prompt_map:${user.id}`, 10 * 60 * 1000, 12);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

    const body = await request.json().catch(() => ({}));
    const overwriteManual = body?.overwriteManual === true;

    const queries = trackedQueries(brand);
    if (!queries.length) {
      return Response.json({ error: 'This brand has no tracked prompts yet' }, { status: 400 });
    }

    const pages = await selectImportantPages(brand.website);
    const outcome = await classifyPrompts({
      tenantId: brand.userId || user.id,
      brandName: brand.name || 'the brand',
      industry: brand.industry,
      city: brand.city,
      queries,
      pages,
    });

    if (!outcome.platform) {
      return Response.json(
        { error: 'No AI API keys available. Add keys in Account Settings or contact admin.' },
        { status: 400 },
      );
    }

    const written = await upsertPromptMeta(id, outcome.rows, { overwriteManual });
    await prunePromptMeta(id, queries);

    const meta = await getPromptMeta(id);
    const topics = new Set(
      [...meta.values()].map(m => m.topic).filter((t): t is string => !!t),
    );

    logger.info('prompt_map.rebuilt', {
      brandId: id,
      platform: outcome.platform,
      prompts: queries.length,
      written,
      topics: topics.size,
      pagesOffered: pages.length,
    });

    return Response.json({
      map: serializeMap(queries, meta),
      pages,
      // `written` excludes rows skipped because a human had set them, so
      // the UI can say "12 of 20 updated, 8 kept as you set them" instead
      // of claiming it reclassified everything.
      written,
      skippedManual: overwriteManual ? 0 : Math.max(0, outcome.rows.length - written),
      unclassified: outcome.unclassified,
      topics: topics.size,
      platform: outcome.platform,
    });
  } catch (e) {
    logError('prompt_map.rebuild_failed', e);
    return serverError({ message: 'Failed to rebuild the prompt map' });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireVerifiedAuth(request, pool);
    if (authResult instanceof Response) return authResult;
    const user = authResult;
    const { id } = await params;

    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    if (access.role === 'viewer') {
      return Response.json({ error: 'Viewers cannot edit the prompt map' }, { status: 403 });
    }
    const brand = access.brand as BrandShape;

    const body = await request.json().catch(() => ({}));
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    if (!query) return Response.json({ error: 'query is required' }, { status: 400 });

    // Only prompts this brand actually tracks - otherwise the table
    // accumulates orphans that prune would have to chase later.
    const queries = trackedQueries(brand);
    const key = normalizePromptKey(query);
    const tracked = queries.find(q => normalizePromptKey(q) === key);
    if (!tracked) {
      return Response.json({ error: 'That prompt is not tracked for this brand' }, { status: 404 });
    }

    // A page must be on the brand's own site. Binding a prompt to someone
    // else's URL would send the Fix Engine somewhere it cannot publish.
    const rawPage = body?.pageUrl;
    let pageUrl: string | null = null;
    if (typeof rawPage === 'string' && rawPage.trim()) {
      pageUrl = sanitizePageUrl(rawPage);
      if (!pageUrl) return Response.json({ error: 'pageUrl must be a valid http(s) URL' }, { status: 400 });
      if (brand.website) {
        try {
          const site = new URL(brand.website.startsWith('http') ? brand.website : `https://${brand.website}`);
          const target = new URL(pageUrl);
          const strip = (h: string) => h.toLowerCase().replace(/^www\./, '');
          if (strip(site.hostname) !== strip(target.hostname)) {
            return Response.json(
              { error: 'The page must be on this brand’s own website' },
              { status: 400 },
            );
          }
        } catch {
          return Response.json({ error: 'pageUrl could not be validated' }, { status: 400 });
        }
      }
    }

    await upsertPromptMeta(
      id,
      [{ query: tracked, topic: sanitizeTopic(body?.topic), pageUrl, source: 'manual' }],
      { overwriteManual: true },
    );

    const meta = await getPromptMeta(id);
    return Response.json({ map: serializeMap(queries, meta) });
  } catch (e) {
    logError('prompt_map.patch_failed', e);
    return serverError({ message: 'Failed to update the prompt map' });
  }
}
