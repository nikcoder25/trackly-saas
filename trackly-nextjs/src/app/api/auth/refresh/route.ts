import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { safeConnect, ensureColumns } from '@/lib/db';
import { signAccessToken, createTokenCookieHeaders, jsonWithCookies, hashToken } from '@/lib/auth';
import { getEffectivePlan } from '@/lib/constants';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const cookieHeader = request.headers.get('cookie') || '';
  const refreshMatch = cookieHeader.match(/livesov_refresh=([^;]+)/);
  const refreshToken = refreshMatch?.[1];

  if (!refreshToken) return Response.json({ error: 'Refresh token required' }, { status: 400 });

  // Rate limit token refresh to prevent storms (5 per minute per token fingerprint)
  const tokenHint = refreshToken.slice(-12);
  const { allowed, retryAfter } = await rateLimit(`refresh:${tokenHint}`, 60 * 1000, 5);
  if (!allowed) return rateLimitResponse(retryAfter);

  try {
    await ensureColumns();
    // Atomic token rotation: SELECT FOR UPDATE prevents race conditions
    // where two concurrent refresh requests could both succeed with the same old token
    const client = await safeConnect();
    let result;
    try {
      await client.query('BEGIN');
      const lockResult = await client.query(
        'SELECT id, email, role, plan, trial_ends_at FROM users WHERE refresh_token = $1 FOR UPDATE',
        [hashToken(refreshToken)]
      );
      if (!lockResult.rows.length) {
        await client.query('ROLLBACK');
        return Response.json({ error: 'Invalid refresh token' }, { status: 401 });
      }
      const newRefreshToken_inner = crypto.randomBytes(40).toString('hex');
      await client.query(
        'UPDATE users SET refresh_token = $1 WHERE id = $2',
        [hashToken(newRefreshToken_inner), lockResult.rows[0].id]
      );
      await client.query('COMMIT');
      result = { rows: lockResult.rows, newRefreshToken: newRefreshToken_inner };
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }
    const newRefreshToken = result.newRefreshToken;
    if (!result.rows.length) return Response.json({ error: 'Invalid refresh token' }, { status: 401 });

    const user = result.rows[0];
    const effectivePlan = getEffectivePlan(user.plan, user.trial_ends_at);
    const accessToken = signAccessToken({ id: user.id, email: user.email, role: user.role || undefined, plan: effectivePlan });

    const cookieHeaders = createTokenCookieHeaders(accessToken, newRefreshToken);
    return jsonWithCookies({ token: accessToken }, cookieHeaders);
  } catch (e) {
    console.error('[Refresh]', (e as Error).message);
    return Response.json({ error: 'Token refresh failed' }, { status: 500 });
  }
}
