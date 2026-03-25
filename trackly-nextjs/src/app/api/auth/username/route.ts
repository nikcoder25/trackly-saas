import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';

export async function PUT(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  const { username } = await request.json();
  const trimmed = username ? username.trim().toLowerCase() : null;

  if (trimmed) {
    if (trimmed.length < 3) return Response.json({ error: 'Username must be at least 3 characters' }, { status: 400 });
    if (trimmed.length > 30) return Response.json({ error: 'Username must be 30 characters or less' }, { status: 400 });
    if (!/^[a-z0-9_.-]+$/.test(trimmed)) return Response.json({ error: 'Username can only contain letters, numbers, dots, dashes, and underscores' }, { status: 400 });
    const dup = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2', [trimmed, user.id]);
    if (dup.rows.length) return Response.json({ error: 'Username already taken' }, { status: 400 });
  }

  try {
    await pool.query('UPDATE users SET username = $1 WHERE id = $2', [trimmed, user.id]);
    return Response.json({ username: trimmed, message: 'Username updated' });
  } catch {
    return Response.json({ error: 'Failed to update username' }, { status: 500 });
  }
}
