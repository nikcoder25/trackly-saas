/**
 * POST /api/brands/[id]/fixes/targeted
 *
 * Create a user-initiated targeted passage rewrite. The user supplies a
 * page URL, the exact passage to rewrite, and an instruction. We create a
 * `passage-rewrite` fix in 'detected' state; the normal
 * generate → approve → ship → recheck flow then applies (ship does an
 * in-place find-and-replace of the passage via the CMS).
 *
 * Body: { url: string, passage: string, instruction?: string }
 */

import crypto from 'crypto';
import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess, getUserEffectivePlan } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { upsertDetectedFix, getFix } from '@/lib/fix-engine/schema';
import { getModule, meetsPlan } from '@/lib/fix-engine/registry';

interface Body { url?: unknown; passage?: unknown; instruction?: unknown }

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

    const mod = getModule('passage-rewrite')!;
    const ownerId = access.brand.userId || user.id;
    const plan = await getUserEffectivePlan(ownerId);
    if (!meetsPlan(plan, mod.minPlan)) {
      return Response.json({ error: 'Upgrade required to use passage rewrite.', planLimit: true }, { status: 403 });
    }

    let body: Body;
    try { body = (await request.json()) as Body; } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    const passage = typeof body.passage === 'string' ? body.passage.trim() : '';
    const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';
    if (!url) return Response.json({ error: 'url is required' }, { status: 400 });
    if (passage.length < 12) return Response.json({ error: 'passage must be at least 12 characters' }, { status: 400 });

    // Dedupe per (url, passage) so re-submitting the same selection updates
    // the existing fix rather than stacking duplicates.
    const dedupeKey = `${url}#${crypto.createHash('sha256').update(passage).digest('hex').slice(0, 16)}`;
    const fixId = await upsertDetectedFix({
      userId: ownerId,
      brandId: id,
      batchId: null,
      moduleKey: 'passage-rewrite',
      channel: 'A',
      targetUrl: url,
      dedupeKey,
      severity: 'low',
      summary: `Rewrite passage on ${url}`,
      detected: { url, passage, instruction },
      before: { passage },
    });

    const fix = await getFix(fixId, id);
    return Response.json({ fix }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.error('fix_engine.targeted_failed', { err: (e as Error).message });
    return Response.json({ error: 'Failed to create targeted fix', message: (e as Error).message }, { status: 500 });
  }
}
