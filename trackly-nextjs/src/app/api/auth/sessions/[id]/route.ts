import { pool, auditLog } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import {
  logError,
  serverError,
  unauthorized,
  badRequest,
  notFound,
} from '@/lib/api-error';

// Revoke a single session by its user_sessions.id. Scoped to the authenticated
// user: the DELETE WHERE clause includes user_id, so presenting another user's
// session id returns 404 rather than dropping their row.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = verifyRequestAuth(request);
  if (!user) return unauthorized();

  const rl = await checkUserIpRateLimit('session_revoke', user.id, getClientIp(request), {
    user: { max: 30, windowMs: 60 * 60 * 1000 },
    ip: { max: 60, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const { id } = await params;
  if (!id || typeof id !== 'string' || id.length > 100) {
    return badRequest('Invalid session id');
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';

  try {
    const result = await pool.query(
      'DELETE FROM user_sessions WHERE id = $1 AND user_id = $2',
      [id, user.id]
    );
    if (!result.rowCount) return notFound('Session not found');
    auditLog(user.id, 'session_revoked', 'user_session', id, {}, ip);
    return Response.json({ success: true });
  } catch (e) {
    logError('auth.sessions.revoke_failed', e);
    return serverError({ message: 'Failed to revoke session' });
  }
}
