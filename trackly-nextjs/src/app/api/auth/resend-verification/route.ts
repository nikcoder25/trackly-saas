import crypto from 'crypto';
import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/email';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  const rl = await rateLimit('resend_verify:' + user.id, 15 * 60 * 1000, 3);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  try {
    const result = await pool.query('SELECT email, email_verified FROM users WHERE id = $1', [user.id]);
    if (!result.rows.length) return Response.json({ error: 'User not found' }, { status: 404 });
    if (result.rows[0].email_verified) return Response.json({ message: 'Email already verified' });

    const email = result.rows[0].email;
    const verifyToken = crypto.randomBytes(32).toString('hex');
    await pool.query('UPDATE users SET verify_token = $1 WHERE id = $2', [verifyToken, user.id]);

    const emailResult = await sendVerificationEmail(email, verifyToken);
    if (!emailResult.sent) {
      console.error('[Resend Verification] Email failed:', emailResult.reason, { userId: user.id, email });
      return Response.json({ error: 'Failed to send verification email. Please try again later.' }, { status: 500 });
    }

    return Response.json({ message: 'Verification email sent.' });
  } catch (e) {
    console.error('[Resend Verification] Error:', (e as Error).message);
    return Response.json({ error: 'Failed to resend verification' }, { status: 500 });
  }
}
