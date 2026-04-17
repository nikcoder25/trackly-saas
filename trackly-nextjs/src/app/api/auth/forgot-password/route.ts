import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { pool } from '@/lib/db';
import { AUTH } from '@/lib/constants';
import { sendPasswordResetEmail } from '@/lib/email';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { hashToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rl = await rateLimit('forgot_password:' + ip, 60 * 60 * 1000, 5);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const body = await request.json();
  const { email, website } = body;

  const successMsg = 'If an account exists with that email, a reset link has been sent. Check your inbox and spam folder.';

  // Honeypot: silently reject if filled
  if (website) return Response.json({ message: successMsg });
  if (!email) return Response.json({ error: 'Email is required' }, { status: 400 });

  try {
    // Add consistent delay to prevent timing-based account enumeration
    const startTime = Date.now();
    const minResponseTime = 200; // minimum ms before responding

    const result = await pool.query('SELECT id, email, email_verified FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (!result.rows.length) {
      const elapsed = Date.now() - startTime;
      if (elapsed < minResponseTime) await new Promise(r => setTimeout(r, minResponseTime - elapsed));
      return Response.json({ message: successMsg });
    }

    const user = result.rows[0];

    if (!user.email_verified) {
      const elapsed = Date.now() - startTime;
      if (elapsed < minResponseTime) await new Promise(r => setTimeout(r, minResponseTime - elapsed));
      return Response.json({ message: successMsg });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + AUTH.passwordResetExpiry);

    // Store only the sha256 digest at rest. The plaintext token is emailed
    // directly and compared via hash on redemption.
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);
    await pool.query(
      'INSERT INTO password_reset_tokens (token, user_id, email, expires_at) VALUES ($1, $2, $3, $4)',
      [tokenHash, user.id, user.email, expiresAt]
    );

    const emailResult = await sendPasswordResetEmail(user.email, token);
    if (!emailResult.sent) {
      await pool.query('DELETE FROM password_reset_tokens WHERE token = $1', [tokenHash]);
      return Response.json({ error: 'Unable to send reset email. Please try again later.' }, { status: 500 });
    }

    return Response.json({ message: successMsg });
  } catch (e) {
    console.error('[ForgotPassword]', (e as Error).message);
    return Response.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
