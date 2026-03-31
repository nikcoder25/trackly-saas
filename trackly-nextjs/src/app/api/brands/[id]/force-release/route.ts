import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { activeRuns, releaseBrandLock } from '@/lib/run-state';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const { id } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
  if (access.role === 'viewer') return Response.json({ error: 'Forbidden' }, { status: 403 });

  // Abort any active run for this brand
  for (const [, run] of activeRuns) {
    if (run.brandId === id && run.status === 'running') {
      run.status = 'error';
      run.error = 'Force-released by user';
      run.completedAt = Date.now();
      run.aborted = true;
    }
  }

  releaseBrandLock(id);

  return Response.json({ ok: true, message: 'Lock released' });
}
