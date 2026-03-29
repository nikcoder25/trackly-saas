import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

async function requireAdmin(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return null;
  const result = await pool.query('SELECT role FROM users WHERE id = $1', [user.id]);
  if (result.rows[0]?.role !== 'admin') return null;
  return user;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rl = rateLimit('admin_edit:' + ip, 15 * 60 * 1000, 30);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'Not found' }, { status: 404 });
  const { id } = await params;

  if (!id || typeof id !== 'string' || id.length > 50) {
    return Response.json({ error: 'Invalid user ID' }, { status: 400 });
  }

  const body = await request.json();

  // Enforce single admin: prevent assigning admin role to anyone
  // (admin is set via DB/env, not via API)
  if (body.role === 'admin') {
    return Response.json({ error: 'Cannot assign admin role. Only one admin is allowed, configured at database level.' }, { status: 403 });
  }

  const allowedFields = ['plan', 'role', 'email_verified'];
  const allowedPlans = ['free', 'starter', 'pro', 'agency', 'enterprise'];
  const allowedRoles = [null, '', 'user']; // admin cannot be set via API

  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const field of allowedFields) {
    if (body[field] === undefined) continue;
    if (field === 'plan' && !allowedPlans.includes(body[field])) {
      return Response.json({ error: `Invalid plan: ${body[field]}` }, { status: 400 });
    }
    if (field === 'role' && !allowedRoles.includes(body[field])) {
      return Response.json({ error: 'Cannot assign this role via API' }, { status: 400 });
    }
    if (field === 'email_verified' && typeof body[field] !== 'boolean') {
      return Response.json({ error: 'email_verified must be boolean' }, { status: 400 });
    }
    updates.push(`${field} = $${idx++}`);
    values.push(body[field]);
  }

  if (updates.length === 0) return Response.json({ error: 'No valid fields' }, { status: 400 });

  try {
    values.push(id);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, values);
    const result = await pool.query('SELECT id, email, username, name, plan, role, email_verified, created_at FROM users WHERE id = $1', [id]);
    if (!result.rows.length) return Response.json({ error: 'User not found' }, { status: 404 });
    return Response.json({ user: result.rows[0] });
  } catch (e) {
    console.error('[Admin Update]', (e as Error).message);
    return Response.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rl = rateLimit('admin_delete:' + ip, 15 * 60 * 1000, 10);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'Not found' }, { status: 404 });
  const { id } = await params;

  if (!id || typeof id !== 'string' || id.length > 50) {
    return Response.json({ error: 'Invalid user ID' }, { status: 400 });
  }
  if (id === admin.id) return Response.json({ error: 'Cannot delete yourself' }, { status: 400 });

  // Prevent deleting other admins
  const targetUser = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
  if (targetUser.rows[0]?.role === 'admin') {
    return Response.json({ error: 'Cannot delete admin user' }, { status: 403 });
  }

  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
    if (!result.rows.length) return Response.json({ error: 'User not found' }, { status: 404 });
    return Response.json({ success: true });
  } catch (e) {
    console.error('[Admin Delete]', (e as Error).message);
    return Response.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
