/**
 * GET /api/brands/[id]/fixes/batches/[batchId]
 *
 * Poll a scan batch's progress (queued → running → done/failed) so the
 * dashboard can show live detection progress after POST .../fixes.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { getBatch } from '@/lib/fix-engine/schema';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; batchId: string }> },
): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  try {
    const { id, batchId } = await params;
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    const batch = await getBatch(batchId);
    if (!batch || batch.brandId !== id) {
      return Response.json({ error: 'Batch not found' }, { status: 404 });
    }
    return Response.json({ batch }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.error('fix_engine.batch_status_failed', { err: (e as Error).message });
    return Response.json({ error: 'Failed to load batch', message: (e as Error).message }, { status: 500 });
  }
}
