import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

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
    console.error('[CompetitorAnalysis]', (e as Error).message);
    return Response.json({ error: 'Failed to load competitor data' }, { status: 500 });
  }
}
