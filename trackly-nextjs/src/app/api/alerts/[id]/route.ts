import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const { id } = await params;
  const body = await request.json();

  try {
    const existing = await pool.query('SELECT * FROM alert_rules WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!existing.rows.length) return Response.json({ error: 'Alert not found' }, { status: 404 });

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (body.name !== undefined) { fields.push(`name = $${idx++}`); values.push(body.name); }
    if (body.enabled !== undefined) { fields.push(`enabled = $${idx++}`); values.push(body.enabled); }
    if (body.condition_params !== undefined) { fields.push(`condition_params = $${idx++}`); values.push(JSON.stringify(body.condition_params)); }
    if (body.action_params !== undefined) { fields.push(`action_params = $${idx++}`); values.push(JSON.stringify(body.action_params)); }
    if (body.cooldown_hours !== undefined) { fields.push(`cooldown_hours = $${idx++}`); values.push(body.cooldown_hours); }

    if (fields.length === 0) return Response.json({ error: 'No fields to update' }, { status: 400 });
    values.push(id);
    await pool.query(`UPDATE alert_rules SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    const result = await pool.query('SELECT * FROM alert_rules WHERE id = $1', [id]);
    return Response.json({ alert: result.rows[0] });
  } catch (e) {
    console.error('[Alert Update]', (e as Error).message);
    return Response.json({ error: 'Failed to update alert' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const { id } = await params;

  try {
    const result = await pool.query('DELETE FROM alert_rules WHERE id = $1 AND user_id = $2 RETURNING id', [id, user.id]);
    if (!result.rows.length) return Response.json({ error: 'Alert not found' }, { status: 404 });
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: 'Failed to delete alert' }, { status: 500 });
  }
}
