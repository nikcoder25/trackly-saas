import bcrypt from 'bcryptjs';
import { pool, auditLog } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';

export async function DELETE(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  const { password } = await request.json();
  if (!password) return Response.json({ error: 'Password required to delete account' }, { status: 400 });

  try {
    const result = await pool.query('SELECT password_hash, role FROM users WHERE id = $1', [user.id]);
    if (!result.rows.length) return Response.json({ error: 'User not found' }, { status: 404 });
    const ok = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!ok) return Response.json({ error: 'Incorrect password' }, { status: 400 });

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    auditLog(user.id, 'delete_account', 'user', user.id, { email: user.email }, ip);
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    return Response.json({ message: 'Account deleted' });
  } catch {
    return Response.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
