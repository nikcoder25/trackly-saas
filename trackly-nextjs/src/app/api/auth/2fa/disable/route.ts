import bcrypt from 'bcryptjs';
import { pool, auditLog } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  // Disabling 2FA is a high-value target for attackers who've obtained a
  // session - tight per-user cap (3/day) with an IP backstop for
  // multi-account attacks.
  const rl = await checkUserIpRateLimit('twofa_disable', user.id, getClientIp(request), {
    user: { max: 3, windowMs: 24 * 60 * 60 * 1000 },
    ip: { max: 20, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const { password } = await request.json();
  if (!password) return Response.json({ error: 'Password required to disable 2FA' }, { status: 400 });

  try {
    const userResult = await pool.query('SELECT password_hash, settings FROM users WHERE id = $1', [user.id]);
    if (!userResult.rows.length) return Response.json({ error: 'User not found' }, { status: 404 });
    const ok = await bcrypt.compare(password, userResult.rows[0].password_hash);
    if (!ok) return Response.json({ error: 'Incorrect password' }, { status: 400 });

    await pool.query(
      `UPDATE users SET settings = settings || $1::jsonb WHERE id = $2`,
      [JSON.stringify({
        totp_secret: null,
        totp_enabled: false,
        totp_secret_pending: null,
        totp_backup_codes: null,
      }), user.id]
    );

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    auditLog(user.id, '2fa_disabled', 'user', user.id, {}, ip);
    return Response.json({ enabled: false, message: 'Two-factor authentication disabled.' });
  } catch (e) {
    logger.error('auth.2fa_disable_failed', { error: (e as Error).message });
    return Response.json({ error: 'Failed to disable 2FA' }, { status: 500 });
  }
}
