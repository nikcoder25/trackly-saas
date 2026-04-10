import bcrypt from 'bcryptjs';
import { pool, auditLog } from '@/lib/db';
import { verifyRequestAuth, validatePasswordComplexity } from '@/lib/auth';
import { AUTH } from '@/lib/constants';

export async function POST(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid request body' }, { status: 400 }); }
  const { currentPassword, newPassword } = body;
  if (!currentPassword || !newPassword) return Response.json({ error: 'Current and new password required' }, { status: 400 });
  if (typeof newPassword !== 'string') return Response.json({ error: 'Invalid input' }, { status: 400 });
  const pwError = validatePasswordComplexity(newPassword);
  if (pwError) return Response.json({ error: pwError }, { status: 400 });

  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    if (!result.rows.length) return Response.json({ error: 'User not found' }, { status: 404 });
    const ok = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!ok) return Response.json({ error: 'Current password is incorrect' }, { status: 400 });
    const hash = await bcrypt.hash(newPassword, AUTH.bcryptRounds);
    // Invalidate refresh token to force re-login on all sessions.
    // If a token_version column exists, incrementing it would also invalidate
    // existing access tokens. Setting refresh_token = NULL ensures the user
    // must re-authenticate to obtain new tokens.
    await pool.query('UPDATE users SET password_hash = $1, refresh_token = NULL WHERE id = $2', [hash, user.id]);
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    auditLog(user.id, 'change_password', 'user', user.id, {}, ip);
    return Response.json({ message: 'Password updated successfully' });
  } catch {
    return Response.json({ error: 'Failed to change password' }, { status: 500 });
  }
}
