import { pool } from '@/lib/db';
import { verifyRequestAuth, createClearCookieHeaders, jsonWithCookies } from '@/lib/auth';

export async function POST(request: Request) {
  const user = verifyRequestAuth(request);
  if (user) {
    try {
      await pool.query('UPDATE users SET refresh_token = NULL WHERE id = $1', [user.id]);
    } catch (e) {
      console.warn('[Logout] Failed to clear refresh token:', (e as Error).message);
    }
  }

  const cookieHeaders = createClearCookieHeaders();
  return jsonWithCookies({ message: 'Logged out' }, cookieHeaders);
}
