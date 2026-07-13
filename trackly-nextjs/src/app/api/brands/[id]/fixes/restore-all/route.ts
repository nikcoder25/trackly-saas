/**
 * POST /api/brands/[id]/fixes/restore-all
 *
 * Restore ignored (dismissed) fixes back into the normal workflow in one
 * click. Body: { ids?: string[] } — restore just that selection; omit to
 * restore every dismissed fix for the brand. One scoped UPDATE, so restoring
 * hundreds of ignored fixes is a single round-trip. Requires write access.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { restoreAllDismissed } from '@/lib/fix-engine/engine';

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
    if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot change fixes.' }, { status: 403 });

    let ids: string[] | undefined;
    try {
      const body = await request.json();
      if (Array.isArray(body?.ids)) ids = body.ids.filter((x: unknown): x is string => typeof x === 'string');
    } catch { /* no body → restore all dismissed */ }

    const restored = await restoreAllDismissed(id, user.id, ids);
    return Response.json({ ok: true, restored }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.warn('fix_engine.restore_all_route_failed', { err: (e as Error).message });
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
