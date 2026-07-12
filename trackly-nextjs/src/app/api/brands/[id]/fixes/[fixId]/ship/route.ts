/**
 * POST /api/brands/[id]/fixes/[fixId]/ship
 *
 * Writes an approved fix to the customer's live site:
 *   Channel A → CMS REST API write via the brand's CMS connection.
 *   Channel B → queue a Connector instruction (plugin pulls + applies).
 *
 * This is the only outward-facing, hard-to-reverse step, so it requires
 * write access (team viewers cannot ship) and an explicit prior approve.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { shipFix } from '@/lib/fix-engine/engine';

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
      return Response.json({ error: 'Viewers cannot ship fixes.' }, { status: 403 });
    }
    const fix = await shipFix(fixId, id, user.id);
    const ok = fix.status === 'shipped';
    return Response.json(
      { fix, ok, error: ok ? undefined : fix.error },
      { status: ok ? 200 : 422, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    logger.warn('fix_engine.ship_route_failed', { err: (e as Error).message });
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
