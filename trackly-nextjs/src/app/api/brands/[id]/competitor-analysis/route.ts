import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const rl = await checkUserIpRateLimit('competitor_analysis', user.id, getClientIp(request), {
    user: { max: 60, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const { id } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

  try {
    const result = await pool.query(
      `SELECT competitor_name, platform,
              SUM(appearance_count) as total_appearances,
              AVG(avg_position) as avg_position,
              MAX(last_seen_at) as last_seen
       FROM competitor_cooccurrence
       WHERE brand_id = $1
       GROUP BY competitor_name, platform
       ORDER BY total_appearances DESC`,
      [id]
    );
    return Response.json({ competitors: result.rows });
  } catch (e) {
    // competitor_cooccurrence was created and filled only by the retired
    // Express app; nothing in this codebase creates or writes it, so on any
    // database set up since, there is simply no data yet.
    if ((e as { code?: string }).code === '42P01') return Response.json({ competitors: [] });
    console.error('[CompetitorAnalysis]', (e as Error).message);
    return Response.json({ error: 'Failed to load competitor data' }, { status: 500 });
  }
}
