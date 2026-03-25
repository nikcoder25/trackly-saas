import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { pool } from '@/lib/db';
import { signAccessToken, createTokenCookieHeaders, jsonWithCookies } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const cookieHeader = request.headers.get('cookie') || '';
  const refreshMatch = cookieHeader.match(/livesov_refresh=([^;]+)/);
  const refreshToken = body.refreshToken || refreshMatch?.[1];

  if (!refreshToken) return Response.json({ error: 'Refresh token required' }, { status: 400 });

  try {
    const newRefreshToken = crypto.randomBytes(40).toString('hex');
    const result = await pool.query(
      'UPDATE users SET refresh_token = $1 WHERE refresh_token = $2 RETURNING id, email',
      [newRefreshToken, refreshToken]
    );
    if (!result.rows.length) return Response.json({ error: 'Invalid refresh token' }, { status: 401 });

    const user = result.rows[0];
    const accessToken = signAccessToken({ id: user.id, email: user.email });

    const cookieHeaders = createTokenCookieHeaders(accessToken, newRefreshToken);
    return jsonWithCookies({ token: accessToken, refreshToken: newRefreshToken }, cookieHeaders);
  } catch (e) {
    console.error('[Refresh]', (e as Error).message);
    return Response.json({ error: 'Token refresh failed' }, { status: 500 });
  }
}
