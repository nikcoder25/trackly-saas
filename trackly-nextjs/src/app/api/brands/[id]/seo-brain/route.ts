/**
 * /api/brands/[id]/seo-brain
 *
 * GET    → the brand's effective SEO brain + whether it's custom, the base
 *          (env/file/default) brain, and the loadable presets.
 * PUT     { content }  → save a custom brain for this brand.
 * DELETE  → clear the custom brain (revert to base/default).
 *
 * The brain grounds every Fix Engine generation for this brand.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess, getUserEffectivePlan } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import {
  getSeoBrainStatus, setBrandSeoBrain, clearBrandSeoBrain, SEO_BRAIN_PRESETS,
} from '@/lib/fix-engine/seo-brain';
import { meetsPlan } from '@/lib/fix-engine/registry';

const MAX_BRAIN_CHARS = 12_000;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  try {
    const { id } = await params;
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    const status = await getSeoBrainStatus(id);
    return Response.json(
      { ...status, presets: SEO_BRAIN_PRESETS, maxChars: MAX_BRAIN_CHARS },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    logger.error('fix_engine.seo_brain_get_failed', { err: (e as Error).message });
    return Response.json({ error: 'Failed to load SEO brain', message: (e as Error).message }, { status: 500 });
  }
}

interface PutBody { content?: unknown }

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  try {
    const { id } = await params;
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot edit the SEO brain.' }, { status: 403 });

    const ownerId = access.brand.userId || user.id;
    const plan = await getUserEffectivePlan(ownerId);
    if (!meetsPlan(plan, 'starter')) {
      return Response.json({ error: 'The Fix Engine is available on Starter plans and above.', planLimit: true }, { status: 403 });
    }

    let body: PutBody;
    try { body = (await request.json()) as PutBody; } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content) return Response.json({ error: 'content is required' }, { status: 400 });
    if (content.length > MAX_BRAIN_CHARS) {
      return Response.json({ error: `SEO brain is too long (max ${MAX_BRAIN_CHARS} characters).` }, { status: 400 });
    }

    await setBrandSeoBrain(id, content);
    const status = await getSeoBrainStatus(id);
    return Response.json({ ...status }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.error('fix_engine.seo_brain_put_failed', { err: (e as Error).message });
    return Response.json({ error: 'Failed to save SEO brain', message: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  try {
    const { id } = await params;
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot edit the SEO brain.' }, { status: 403 });
    await clearBrandSeoBrain(id);
    const status = await getSeoBrainStatus(id);
    return Response.json({ ...status }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.error('fix_engine.seo_brain_delete_failed', { err: (e as Error).message });
    return Response.json({ error: 'Failed to reset SEO brain', message: (e as Error).message }, { status: 500 });
  }
}
