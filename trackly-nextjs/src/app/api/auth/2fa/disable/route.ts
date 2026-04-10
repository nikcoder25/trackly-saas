import bcrypt from 'bcryptjs';
import { pool, auditLog } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';

export async function POST(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid request body' }, { status: 400 }); }
  const { password } = body;
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
    console.error('[2FA Disable]', (e as Error).message);
    return Response.json({ error: 'Failed to disable 2FA' }, { status: 500 });
  }
}
