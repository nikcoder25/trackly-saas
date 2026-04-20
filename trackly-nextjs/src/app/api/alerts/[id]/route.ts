import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';

// Explicit allow-list of updatable columns. The SET clause is built from
// this static list (never from request keys), and each value goes through
// a parameterized placeholder, so this is not an injection surface — but
// keeping the list explicit makes that guarantee reviewable at a glance.
type AlertField = 'name' | 'enabled' | 'condition_params' | 'action_params' | 'cooldown_hours';

function coerceField(field: AlertField, raw: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  switch (field) {
    case 'name':
      if (typeof raw !== 'string' || raw.length === 0 || raw.length > 200) return { ok: false, error: 'name must be a non-empty string up to 200 chars' };
      return { ok: true, value: raw.trim() };
    case 'enabled':
      if (typeof raw !== 'boolean') return { ok: false, error: 'enabled must be a boolean' };
      return { ok: true, value: raw };
    case 'condition_params':
    case 'action_params':
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: `${field} must be an object` };
      return { ok: true, value: JSON.stringify(raw) };
    case 'cooldown_hours': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 24 * 365) return { ok: false, error: 'cooldown_hours must be between 0 and 8760' };
      return { ok: true, value: Math.floor(n) };
    }
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const { id } = await params;
  const body = await request.json();

  try {
    const existing = await pool.query('SELECT * FROM alert_rules WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!existing.rows.length) return Response.json({ error: 'Alert not found' }, { status: 404 });

    const updatable: AlertField[] = ['name', 'enabled', 'condition_params', 'action_params', 'cooldown_hours'];
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const field of updatable) {
      if (body[field] === undefined) continue;
      const result = coerceField(field, body[field]);
      if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
      fields.push(`${field} = $${idx++}`);
      values.push(result.value);
    }

    if (fields.length === 0) return Response.json({ error: 'No fields to update' }, { status: 400 });
    values.push(id);
    await pool.query(`UPDATE alert_rules SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    const result = await pool.query('SELECT * FROM alert_rules WHERE id = $1', [id]);
    return Response.json({ alert: result.rows[0] });
  } catch (e) {
    logger.error('alerts.update_failed', { alert_id: id, user_id: user.id, error: (e as Error).message });
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
