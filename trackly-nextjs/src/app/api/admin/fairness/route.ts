/**
 * Admin fairness metrics endpoint.
 * GET /api/admin/fairness
 *
 * Returns per-platform, per-tenant active count + queue depth + lifetime
 * grants/rejections from the in-process fairness scheduler. Used to spot
 * tenants whose runs are starving (high queued / low active) or whose
 * traffic is hitting the queue-overflow 429s.
 */
import { requireAdmin } from '@/lib/admin-auth';
import { getAllFairnessMetrics } from '@/lib/fairness-scheduler';

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const platforms = getAllFairnessMetrics();
  return Response.json({
    timestamp: new Date().toISOString(),
    platforms,
  });
}
