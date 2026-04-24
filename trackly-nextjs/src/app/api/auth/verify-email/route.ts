import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { pool, auditLog, ensureColumns } from '@/lib/db';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { TRIAL_DURATION_MS } from '@/lib/constants';

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rl = await rateLimit('verify_email:' + ip, 60 * 60 * 1000, 20);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const token = request.nextUrl.searchParams.get('token');
  if (!token) return Response.json({ error: 'Verification token required' }, { status: 400 });

  try {
    await ensureColumns();

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await pool.query(
      `SELECT id, email, plan, trial_ends_at FROM users
       WHERE verify_token = $1
         AND verify_token_hashed = TRUE
         AND (verify_token_expires IS NULL OR verify_token_expires > NOW())`,
      [tokenHash]
    );
    if (!result.rows.length) return Response.json({ error: 'Invalid or expired verification token' }, { status: 400 });

    const row = result.rows[0];
    // Promote the short 24h unverified trial to the full 7-day trial once the
    // email is proven. Only applies to users still on the 'trial' plan.
    const extendedTrialEnd = new Date(Date.now() + TRIAL_DURATION_MS);
    if (row.plan === 'trial') {
      await pool.query(
        'UPDATE users SET email_verified = TRUE, verify_token = NULL, verify_token_expires = NULL, trial_ends_at = $1 WHERE id = $2',
        [extendedTrialEnd, row.id]
      );
    } else {
      await pool.query(
        'UPDATE users SET email_verified = TRUE, verify_token = NULL, verify_token_expires = NULL WHERE id = $1',
        [row.id]
      );
    }
    auditLog(row.id, 'email_verified', 'user', row.id, { trialExtended: row.plan === 'trial' }, ip);

    // Redirect to login with success message
    return Response.redirect(`${APP_URL}/login?verified=1`);
  } catch {
    return Response.json({ error: 'Verification failed' }, { status: 500 });
  }
}
