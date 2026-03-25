import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';

export async function GET(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

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
