import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  // Rate limit team invites before the "user exists?" probe so attackers
  // can't use this endpoint to enumerate registered email addresses.
  const rl = await checkUserIpRateLimit('team_invite', user.id, getClientIp(request), {
    user: { max: 20, windowMs: 60 * 60 * 1000 },
    ip: { max: 50, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const { email, role } = await request.json();
  if (!email || typeof email !== 'string') return Response.json({ error: 'Email required' }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return Response.json({ error: 'Invalid email format' }, { status: 400 });
  const validRoles = ['viewer', 'editor'];
  const safeRole = validRoles.includes(role) ? role : 'viewer';

  try {
    const memberResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (!memberResult.rows.length) return Response.json({ error: 'User not found. They must register first.' }, { status: 404 });
    const memberId = memberResult.rows[0].id;
    if (memberId === user.id) return Response.json({ error: 'Cannot add yourself' }, { status: 400 });

    await pool.query(
      `INSERT INTO team_members (owner_id, member_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (owner_id, member_id) DO UPDATE SET role = $3`,
      [user.id, memberId, safeRole]
    );
    return Response.json({ success: true, message: `${email} added as ${safeRole}` });
  } catch (e) {
    return Response.json({ error: 'Failed to invite member' }, { status: 500 });
  }
}
