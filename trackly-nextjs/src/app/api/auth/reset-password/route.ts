import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { pool } from '@/lib/db';
import { AUTH } from '@/lib/constants';
import { validatePasswordComplexity, hashToken, revokeAllSessions } from '@/lib/auth';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rl = await rateLimit('reset_password:' + ip, 60 * 60 * 1000, 10);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const { token, newPassword } = await request.json();
  if (!token || !newPassword) return Response.json({ error: 'Invalid request' }, { status: 400 });
  if (typeof token !== 'string' || typeof newPassword !== 'string') return Response.json({ error: 'Invalid request' }, { status: 400 });
  // Validate token format (64-char hex string from crypto.randomBytes(32))
  if (!/^[a-f0-9]{64}$/.test(token)) return Response.json({ error: 'Invalid or expired reset token' }, { status: 400 });
  const pwError = validatePasswordComplexity(newPassword);
  if (pwError) return Response.json({ error: pwError }, { status: 400 });

  try {
    const tokenHash = hashToken(token);
    const result = await pool.query(
      'SELECT user_id, email FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW()',
      [tokenHash]
    );
    if (!result.rows.length) {
      await pool.query('DELETE FROM password_reset_tokens WHERE token = $1', [tokenHash]);
      return Response.json({ error: 'Invalid or expired reset token' }, { status: 400 });
    }

    const entry = result.rows[0];
    const hash = await bcrypt.hash(newPassword, AUTH.bcryptRounds);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, entry.user_id]);
    await revokeAllSessions(pool, entry.user_id);
    await pool.query('DELETE FROM password_reset_tokens WHERE token = $1', [tokenHash]);

    return Response.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (e) {
    logger.error('auth.reset_password_failed', { error: (e as Error).message });
    return Response.json({ error: 'Failed to reset password' }, { status: 500 });
  }
}
