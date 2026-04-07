import { pool, auditLog } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import bcrypt from 'bcryptjs';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const { id } = await params;

  try {
    const result = await pool.query(`
      SELECT u.id, u.email, u.username, u.name, u.plan, u.role, u.email_verified, u.created_at,
        u.settings->>'dodo_subscription_id' AS subscription_id,
        u.settings->>'totp_secret' IS NOT NULL AS totp_enabled,
        u.google_id IS NOT NULL AS has_google,
        (SELECT COUNT(*)::int FROM brands WHERE user_id = u.id) AS brand_count,
        (SELECT json_agg(json_build_object('id', b.id, 'name', b.data->>'name', 'created_at', b.created_at))
         FROM brands b WHERE b.user_id = u.id) AS brands,
        (SELECT COUNT(*)::int FROM prompt_runs WHERE brand_id IN (SELECT id FROM brands WHERE user_id = u.id)) AS total_queries,
        (SELECT COALESCE(SUM(cost), 0)::numeric FROM api_logs WHERE user_id = u.id) AS total_cost
      FROM users u WHERE u.id = $1
    `, [id]);

    if (!result.rows.length) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // Recent activity
    const activity = await pool.query(`
      SELECT action, target_type, details, ip, created_at
      FROM audit_logs WHERE user_id = $1
      ORDER BY created_at DESC LIMIT 20
    `, [id]);

    return Response.json({
      user: result.rows[0],
      recentActivity: activity.rows,
    });
  } catch (e) {
    console.error('[Admin User Detail]', (e as Error).message);
    return Response.json({ error: 'Failed to load user' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const { id } = await params;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';

  try {
    const body = await request.json();
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (body.plan) {
      const validPlans = ['free', 'starter', 'pro', 'agency', 'enterprise', 'owner'];
      if (!validPlans.includes(body.plan)) {
        return Response.json({ error: 'Invalid plan' }, { status: 400 });
      }
      updates.push(`plan = $${idx++}`);
      values.push(body.plan);
    }

    if (body.name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(body.name || null);
    }

    if (body.email !== undefined) {
      updates.push(`email = $${idx++}`);
      values.push(body.email.toLowerCase().trim());
    }

    if (typeof body.email_verified === 'boolean') {
      updates.push(`email_verified = $${idx++}`);
      values.push(body.email_verified);
    }

    if (body.password) {
      const hash = await bcrypt.hash(body.password, 12);
      updates.push(`password_hash = $${idx++}`);
      values.push(hash);
    }

    if (!updates.length) {
      return Response.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}
       RETURNING id, email, name, plan, role, email_verified`,
      values
    );

    if (!result.rows.length) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    auditLog(admin.id, 'admin_update_user', 'user', id, body, ip);

    return Response.json({ user: result.rows[0] });
  } catch (e) {
    console.error('[Admin Update User]', (e as Error).message);
    return Response.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const { id } = await params;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';

  if (id === admin.id) {
    return Response.json({ error: 'Cannot delete your own account' }, { status: 400 });
  }

  try {
    const userResult = await pool.query('SELECT email, role FROM users WHERE id = $1', [id]);
    if (!userResult.rows.length) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }
    if (userResult.rows[0].role === 'admin') {
      return Response.json({ error: 'Cannot delete admin users' }, { status: 403 });
    }

    // Delete user and cascade
    await pool.query('DELETE FROM brands WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM audit_logs WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM notifications WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM api_logs WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    auditLog(admin.id, 'admin_delete_user', 'user', id, { email: userResult.rows[0].email }, ip);

    return Response.json({ success: true });
  } catch (e) {
    console.error('[Admin Delete User]', (e as Error).message);
    return Response.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
