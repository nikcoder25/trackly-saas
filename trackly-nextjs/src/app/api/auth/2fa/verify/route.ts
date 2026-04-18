import { pool, auditLog } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { verifyTOTP, generateBackupCodes, hashBackupCode } from '@/lib/totp';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  const rl = await rateLimit('2fa_verify:' + user.id, 15 * 60 * 1000, 5);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const { code } = await request.json();
  if (!code) return Response.json({ error: '2FA code required' }, { status: 400 });

  try {
    const userResult = await pool.query('SELECT settings FROM users WHERE id = $1', [user.id]);
    if (!userResult.rows.length) return Response.json({ error: 'User not found' }, { status: 404 });
    const pendingSecret = userResult.rows[0].settings?.totp_secret_pending;
    if (!pendingSecret) return Response.json({ error: 'No pending 2FA setup. Call /2fa/setup first.' }, { status: 400 });

    if (!verifyTOTP(pendingSecret, code)) {
      return Response.json({ error: 'Invalid code. Check your authenticator app and try again.' }, { status: 400 });
    }

    const backupCodes = generateBackupCodes();
    // Hash backup codes before storing in DB; return plaintext to user once
    const hashedCodes = backupCodes.map(c => hashBackupCode(c));
    await pool.query(
      `UPDATE users SET settings = settings || $1::jsonb WHERE id = $2`,
      [JSON.stringify({
        totp_secret: pendingSecret,
        totp_enabled: true,
        totp_secret_pending: null,
        totp_backup_codes: hashedCodes,
      }), user.id]
    );

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    auditLog(user.id, '2fa_enabled', 'user', user.id, {}, ip);
    // Return plaintext codes to user - this is the only time they see them
    return Response.json({ enabled: true, backupCodes, message: 'Two-factor authentication enabled. Save your backup codes!' });
  } catch (e) {
    logger.error('auth.2fa_verify_failed', { error: (e as Error).message });
    return Response.json({ error: 'Failed to verify 2FA' }, { status: 500 });
  }
}
