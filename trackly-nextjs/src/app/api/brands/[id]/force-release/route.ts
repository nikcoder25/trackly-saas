import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const { id } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
  if (access.role === 'viewer') return Response.json({ error: 'Forbidden' }, { status: 403 });

  // Mark any active runs for this brand as error in DB
  await pool.query(
    `UPDATE active_runs SET status = 'error', error = 'Force-released by user', completed_at = NOW()
     WHERE brand_id = $1 AND status = 'running'`,
    [id]
  );

  return Response.json({ ok: true, message: 'Lock released' });
}
