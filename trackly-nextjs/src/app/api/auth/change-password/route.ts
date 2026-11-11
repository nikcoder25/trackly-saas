import bcrypt from 'bcryptjs';
import { pool, auditLog } from '@/lib/db';
import {
  validatePasswordComplexity, revokeAllSessions, verifyRequestAuthLive,
  issueSession, signAccessToken, sessionContextFromRequest, createTokenCookieHeaders, jsonWithCookies,
} from '@/lib/auth';
import { AUTH, getEffectivePlan } from '@/lib/constants';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const user = await verifyRequestAuthLive(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  // Guards against credential-stuffing against the "current password"
  // check: per-user 5/hr stops a stolen session from brute-forcing the
  // user's old password, per-IP 20/hr stops a shared attacker host.
  const rl = await checkUserIpRateLimit('change_password', user.id, getClientIp(request), {
    user: { max: 5, windowMs: 60 * 60 * 1000 },
    ip: { max: 20, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const { currentPassword, newPassword } = await request.json();
  if (!currentPassword || !newPassword) return Response.json({ error: 'Current and new password required' }, { status: 400 });
  if (typeof newPassword !== 'string') return Response.json({ error: 'Invalid input' }, { status: 400 });
  const pwError = validatePasswordComplexity(newPassword);
  if (pwError) return Response.json({ error: pwError }, { status: 400 });

  try {
    const result = await pool.query('SELECT email, role, plan, trial_ends_at, password_hash FROM users WHERE id = $1', [user.id]);
    if (!result.rows.length) return Response.json({ error: 'User not found' }, { status: 404 });
    const ok = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!ok) return Response.json({ error: 'Current password is incorrect' }, { status: 400 });
    const hash = await bcrypt.hash(newPassword, AUTH.bcryptRounds);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);
    // Revoke every session for this user. Access tokens carry their session id
    // (sid) and are checked against user_sessions on each request, so every
    // other device is logged out immediately, not after the token TTL.
    await revokeAllSessions(pool, user.id);
    // Keep the device that made the change signed in with a fresh session.
    const row = result.rows[0];
    const { refreshToken, sessionId } = await issueSession(pool, user.id, sessionContextFromRequest(request));
    const accessToken = signAccessToken({
      id: user.id, email: row.email, role: row.role || undefined,
      plan: getEffectivePlan(row.plan, row.trial_ends_at), sid: sessionId,
    });
    const ip = getClientIp(request);
    auditLog(user.id, 'change_password', 'user', user.id, {}, ip);
    return jsonWithCookies({ message: 'Password updated successfully' }, createTokenCookieHeaders(accessToken, refreshToken));
  } catch {
    return Response.json({ error: 'Failed to change password' }, { status: 500 });
  }
}
