/**
 * POST /api/brands/[id]/fixes/targeted
 *
 * Create a user-initiated, on-demand fix for a specific page. The user drives
 * this from the "Ask for a fix" box instead of waiting for a scan. Three
 * request types, each mapped to an existing module and its normal
 * generate → approve → ship → recheck flow:
 *
 *   type: 'passage'  (default) — rewrite an exact paragraph (passage-rewrite).
 *         Body: { url, passage, instruction? }
 *   type: 'links'    — add contextual internal links / anchor text to a page
 *         (internal-linking). Body: { url, instruction? }
 *   type: 'keyword'  — target a specific keyword on a page (keyword-opportunities).
 *         Body: { url, keyword, instruction? }
 *
 * There is no cap on how many targeted fixes a user creates — each is just a
 * normal fix in the queue (credits are still reserved per generate, as ever).
 */

import crypto from 'crypto';
import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess, getUserEffectivePlan } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { upsertDetectedFix, getFix } from '@/lib/fix-engine/schema';
import { getModule, meetsPlan } from '@/lib/fix-engine/registry';
import { crawlPage, resolveCrawlTargets } from '@/lib/fix-engine/crawl';

type TargetedType = 'passage' | 'links' | 'keyword';

interface Body {
  type?: unknown;
  url?: unknown;
  passage?: unknown;
  keyword?: unknown;
  instruction?: unknown;
}

const sha16 = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  try {
    const { id } = await params;
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    if (access.role === 'viewer') {
      return Response.json({ error: 'Viewers cannot create fixes.' }, { status: 403 });
    }

    let body: Body;
    try { body = (await request.json()) as Body; } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    const type: TargetedType = body.type === 'links' || body.type === 'keyword' ? body.type : 'passage';
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';
    if (!url) return Response.json({ error: 'url is required' }, { status: 400 });

    // Each type maps to a module; enforce that module's minimum plan.
    const moduleKey = type === 'links' ? 'internal-linking' : type === 'keyword' ? 'keyword-opportunities' : 'passage-rewrite';
    const mod = getModule(moduleKey);
    if (!mod) return Response.json({ error: 'Unknown fix type' }, { status: 400 });
    const ownerId = access.brand.userId || user.id;
    const plan = await getUserEffectivePlan(ownerId);
    if (!meetsPlan(plan, mod.minPlan)) {
      return Response.json({ error: `Your plan doesn’t include ${mod.title}. Upgrade to use it.`, planLimit: true }, { status: 403 });
    }

    let dedupeKey: string;
    let severity: 'low' | 'medium' | 'high' = 'low';
    let summary: string;
    let detected: Record<string, unknown>;
    let before: Record<string, unknown> | undefined;

    if (type === 'passage') {
      const passage = typeof body.passage === 'string' ? body.passage.trim() : '';
      if (passage.length < 12) return Response.json({ error: 'passage must be at least 12 characters' }, { status: 400 });
      dedupeKey = `${url}#${sha16(passage)}`;
      summary = `Rewrite passage on ${url}`;
      detected = { url, passage, instruction };
      before = { passage };
    } else if (type === 'keyword') {
      const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : '';
      if (keyword.length < 2) return Response.json({ error: 'keyword is required' }, { status: 400 });
      dedupeKey = `${url}#kw#${sha16(keyword.toLowerCase())}`;
      severity = 'medium';
      summary = `Target “${keyword}” on ${url}`;
      // Same detected shape the scan produces; metrics are unknown for a
      // user-picked keyword, so they're 0 (the plan/section still generate).
      detected = {
        query: keyword, page: url, position: 0, impressions: 0,
        volume: 0, competition: 0, cpc: 0, instruction, targeted: true,
      };
    } else {
      // type === 'links' — build the candidate pool (other pages on the site)
      // and the source page's content so the module can generate right away.
      let title: string | null = null;
      let pageText = '';
      try { const p = await crawlPage(url); title = p.title; pageText = p.text; } catch { /* generate can still run from URLs */ }
      const targets = await resolveCrawlTargets(access.brand.website, 40);
      const candidates = targets.filter((u) => u !== url).map((u) => ({ url: u, title: null as string | null }));
      if (candidates.length === 0) {
        return Response.json({ error: 'Couldn’t find other pages on this site to link to (no reachable sitemap). Add more pages, or use a passage rewrite instead.' }, { status: 400 });
      }
      // Distinct instruction → distinct fix; same request updates in place.
      dedupeKey = `${url}#links${instruction ? `#${sha16(instruction.toLowerCase())}` : ''}`;
      summary = instruction ? `Internal links on ${url} — ${instruction.slice(0, 60)}` : `Add contextual internal links to ${url}`;
      detected = { url, title, pageText, candidates, instruction };
    }

    const fixId = await upsertDetectedFix({
      userId: ownerId,
      brandId: id,
      batchId: null,
      moduleKey,
      channel: 'A',
      targetUrl: url,
      dedupeKey,
      severity,
      summary,
      detected,
      before,
    });

    const fix = await getFix(fixId, id);
    return Response.json({ fix }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.error('fix_engine.targeted_failed', { err: (e as Error).message });
    return Response.json({ error: 'Failed to create targeted fix', message: (e as Error).message }, { status: 500 });
  }
}
