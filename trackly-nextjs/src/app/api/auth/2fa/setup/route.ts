import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { generateSecret, getOTPAuthURL } from '@/lib/totp';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  const rl = await rateLimit('2fa_setup:' + user.id, 15 * 60 * 1000, 10);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  try {
    const userResult = await pool.query('SELECT email, settings FROM users WHERE id = $1', [user.id]);
    if (!userResult.rows.length) return Response.json({ error: 'User not found' }, { status: 404 });
    const u = userResult.rows[0];
    if (u.settings?.totp_secret && u.settings?.totp_enabled) {
      return Response.json({ error: '2FA is already enabled. Disable it first to reconfigure.' }, { status: 400 });
    }
    const secret = generateSecret();
    const otpauthUrl = getOTPAuthURL(secret, u.email);
    await pool.query(
      `UPDATE users SET settings = settings || $1::jsonb WHERE id = $2`,
      [JSON.stringify({ totp_secret_pending: secret }), user.id]
    );
    return Response.json({ secret, otpauthUrl });
  } catch (e) {
    console.error('[2FA Setup]', (e as Error).message);
    return Response.json({ error: 'Failed to set up 2FA' }, { status: 500 });
  }
}
