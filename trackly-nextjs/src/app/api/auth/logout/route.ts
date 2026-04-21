import { pool } from '@/lib/db';
import {
  createClearCookieHeaders,
  jsonWithCookies,
  revokeSessionByToken,
  getRefreshTokenFromRequest,
} from '@/lib/auth';

export async function POST(request: Request) {
  const refreshToken = getRefreshTokenFromRequest(request);
  if (refreshToken) {
    try {
      await revokeSessionByToken(pool, refreshToken);
    } catch (e) {
      console.warn('[Logout] Failed to revoke session:', (e as Error).message);
    }
  }

  const cookieHeaders = createClearCookieHeaders();
  return jsonWithCookies({ message: 'Logged out' }, cookieHeaders);
}
