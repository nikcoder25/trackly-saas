import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { uid } from '@/lib/helpers';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const { id } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

  const result = await pool.query('SELECT id, brand_id, user_id, name, condition_type, condition_params, action_type, action_params, cooldown_hours, enabled, created_at FROM alert_rules WHERE brand_id = $1 ORDER BY created_at DESC LIMIT 100', [id]);
  return Response.json({ alerts: result.rows });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const { id: brandId } = await params;
  const access = await getBrandWithAccess(brandId, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
  if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot create alerts' }, { status: 403 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid request body' }, { status: 400 }); }
  const { name, condition_type, condition_params, action_type, action_params, cooldown_hours } = body;
  if (!name || !condition_type) return Response.json({ error: 'Name and condition type required' }, { status: 400 });

  try {
    const id = uid();
    await pool.query(
      `INSERT INTO alert_rules (id, brand_id, user_id, name, condition_type, condition_params, action_type, action_params, cooldown_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, brandId, user.id, name, condition_type, JSON.stringify(condition_params || {}), action_type || 'email', JSON.stringify(action_params || {}), cooldown_hours || 24]
    );
    const result = await pool.query('SELECT * FROM alert_rules WHERE id = $1', [id]);
    return Response.json({ alert: result.rows[0] });
  } catch (e) {
    return Response.json({ error: 'Failed to create alert' }, { status: 500 });
  }
}
