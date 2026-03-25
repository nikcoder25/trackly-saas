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
      `SELECT * FROM recommendations WHERE brand_id = $1 ORDER BY
       CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       created_at DESC`, [id]
    );
    return Response.json({ recommendations: result.rows });
  } catch (e) {
    return Response.json({ error: 'Failed to load recommendations' }, { status: 500 });
  }
}
