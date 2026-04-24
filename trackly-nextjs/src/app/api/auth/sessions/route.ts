import { pool } from '@/lib/db';
import {
  verifyRequestAuth,
  getRefreshTokenFromRequest,
  hashToken,
} from '@/lib/auth';
import { logError, serverError, unauthorized } from '@/lib/api-error';

// Device-management list endpoint. Returns the active user_sessions rows for
// the authenticated user, with the row whose hash matches the current request's
// refresh cookie flagged so the UI can warn before revoking self.
export async function GET(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return unauthorized();

  const refreshToken = getRefreshTokenFromRequest(request);
  const currentHash = refreshToken ? hashToken(refreshToken) : null;

  try {
    const result = await pool.query(
      `SELECT id, user_agent, ip, created_at, last_used_at, refresh_token_hash
         FROM user_sessions
        WHERE user_id = $1
        ORDER BY last_used_at DESC`,
      [user.id]
    );
    const sessions = result.rows.map((row) => ({
      id: row.id,
      user_agent: row.user_agent,
      ip: row.ip,
      created_at: row.created_at,
      last_used_at: row.last_used_at,
      is_current: currentHash !== null && row.refresh_token_hash === currentHash,
    }));
    return Response.json({ sessions });
  } catch (e) {
    logError('auth.sessions.list_failed', e);
    return serverError({ message: 'Failed to load sessions' });
  }
}
