/**
 * POST /api/brands/[id]/fixes/targeted
 *
 * Create a user-initiated, on-demand fix for a specific page. Three request
 * types, each mapped to a module (see lib/fix-engine/targeted.ts):
 *
 *   type: 'passage'  (default) — rewrite an exact paragraph. Body: { url, passage, instruction? }
 *   type: 'links'    — add contextual internal links / anchor text. Body: { url, instruction? }
 *   type: 'keyword'  — target a specific keyword on a page. Body: { url, keyword, instruction? }
 *
 * Free-text requests go through the sibling /assistant route instead.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess, getUserEffectivePlan } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { getFix } from '@/lib/fix-engine/schema';
import { getModule, meetsPlan } from '@/lib/fix-engine/registry';
import { createTargetedFix, type TargetedModuleKey } from '@/lib/fix-engine/targeted';

interface Body { type?: unknown; url?: unknown; passage?: unknown; keyword?: unknown; instruction?: unknown }

const TYPE_TO_MODULE: Record<string, TargetedModuleKey> = {
  passage: 'passage-rewrite',
  links: 'internal-linking',
  keyword: 'keyword-opportunities',
};

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
    if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot create fixes.' }, { status: 403 });

    let body: Body;
    try { body = (await request.json()) as Body; } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    const type = typeof body.type === 'string' ? body.type : 'passage';
    const moduleKey = TYPE_TO_MODULE[type] ?? 'passage-rewrite';
    const mod = getModule(moduleKey);
    if (!mod) return Response.json({ error: 'Unknown fix type' }, { status: 400 });

    const ownerId = access.brand.userId || user.id;
    const plan = await getUserEffectivePlan(ownerId);
    if (!meetsPlan(plan, mod.minPlan)) {
      return Response.json({ error: `Your plan doesn’t include ${mod.title}. Upgrade to use it.`, planLimit: true }, { status: 403 });
    }

    const { fixId } = await createTargetedFix({
      brandId: id,
      ownerId,
      website: access.brand.website,
      moduleKey,
      url: typeof body.url === 'string' ? body.url : '',
      passage: typeof body.passage === 'string' ? body.passage : undefined,
      keyword: typeof body.keyword === 'string' ? body.keyword : undefined,
      instruction: typeof body.instruction === 'string' ? body.instruction : undefined,
    });

    const fix = await getFix(fixId, id);
    return Response.json({ fix }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.error('fix_engine.targeted_failed', { err: (e as Error).message });
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
