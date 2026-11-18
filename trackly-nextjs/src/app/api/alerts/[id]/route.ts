import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { logError, serverError } from '@/lib/api-error';
import { readJsonObject, invalidJsonBody } from '@/lib/read-json';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const { id } = await params;
  const body = await readJsonObject(request);
  if (!body) return invalidJsonBody();

  try {
    const existing = await pool.query('SELECT * FROM alert_rules WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!existing.rows.length) return Response.json({ error: 'Alert not found' }, { status: 404 });

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    // Validate before building the UPDATE: a wrong type here used to reach
    // Postgres as a cast error and come back as a 500.
    const isObj = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
    if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 200)) {
      return Response.json({ error: 'Name must be 1-200 characters' }, { status: 400 });
    }
    if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
      return Response.json({ error: 'enabled must be true or false' }, { status: 400 });
    }
    if (body.condition_params !== undefined && !isObj(body.condition_params)) {
      return Response.json({ error: 'condition_params must be an object' }, { status: 400 });
    }
    if (body.action_params !== undefined && !isObj(body.action_params)) {
      return Response.json({ error: 'action_params must be an object' }, { status: 400 });
    }
    const cooldown = body.cooldown_hours === undefined ? undefined : Number(body.cooldown_hours);
    if (cooldown !== undefined && (!Number.isInteger(cooldown) || cooldown < 1 || cooldown > 24 * 30)) {
      return Response.json({ error: 'cooldown_hours must be a whole number of hours between 1 and 720' }, { status: 400 });
    }

    if (body.name !== undefined) { fields.push(`name = $${idx++}`); values.push(body.name.trim()); }
    if (body.enabled !== undefined) { fields.push(`enabled = $${idx++}`); values.push(body.enabled); }
    if (body.condition_params !== undefined) { fields.push(`condition_params = $${idx++}`); values.push(JSON.stringify(body.condition_params)); }
    if (body.action_params !== undefined) { fields.push(`action_params = $${idx++}`); values.push(JSON.stringify(body.action_params)); }
    if (cooldown !== undefined) { fields.push(`cooldown_hours = $${idx++}`); values.push(cooldown); }

    if (fields.length === 0) return Response.json({ error: 'No fields to update' }, { status: 400 });
    // Belt-and-suspenders: keep user_id in the UPDATE's WHERE too so a
    // race between the SELECT ownership check and this UPDATE can't be
    // exploited to mutate someone else's row.
    values.push(id, user.id);
    await pool.query(`UPDATE alert_rules SET ${fields.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1}`, values);
    const result = await pool.query('SELECT * FROM alert_rules WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!result.rows.length) return Response.json({ error: 'Alert not found' }, { status: 404 });
    return Response.json({ alert: result.rows[0] });
  } catch (e) {
    logError('alerts.update_failed', e, { alert_id: id });
    return serverError({ message: 'Failed to update alert' });
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
  } catch (e) {
    logError('alerts.delete_failed', e, { alert_id: id });
    return serverError({ message: 'Failed to delete alert' });
  }
}
