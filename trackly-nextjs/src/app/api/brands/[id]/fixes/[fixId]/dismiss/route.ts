/**
 * POST /api/brands/[id]/fixes/[fixId]/dismiss
 *
 * Ignore a fix the AI got wrong (or that the user doesn't want). Hides it from
 * the default lists without deleting it, so it can be restored and a re-scan
 * won't resurface it. POST `{ "restore": true }` to move it back into the
 * normal workflow. Requires write access.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { dismissFix, restoreFix } from '@/lib/fix-engine/engine';

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
    if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot change fixes.' }, { status: 403 });

    let restore = false;
    try {
      const body = await request.json();
      restore = body?.restore === true;
    } catch { /* no body → dismiss */ }

    const fix = restore
      ? await restoreFix(fixId, id, user.id)
      : await dismissFix(fixId, id, user.id);
    return Response.json({ fix, ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.warn('fix_engine.dismiss_route_failed', { err: (e as Error).message });
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
