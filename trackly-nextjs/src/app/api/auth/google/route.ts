import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool, auditLog, ensureColumns } from '@/lib/db';
import { uid, safeUser, normaliseEmail } from '@/lib/helpers';
import { signAccessToken, createTokenCookieHeaders, jsonWithCookies, issueSession, sessionContextFromRequest } from '@/lib/auth';
import { API_ENDPOINTS, AUTH, TRIAL_DURATION_MS, getEffectivePlan } from '@/lib/constants';
import { runSignupAbuseChecks, logSuspiciousSignupPattern } from '@/lib/anti-abuse';
import { logger } from '@/lib/logger';

async function generateUsername(nameOrEmail: string): Promise<string> {
  let base = (nameOrEmail || '').trim().toLowerCase();
  if (base.includes('@')) base = base.split('@')[0];
  base = base.replace(/\s+/g, '.').replace(/[^a-z0-9_.-]/g, '').replace(/\.{2,}/g, '.').replace(/^[._-]+|[._-]+$/g, '');
  if (base.length < 3) base = 'user' + base;
  if (base.length > 25) base = base.substring(0, 25);
  const exists = await pool.query('SELECT id FROM users WHERE LOWER(username) = $1', [base]);
  if (!exists.rows.length) return base;
  for (let i = 0; i < 5; i++) {
    const suffix = Math.floor(Math.random() * 900) + 100;
    const candidate = (base.substring(0, 25) + suffix).substring(0, 30);
    const dup = await pool.query('SELECT id FROM users WHERE LOWER(username) = $1', [candidate]);
    if (!dup.rows.length) return candidate;
  }
  return (base.substring(0, 20) + crypto.randomBytes(3).toString('hex')).substring(0, 30);
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';

  let credential: string | undefined, access_token: string | undefined;
  try {
    const body = await request.json();
    credential = body.credential;
    access_token = body.access_token;
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!credential && !access_token) return Response.json({ error: 'Google credential required' }, { status: 400 });
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return Response.json({ error: 'Google Sign-In is not configured' }, { status: 400 });

  try {
    await ensureColumns();
    let googleId: string, email: string, name: string, avatarUrl: string | null;

    if (access_token) {
      // Validate access token by calling Google's userinfo API server-side
      const resp = await fetch(API_ENDPOINTS.google.userinfo, {
        headers: { Authorization: 'Bearer ' + access_token },
      });
      if (!resp.ok) return Response.json({ error: 'Invalid access token' }, { status: 400 });
      const userInfo = await resp.json();
      // Verify the token has required fields (scope validation)
      if (!userInfo.sub) return Response.json({ error: 'Invalid Google token: missing user ID' }, { status: 400 });
      if (!userInfo.email) return Response.json({ error: 'Invalid Google token: missing email scope' }, { status: 400 });
      if (!userInfo.email_verified) return Response.json({ error: 'Google email is not verified' }, { status: 400 });
      googleId = userInfo.sub;
      email = userInfo.email?.toLowerCase();
      name = userInfo.name || email?.split('@')[0];
      avatarUrl = userInfo.picture || null;
    } else {
      // Validate ID token via Google's tokeninfo API
      const resp = await fetch(`${API_ENDPOINTS.google.tokeninfo}?id_token=${encodeURIComponent(credential!)}`);
      if (!resp.ok) return Response.json({ error: 'Invalid token' }, { status: 400 });
      const payload = await resp.json();
      // Verify audience matches our client ID (prevents token reuse attacks)
      if (payload.aud !== clientId) return Response.json({ error: 'Token audience mismatch' }, { status: 400 });
      // Verify issuer is Google
      if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
        return Response.json({ error: 'Invalid token issuer' }, { status: 400 });
      }
      // Verify token hasn't expired
      if (payload.exp && parseInt(payload.exp, 10) < Math.floor(Date.now() / 1000)) {
        return Response.json({ error: 'Token has expired' }, { status: 400 });
      }
      if (!payload.sub) return Response.json({ error: 'Invalid token: missing user ID' }, { status: 400 });
      googleId = payload.sub;
      email = payload.email?.toLowerCase();
      name = payload.name || email?.split('@')[0];
      avatarUrl = payload.picture || null;
    }

    if (!email) return Response.json({ error: 'Google account has no email' }, { status: 400 });

    const selectCols = 'id, email, username, name, plan, trial_ends_at, role, api_keys, settings, email_verified, created_at, google_id, avatar_url';

    // Case 1: Existing user with this google_id
    let user = (await pool.query(`SELECT ${selectCols} FROM users WHERE google_id = $1`, [googleId])).rows[0];

    if (!user) {
      // Case 2: Existing account with same email - link Google
      user = (await pool.query(`SELECT ${selectCols} FROM users WHERE LOWER(email) = $1`, [email])).rows[0];

      if (user) {
        // Existing account with same email but no google_id - do NOT auto-link.
        // User must log in with password first and link Google from account settings.
        return Response.json(
          { error: 'An account with this email already exists. Please log in with your password and link Google from Account Settings.' },
          { status: 409 }
        );
      } else {
        // Case 3: Brand new user
        // Anti-abuse checks only apply on new Google signups. Existing Google
        // users skip these since they're already established accounts.
        const abuse = await runSignupAbuseChecks({ email, ip, name });
        if (!abuse.allowed) {
          return Response.json({ error: abuse.reason }, { status: 400 });
        }

        const id = uid();
        const autoUsername = await generateUsername(name || email);
        const dummyHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), AUTH.bcryptRounds);
        // Google emails are pre-verified so they get the full 7-day trial.
        const trialEndsAt = new Date(Date.now() + TRIAL_DURATION_MS);
        const emailNorm = normaliseEmail(email);
        await pool.query(
          `INSERT INTO users (id, email, username, name, password_hash, plan, trial_ends_at, google_id, avatar_url, email_verified, email_normalized, signup_ip)
           VALUES ($1, $2, $3, $4, $5, 'trial', $6, $7, $8, TRUE, $9, $10)`,
          [id, email, autoUsername, name, dummyHash, trialEndsAt, googleId, avatarUrl, emailNorm, ip]
        );
        user = (await pool.query(`SELECT ${selectCols} FROM users WHERE id = $1`, [id])).rows[0];
        auditLog(id, 'register', 'user', id, { email, method: 'google' }, ip);
        logSuspiciousSignupPattern(ip, email).catch(() => {});
      }
    }

    const effectivePlan = getEffectivePlan(user.plan, user.trial_ends_at);
    const accessToken = signAccessToken({ id: user.id, email: user.email, role: user.role || undefined, plan: effectivePlan });
    const newRefreshToken = await issueSession(pool, user.id, sessionContextFromRequest(request));

    auditLog(user.id, 'login', 'user', user.id, { method: 'google' }, ip);

    const cookieHeaders = createTokenCookieHeaders(accessToken, newRefreshToken);
    return jsonWithCookies({ token: accessToken, user: safeUser(user) }, cookieHeaders);
  } catch (e) {
    logger.error('auth.google_failed', { error: (e as Error).message });
    return Response.json({ error: 'Google authentication failed' }, { status: 400 });
  }
}
