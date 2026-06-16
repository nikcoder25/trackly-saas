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

  // Friendly UX: every outcome lands on the /email-verified page with a
  // status, never raw JSON in the browser. The page explains what happened
  // and links the user onward (dashboard / login / resend).
  const landing = (status: 'success' | 'expired' | 'error') =>
    Response.redirect(`${APP_URL}/email-verified?status=${status}`);

  const token = request.nextUrl.searchParams.get('token');
  if (!token) return landing('expired');

  try {
    await ensureColumns();

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    // NOTE: we intentionally do NOT filter on email_verified here, and we no
    // longer null the token on success (see below). That makes verification
    // idempotent - clicking the same link a second time still resolves to the
    // same user and shows success, instead of "Invalid or expired token".
    const result = await pool.query(
      `SELECT id, email, plan, trial_ends_at, email_verified FROM users
       WHERE verify_token = $1
         AND verify_token_hashed = TRUE
         AND (verify_token_expires IS NULL OR verify_token_expires > NOW())`,
      [tokenHash]
    );
    if (!result.rows.length) return landing('expired');

    const row = result.rows[0];

    // Already verified via an earlier click - idempotent no-op. Don't re-extend
    // the trial (that would let someone keep refreshing the link to stack
    // days); just confirm success.
    if (row.email_verified) return landing('success');

    // First successful verification. Promote the short 24h unverified trial to
    // the full 7-day trial once the email is proven (trial plan only). We keep
    // verify_token in place so a repeat click stays idempotent until it
    // naturally expires; a fresh resend overwrites it.
    const extendedTrialEnd = new Date(Date.now() + TRIAL_DURATION_MS);
    if (row.plan === 'trial') {
      await pool.query(
        'UPDATE users SET email_verified = TRUE, trial_ends_at = $1 WHERE id = $2',
        [extendedTrialEnd, row.id]
      );
    } else {
      await pool.query(
        'UPDATE users SET email_verified = TRUE WHERE id = $1',
        [row.id]
      );
    }
    auditLog(row.id, 'email_verified', 'user', row.id, { trialExtended: row.plan === 'trial' }, ip);

    return landing('success');
  } catch {
    return landing('error');
  }
}
