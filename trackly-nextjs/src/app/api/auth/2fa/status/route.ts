import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export async function GET(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  const rl = await checkUserIpRateLimit('twofa_status', user.id, getClientIp(request), {
    user: { max: 100, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  try {
    const userResult = await pool.query('SELECT settings FROM users WHERE id = $1', [user.id]);
    if (!userResult.rows.length) return Response.json({ error: 'User not found' }, { status: 404 });
    const enabled = !!(userResult.rows[0].settings?.totp_enabled);
    const backupCodesRemaining = (userResult.rows[0].settings?.totp_backup_codes || []).length;
    return Response.json({ enabled, backupCodesRemaining });
  } catch {
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
