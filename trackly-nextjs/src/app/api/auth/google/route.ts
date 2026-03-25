import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool, auditLog } from '@/lib/db';
import { uid, safeUser } from '@/lib/helpers';
import { signAccessToken, createTokenCookieHeaders, jsonWithCookies } from '@/lib/auth';
import { API_ENDPOINTS, AUTH } from '@/lib/constants';

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
  const { credential, access_token } = await request.json();

  if (!credential && !access_token) return Response.json({ error: 'Google credential required' }, { status: 400 });
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return Response.json({ error: 'Google Sign-In is not configured' }, { status: 400 });

  try {
    let googleId: string, email: string, name: string, avatarUrl: string | null;

    if (access_token) {
      const resp = await fetch(API_ENDPOINTS.google.userinfo, {
        headers: { Authorization: 'Bearer ' + access_token },
      });
      if (!resp.ok) return Response.json({ error: 'Invalid access token' }, { status: 400 });
      const userInfo = await resp.json();
      if (!userInfo.email_verified) return Response.json({ error: 'Google email is not verified' }, { status: 400 });
      googleId = userInfo.sub;
      email = userInfo.email?.toLowerCase();
      name = userInfo.name || email?.split('@')[0];
      avatarUrl = userInfo.picture || null;
    } else {
      const resp = await fetch(`${API_ENDPOINTS.google.tokeninfo}?id_token=${encodeURIComponent(credential)}`);
      if (!resp.ok) return Response.json({ error: 'Invalid token' }, { status: 400 });
      const payload = await resp.json();
      if (payload.aud !== clientId) return Response.json({ error: 'Token audience mismatch' }, { status: 400 });
      googleId = payload.sub;
      email = payload.email?.toLowerCase();
      name = payload.name || email?.split('@')[0];
      avatarUrl = payload.picture || null;
    }

    if (!email) return Response.json({ error: 'Google account has no email' }, { status: 400 });

    const selectCols = 'id, email, username, name, plan, role, api_keys, settings, email_verified, created_at, google_id, avatar_url';

    // Case 1: Existing user with this google_id
    let user = (await pool.query(`SELECT ${selectCols} FROM users WHERE google_id = $1`, [googleId])).rows[0];

    if (!user) {
      // Case 2: Existing account with same email — link Google
      user = (await pool.query(`SELECT ${selectCols} FROM users WHERE LOWER(email) = $1`, [email])).rows[0];

      if (user) {
        await pool.query('UPDATE users SET google_id = $1, avatar_url = COALESCE(avatar_url, $2), email_verified = TRUE WHERE id = $3', [googleId, avatarUrl, user.id]);
        user.google_id = googleId;
        user.avatar_url = user.avatar_url || avatarUrl;
        user.email_verified = true;
      } else {
        // Case 3: Brand new user
        const id = uid();
        const autoUsername = await generateUsername(name || email);
        const dummyHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), AUTH.bcryptRounds);
        await pool.query(
          `INSERT INTO users (id, email, username, name, password_hash, plan, google_id, avatar_url, email_verified)
           VALUES ($1, $2, $3, $4, $5, 'free', $6, $7, TRUE)`,
          [id, email, autoUsername, name, dummyHash, googleId, avatarUrl]
        );
        user = (await pool.query(`SELECT ${selectCols} FROM users WHERE id = $1`, [id])).rows[0];
        auditLog(id, 'register', 'user', id, { email, method: 'google' }, ip);
      }
    }

    const accessToken = signAccessToken({ id: user.id, email: user.email });
    const newRefreshToken = crypto.randomBytes(40).toString('hex');
    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [newRefreshToken, user.id]);

    auditLog(user.id, 'login', 'user', user.id, { method: 'google' }, ip);

    const cookieHeaders = createTokenCookieHeaders(accessToken, newRefreshToken);
    return jsonWithCookies({ token: accessToken, refreshToken: newRefreshToken, user: safeUser(user) }, cookieHeaders);
  } catch (e) {
    console.error('[GoogleAuth]', (e as Error).message);
    return Response.json({ error: 'Google authentication failed' }, { status: 400 });
  }
}
