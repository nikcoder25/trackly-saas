/**
 * POST /api/brands/[id]/fixes/[fixId]/stage
 *
 * Ship-as-draft: stage an approved fix as a DRAFT revision via the
 * Connector instead of writing it live. The plugin creates a draft
 * revision and returns a preview URL; the fix moves to 'staged' and the
 * user reviews it before publishing (POST .../publish).
 *
 * Requires write access (viewers cannot stage), an active Connector, and a
 * module that can express its change as a ContentPatch.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { stageFix } from '@/lib/fix-engine/engine';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; fixId: string }> },
): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  try {
    const { id, fixId } = await params;
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    if (access.role === 'viewer') {
      return Response.json({ error: 'Viewers cannot stage fixes.' }, { status: 403 });
    }
    const fix = await stageFix(fixId, id, user.id);
    const ok = fix.status === 'staged';
    return Response.json(
      { fix, ok, error: ok ? undefined : fix.error },
      { status: ok ? 200 : 422, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    logger.warn('fix_engine.stage_route_failed', { err: (e as Error).message });
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
