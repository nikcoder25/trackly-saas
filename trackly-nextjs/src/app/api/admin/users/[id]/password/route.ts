import bcrypt from 'bcryptjs';
import { pool, auditLog } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { AUTH } from '@/lib/constants';

// Admin-only: force-reset a user's password. Ported from the Express
// handler at routes/admin.js::PUT /admin/users/:id/password.
//
// Requires the caller to be an admin *and* to explicitly opt in with
// `{ confirm: true }` in the request body so a mis-click in the admin
// dashboard can't silently rotate someone's credentials. Every
// invocation is written to the audit log and rate-limited.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rl = await rateLimit('admin_force_reset_pw:' + ip, 15 * 60 * 1000, 10);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  // Auth + admin check
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const admin = authResult;
  const roleRow = await pool.query('SELECT role FROM users WHERE id = $1', [admin.id]);
  if (roleRow.rows[0]?.role !== 'admin') {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const { id } = await params;
  if (!id || typeof id !== 'string' || id.length > 50) {
    return Response.json({ error: 'Invalid user ID' }, { status: 400 });
  }

  let body: { password?: unknown; confirm?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (body.confirm !== true) {
    return Response.json({
      error: 'Confirmation required. Send { "confirm": true } to proceed.',
      requiresConfirm: true,
    }, { status: 400 });
  }
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 8) {
    return Response.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }
  if (password.length > 128) {
    return Response.json({ error: 'Password too long' }, { status: 400 });
  }

  try {
    const hash = await bcrypt.hash(password, AUTH.bcryptRounds);
    // Also invalidate any active session so the target user must log in
    // again with the new password — otherwise an attacker who has briefly
    // compromised admin access could leave back-door refresh tokens alive.
    const result = await pool.query(
      'UPDATE users SET password_hash = $1, refresh_token = NULL WHERE id = $2 RETURNING email',
      [hash, id],
    );
    if (!result.rows.length) return Response.json({ error: 'User not found' }, { status: 404 });

    await auditLog(admin.id, 'admin_reset_password', 'user', id, {
      email: result.rows[0].email,
    }, ip);

    return Response.json({ success: true, message: 'Password updated' });
  } catch (e) {
    const msg = (e as Error).message;
    if (process.env.NODE_ENV === 'production') {
      console.error('[Admin force password reset] Failed:', msg);
    } else {
      console.error('[Admin force password reset] Failed:', msg, (e as Error).stack);
    }
    return Response.json({ error: 'Failed to reset password' }, { status: 500 });
  }
}
