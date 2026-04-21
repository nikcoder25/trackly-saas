import { NextRequest } from 'next/server';
import { pool, ensureColumns } from '@/lib/db';
import {
  signAccessToken,
  createTokenCookieHeaders,
  jsonWithCookies,
  rotateSession,
  sessionContextFromRequest,
  getRefreshTokenFromRequest,
} from '@/lib/auth';
import { getEffectivePlan } from '@/lib/constants';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const refreshToken = getRefreshTokenFromRequest(request);
  if (!refreshToken) return Response.json({ error: 'Refresh token required' }, { status: 400 });

  // Rate limit token refresh to prevent storms (5 per minute per token fingerprint)
  const tokenHint = refreshToken.slice(-12);
  const { allowed, retryAfter } = await rateLimit(`refresh:${tokenHint}`, 60 * 1000, 5);
  if (!allowed) return rateLimitResponse(retryAfter);

  try {
    await ensureColumns();

    // Rotate the refresh token in place. The UPDATE..RETURNING is atomic, so
    // two concurrent refreshes with the same token can't both succeed (only
    // one UPDATE will match the old hash; the other sees zero rows).
    const rotated = await rotateSession(pool, refreshToken, sessionContextFromRequest(request));
    if (!rotated) return Response.json({ error: 'Invalid refresh token' }, { status: 401 });

    const userResult = await pool.query(
      'SELECT id, email, role, plan, trial_ends_at FROM users WHERE id = $1',
      [rotated.userId]
    );
    if (!userResult.rows.length) return Response.json({ error: 'Invalid refresh token' }, { status: 401 });
    const user = userResult.rows[0];
    const effectivePlan = getEffectivePlan(user.plan, user.trial_ends_at);
    const accessToken = signAccessToken({ id: user.id, email: user.email, role: user.role || undefined, plan: effectivePlan });

    const cookieHeaders = createTokenCookieHeaders(accessToken, rotated.refreshToken);
    return jsonWithCookies({ token: accessToken }, cookieHeaders);
  } catch (e) {
    logger.error('auth.refresh_failed', { error: (e as Error).message });
    return Response.json({ error: 'Token refresh failed' }, { status: 500 });
  }
}
