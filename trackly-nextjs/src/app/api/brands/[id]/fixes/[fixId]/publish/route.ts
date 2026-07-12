/**
 * POST /api/brands/[id]/fixes/[fixId]/publish
 *
 * Promote a staged (ship-as-draft) fix to live. Re-queues the fix for the
 * Connector with the 'publish_content' op; on ack the fix flips to
 * 'shipped' and auto-rechecks. Requires write access.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { publishStagedFix } from '@/lib/fix-engine/engine';

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
      return Response.json({ error: 'Viewers cannot publish fixes.' }, { status: 403 });
    }
    const fix = await publishStagedFix(fixId, id, user.id);
    return Response.json(
      { fix, ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    logger.warn('fix_engine.publish_route_failed', { err: (e as Error).message });
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
