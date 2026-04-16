import crypto from 'crypto';
import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/email';
import { AUTH } from '@/lib/constants';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  try {
    const rl = await rateLimit('resend_verify:' + user.id, 15 * 60 * 1000, 3);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

    const result = await pool.query('SELECT email, email_verified FROM users WHERE id = $1', [user.id]);
    if (!result.rows.length) return Response.json({ error: 'User not found' }, { status: 404 });
    if (result.rows[0].email_verified) return Response.json({ message: 'Email already verified' });

    const email = result.rows[0].email;
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyTokenExpires = new Date(Date.now() + AUTH.emailVerificationExpiry);
    await pool.query('UPDATE users SET verify_token = $1, verify_token_expires = $2 WHERE id = $3', [verifyToken, verifyTokenExpires, user.id]);

    let emailResult;
    try {
      emailResult = await sendVerificationEmail(email, verifyToken);
    } catch (emailErr) {
      console.error('[Resend Verification] sendVerificationEmail threw:', emailErr);
      return Response.json({ error: 'Failed to send verification email. Please try again later.' }, { status: 500 });
    }
    if (!emailResult.sent) {
      console.error('[Resend Verification] Email failed:', emailResult.reason);
      return Response.json({ error: 'Failed to send verification email. Please try again later.' }, { status: 500 });
    }

    return Response.json({ message: 'Verification email sent.' });
  } catch (e) {
    console.error('[Resend Verification] Unhandled error:', e);
    return Response.json({ error: 'Failed to resend verification. Please try again later.' }, { status: 500 });
  }
}
