import { NextRequest } from 'next/server';
import { pool, auditLog } from '@/lib/db';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rl = rateLimit('verify_email:' + ip, 60 * 60 * 1000, 20);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const token = request.nextUrl.searchParams.get('token');
  if (!token) return Response.json({ error: 'Verification token required' }, { status: 400 });

  try {
    const result = await pool.query('SELECT id, email FROM users WHERE verify_token = $1', [token]);
    if (!result.rows.length) return Response.json({ error: 'Invalid or expired verification token' }, { status: 400 });

    await pool.query('UPDATE users SET email_verified = TRUE, verify_token = NULL WHERE id = $1', [result.rows[0].id]);
    auditLog(result.rows[0].id, 'email_verified', 'user', result.rows[0].id, {}, ip);

    // Redirect to login with success message
    return Response.redirect(new URL('/login?verified=1', request.url));
  } catch {
    return Response.json({ error: 'Verification failed' }, { status: 500 });
  }
}
