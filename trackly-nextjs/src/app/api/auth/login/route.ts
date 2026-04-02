import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool, auditLog } from '@/lib/db';
import { safeUser } from '@/lib/helpers';
import { signAccessToken, createTokenCookieHeaders, jsonWithCookies } from '@/lib/auth';
import { verifyTOTP } from '@/lib/totp';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

const DUMMY_HASH = '$2a$12$000000000000000000000uGiltNn9J1kOXqSqMpNQHCbSZkHm5mZS';

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const body = await request.json();
  const { email, password, totpCode } = body;

  if (!email || !password) return Response.json({ error: 'Email/username and password required' }, { status: 400 });

  // IP-based rate limit to prevent brute-force across multiple accounts
  const ipRl = await rateLimit('login_ip:' + ip, 15 * 60 * 1000, 20);
  if (!ipRl.allowed) return rateLimitResponse(ipRl.retryAfter);

  // Per-account rate limit
  const accountKey = 'login_account:' + email.toString().toLowerCase().trim();
  const rl = await rateLimit(accountKey, 15 * 60 * 1000, 10);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  // 2FA rate limit
  if (totpCode) {
    const twoFaRl = await rateLimit('2fa:' + ip, 15 * 60 * 1000, 5);
    if (!twoFaRl.allowed) return rateLimitResponse(twoFaRl.retryAfter);
  }

  try {
    const isEmail = email.includes('@');
    const loginCols = 'id, email, username, name, plan, role, password_hash, api_keys, settings, email_verified, created_at, google_id, avatar_url';
    const result = isEmail
      ? await pool.query(`SELECT ${loginCols} FROM users WHERE LOWER(email) = LOWER($1)`, [email])
      : await pool.query(`SELECT ${loginCols} FROM users WHERE LOWER(username) = LOWER($1)`, [email]);

    const user = result.rows[0];

    // Check account lockout (5 failed attempts = 15 min lock)
    if (user) {
      const lockoutThreshold = 5;
      const lockoutMs = 15 * 60 * 1000;
      const failedAttempts = (user.settings as Record<string, unknown>)?.failed_login_attempts as number || 0;
      const lastFailedAt = (user.settings as Record<string, unknown>)?.last_failed_login as string;
      if (failedAttempts >= lockoutThreshold && lastFailedAt) {
        const lockedUntil = new Date(lastFailedAt).getTime() + lockoutMs;
        if (Date.now() < lockedUntil) {
          const retryAfter = Math.ceil((lockedUntil - Date.now()) / 1000);
          auditLog(user.id, 'login_locked', 'user', user.id, { failedAttempts, ip }, ip);
          return Response.json({
            error: 'Invalid email or password',
            locked: true,
            retryAfter,
          }, { status: 429 });
        }
      }
    }

    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) {
      // Track failed login attempt
      if (user) {
        const currentFails = (user.settings as Record<string, unknown>)?.failed_login_attempts as number || 0;
        await pool.query(
          `UPDATE users SET settings = settings || $1::jsonb WHERE id = $2`,
          [JSON.stringify({ failed_login_attempts: currentFails + 1, last_failed_login: new Date().toISOString() }), user.id]
        );
        auditLog(user.id, 'login_failed', 'user', user.id, { attempt: currentFails + 1, ip }, ip);
      }
      return Response.json({ error: 'Invalid email or password' }, { status: 400 });
    }

    // Check 2FA
    const totpSecret = user.settings?.totp_secret;
    if (totpSecret) {
      if (!totpCode) {
        return Response.json({ requires2FA: true, message: 'Enter your 2FA code' }, { status: 202 });
      }
      const backupCodes = user.settings?.totp_backup_codes || [];
      const isValidTotp = verifyTOTP(totpSecret, totpCode);
      const backupIndex = backupCodes.indexOf(totpCode);

      if (!isValidTotp && backupIndex === -1) {
        return Response.json({ error: 'Invalid 2FA code' }, { status: 400 });
      }

      // Consume backup code atomically
      if (backupIndex !== -1) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const freshUser = await client.query('SELECT settings FROM users WHERE id = $1 FOR UPDATE', [user.id]);
          if (!freshUser.rows.length) {
            await client.query('ROLLBACK');
            return Response.json({ error: 'User not found' }, { status: 400 });
          }
          const freshCodes = freshUser.rows[0]?.settings?.totp_backup_codes || [];
          const freshIndex = freshCodes.indexOf(totpCode);
          if (freshIndex === -1) {
            await client.query('ROLLBACK');
            return Response.json({ error: 'Backup code already used' }, { status: 400 });
          }
          const updatedCodes = [...freshCodes];
          updatedCodes.splice(freshIndex, 1);
          await client.query(
            `UPDATE users SET settings = settings || $1::jsonb WHERE id = $2`,
            [JSON.stringify({ totp_backup_codes: updatedCodes }), user.id]
          );
          await client.query('COMMIT');
        } catch (txErr) {
          await client.query('ROLLBACK').catch(() => {});
          throw txErr;
        } finally {
          client.release();
        }
      }
    }

    const accessToken = signAccessToken({ id: user.id, email: user.email });
    const refreshToken = crypto.randomBytes(40).toString('hex');

    // Reset failed login attempts on successful login
    await pool.query(
      `UPDATE users SET refresh_token = $1, settings = settings || '{"failed_login_attempts":0,"last_failed_login":null}'::jsonb WHERE id = $2`,
      [refreshToken, user.id]
    );

    auditLog(user.id, 'login', 'user', user.id, {}, ip);

    const cookieHeaders = createTokenCookieHeaders(accessToken, refreshToken);
    return jsonWithCookies({ token: accessToken, user: safeUser(user) }, cookieHeaders);
  } catch (e) {
    console.error('[Login]', (e as Error).message);
    return Response.json({ error: 'Login failed' }, { status: 500 });
  }
}
