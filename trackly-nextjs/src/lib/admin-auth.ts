/**
 * Admin backend auth helper - verifies admin role for all admin-backend API routes.
 */
import { pool } from '@/lib/db';
import { verifyRequestAuth, type JWTPayload } from '@/lib/auth';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

export interface AdminUser extends JWTPayload {
  role: string;
}

/**
 * Verify the request is from an authenticated admin user.
 * Returns the admin user payload or a Response error.
 */
export async function requireAdmin(request: Request): Promise<AdminUser | Response> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rl = await rateLimit('admin_backend:' + ip, 15 * 60 * 1000, 60);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

  const result = await pool.query('SELECT role FROM users WHERE id = $1', [user.id]);
  if (!result.rows.length) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { role } = result.rows[0];
  // Only explicit role='admin' grants access. Previously this also
  // accepted plan='owner', but that's a billing field that can be set
  // via subscription webhooks / admin panel edits; treating it as an
  // access-control signal lets a billing-only change escalate privileges.
  // The role='admin' → plan='owner' sync still happens in /api/auth/me
  // for convenience, so legitimate admins remain on the owner plan
  // without being able to lose admin by changing plan.
  if (role !== 'admin') {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  return { ...user, role: role || 'user' };
}
