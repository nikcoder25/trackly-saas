/**
 * POST /api/brands/[id]/fixes/[fixId]/approve
 *
 * Human gate: marks a generated fix approved so it becomes eligible to
 * ship. Kept separate from ship so the UI can require explicit approval
 * before anything is written to the customer's live site.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { approveFix } from '@/lib/fix-engine/engine';

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
      return Response.json({ error: 'Viewers cannot approve fixes.' }, { status: 403 });
    }
    const fix = await approveFix(fixId, id, user.id);
    return Response.json({ fix }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.warn('fix_engine.approve_route_failed', { err: (e as Error).message });
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
