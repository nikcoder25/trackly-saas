import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';

async function requireAdmin(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return null;
  const result = await pool.query('SELECT role FROM users WHERE id = $1', [user.id]);
  if (result.rows[0]?.role !== 'admin') return null;
  return user;
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'Admin access required' }, { status: 403 });

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 500);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0;
  const search = url.searchParams.get('search') || '';

  let query = 'SELECT id, email, username, name, plan, role, email_verified, created_at FROM users';
  const values: unknown[] = [];
  let idx = 1;

  if (search) {
    query += ` WHERE email ILIKE $${idx} OR name ILIKE $${idx} OR username ILIKE $${idx}`;
    values.push(`%${search}%`);
    idx++;
  }

  query += ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
  values.push(limit, offset);

  const result = await pool.query(query, values);
  const countResult = await pool.query('SELECT COUNT(*)::int AS total FROM users');
  return Response.json({ users: result.rows, total: countResult.rows[0].total });
}
