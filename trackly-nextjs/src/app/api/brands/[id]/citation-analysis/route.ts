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
      `SELECT domain, domain_type, is_brand, is_competitor,
              COUNT(*) as total, AVG(position) as avg_position,
              MAX(created_at) as last_seen
       FROM citations WHERE brand_id = $1
       GROUP BY domain, domain_type, is_brand, is_competitor
       ORDER BY total DESC LIMIT 100`, [id]
    );
    return Response.json({ citations: result.rows });
  } catch (e) {
    return Response.json({ error: 'Failed to load citations' }, { status: 500 });
  }
}
