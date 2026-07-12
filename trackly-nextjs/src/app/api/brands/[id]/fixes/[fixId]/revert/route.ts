/**
 * POST /api/brands/[id]/fixes/[fixId]/revert
 *
 * Undo a shipped fix by restoring the pre-fix value (for module types that
 * support it — e.g. title / meta rewrites). Requires write access.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { revertFix } from '@/lib/fix-engine/engine';

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
    if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot revert fixes.' }, { status: 403 });
    const fix = await revertFix(fixId, id, user.id);
    const ok = fix.status === 'reverted';
    return Response.json({ fix, ok, error: ok ? undefined : fix.error }, { status: ok ? 200 : 422, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.warn('fix_engine.revert_route_failed', { err: (e as Error).message });
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
