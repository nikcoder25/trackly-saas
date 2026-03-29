import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

async function requireAdmin(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return null;
  const result = await pool.query('SELECT role FROM users WHERE id = $1', [user.id]);
  if (result.rows[0]?.role !== 'admin') return null;
  return user;
}

export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rl = rateLimit('admin:' + ip, 15 * 60 * 1000, 30);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'Not found' }, { status: 404 });

  const url = new URL(request.url);
  const rawLimit = parseInt(url.searchParams.get('limit') || '100', 10);
  const limit = Math.max(1, Math.min(!isNaN(rawLimit) ? rawLimit : 100, 500));
  const rawOffset = parseInt(url.searchParams.get('offset') || '0', 10);
  const offset = !isNaN(rawOffset) ? Math.max(0, rawOffset) : 0;
  const search = (url.searchParams.get('search') || '').slice(0, 100);

  try {
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
  } catch (e) {
    console.error('[Admin Users]', (e as Error).message);
    return Response.json({ error: 'Failed to load users' }, { status: 500 });
  }
}
