import crypto from 'crypto';
import { pool, ensureColumns } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/email';
import { AUTH } from '@/lib/constants';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  try {
    await ensureColumns();
    const rl = await rateLimit('resend_verify:' + user.id, 15 * 60 * 1000, 3);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

    const result = await pool.query('SELECT email, email_verified FROM users WHERE id = $1', [user.id]);
    if (!result.rows.length) return Response.json({ error: 'User not found' }, { status: 404 });
    if (result.rows[0].email_verified) return Response.json({ message: 'Email already verified' });

    const email = result.rows[0].email;
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyTokenHash = crypto.createHash('sha256').update(verifyToken).digest('hex');
    const verifyTokenExpires = new Date(Date.now() + AUTH.emailVerificationExpiry);
    await pool.query(
      'UPDATE users SET verify_token = $1, verify_token_expires = $2, verify_token_hashed = TRUE WHERE id = $3',
      [verifyTokenHash, verifyTokenExpires, user.id]
    );

    let emailResult;
    try {
      emailResult = await sendVerificationEmail(email, verifyToken);
    } catch (emailErr) {
      logger.error('auth.resend_verification.send_threw', {
        user_id: user.id,
        error: (emailErr as Error)?.message || String(emailErr),
      });
      return Response.json({ error: 'Failed to send verification email. Please try again later.' }, { status: 500 });
    }
    if (!emailResult.sent) {
      logger.error('auth.resend_verification.send_failed', {
        user_id: user.id,
        reason: emailResult.reason,
      });
      return Response.json({ error: 'Failed to send verification email. Please try again later.' }, { status: 500 });
    }

    return Response.json({ message: 'Verification email sent.' });
  } catch (e) {
    logger.error('auth.resend_verification.unhandled', {
      user_id: user.id,
      error: (e as Error)?.message || String(e),
    });
    return Response.json({ error: 'Failed to resend verification. Please try again later.' }, { status: 500 });
  }
}
