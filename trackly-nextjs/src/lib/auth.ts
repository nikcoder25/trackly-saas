/**
 * Auth utilities for Next.js - JWT verification, cookie handling
 */
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { AUTH } from './constants';

// Hash opaque bearer tokens (refresh, password-reset) before storing them at
// rest so a DB read-only breach can't be replayed. The plaintext token is
// still returned to the legitimate caller via cookie/JSON; only the sha256
// digest lives in Postgres.
export const hashToken = (t: string): string =>
  crypto.createHash('sha256').update(String(t)).digest('hex');

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  if (process.env.NODE_ENV === 'production' && secret.length < 32) {
    throw new Error('[Auth] JWT_SECRET must be at least 32 characters in production');
  }
  return secret;
}

export interface JWTPayload {
  id: string;
  email: string;
  iat?: number;
  exp?: number;
}

export function signAccessToken(payload: { id: string; email: string; role?: string; plan?: string }): string {
  return jwt.sign(payload, getSecret(), { expiresIn: '15m', algorithm: 'HS256' });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, getSecret(), { algorithms: ['HS256'] }) as JWTPayload;
  } catch {
    return null;
  }
}

export function createTokenCookieHeaders(accessToken: string, refreshToken: string): Array<string> {
  const isProduction = process.env.NODE_ENV === 'production';
  const secure = isProduction ? '; Secure' : '';
  return [
    `livesov_token=${accessToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(AUTH.accessTokenMaxAge / 1000)}${secure}`,
    `livesov_refresh=${refreshToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(AUTH.refreshTokenMaxAge / 1000)}${secure}`,
  ];
}

export function createClearCookieHeaders(): Array<string> {
  const isProduction = process.env.NODE_ENV === 'production';
  const secure = isProduction ? '; Secure' : '';
  return [
    `livesov_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`,
    `livesov_refresh=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`,
  ];
}

/**
 * Build a Response with proper multiple Set-Cookie headers.
 * Using Headers.append() ensures each Set-Cookie is sent separately.
 */
export function jsonWithCookies(data: unknown, cookies: string[], status = 200): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  for (const cookie of cookies) {
    headers.append('Set-Cookie', cookie);
  }
  return new Response(JSON.stringify(data), { status, headers });
}

/**
 * Extract token from request (Authorization header or cookie)
 */
export function getTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  // Parse cookies from Cookie header
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/livesov_token=([^;]+)/);
  return match ? match[1] : null;
}

/**
 * Verify auth from a Request object - for use in API Route Handlers
 */
export function verifyRequestAuth(request: Request): JWTPayload | null {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Verify auth and require email verification for protected routes.
 * Returns the user payload if authenticated and verified, or a Response error.
 */
export async function requireVerifiedAuth(request: Request, pool: { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }): Promise<JWTPayload | Response> {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });

  const result = await pool.query('SELECT email_verified FROM users WHERE id = $1', [user.id]);
  if (!result.rows.length) return Response.json({ error: 'User not found' }, { status: 401 });
  if (!result.rows[0].email_verified) {
    return Response.json({ error: 'Email verification required. Please verify your email before accessing this resource.' }, { status: 403 });
  }

  return user;
}

/**
 * Per-device session support. Each login inserts a row in user_sessions keyed
 * by the sha256 hash of the refresh token, so multiple devices can hold valid
 * sessions at the same time instead of overwriting a single column.
 */

type PoolLike = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
};

export interface SessionContext {
  userAgent?: string | null;
  ip?: string | null;
}

export function sessionContextFromRequest(request: Request): SessionContext {
  const ua = request.headers.get('user-agent') || '';
  const xff = request.headers.get('x-forwarded-for') || '';
  return {
    userAgent: ua ? ua.slice(0, 500) : null,
    ip: xff ? xff.split(',')[0].trim() : null,
  };
}

function newSessionId(): string {
  return Date.now().toString(36) + crypto.randomBytes(8).toString('hex');
}

export function getRefreshTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/livesov_refresh=([^;]+)/);
  return match ? match[1] : null;
}

/**
 * Create a session row and return the plaintext refresh token to place in the
 * livesov_refresh cookie. Caller is responsible for issuing the access token
 * and setting cookies.
 */
export async function issueSession(
  pool: PoolLike,
  userId: string,
  ctx: SessionContext = {}
): Promise<string> {
  const refreshToken = crypto.randomBytes(40).toString('hex');
  await pool.query(
    `INSERT INTO user_sessions (id, user_id, refresh_token_hash, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [newSessionId(), userId, hashToken(refreshToken), ctx.userAgent || null, ctx.ip || null]
  );
  return refreshToken;
}

/**
 * Atomically rotate the refresh token for the session identified by oldToken.
 * Returns the matched user row plus a freshly issued refresh token, or null if
 * the token doesn't correspond to an active session.
 */
export async function rotateSession(
  pool: PoolLike & { connect?: () => Promise<unknown> },
  oldToken: string,
  ctx: SessionContext = {}
): Promise<{ userId: string; refreshToken: string } | null> {
  const oldHash = hashToken(oldToken);
  const newToken = crypto.randomBytes(40).toString('hex');
  const result = await pool.query(
    `UPDATE user_sessions
        SET refresh_token_hash = $1,
            last_used_at = NOW(),
            user_agent = COALESCE($2, user_agent),
            ip = COALESCE($3, ip)
      WHERE refresh_token_hash = $4
      RETURNING user_id`,
    [hashToken(newToken), ctx.userAgent || null, ctx.ip || null, oldHash]
  );
  if (!result.rows.length) return null;
  return { userId: result.rows[0].user_id as string, refreshToken: newToken };
}

/** Revoke a single session by its current refresh token (logout on one device). */
export async function revokeSessionByToken(pool: PoolLike, refreshToken: string): Promise<void> {
  await pool.query(
    'DELETE FROM user_sessions WHERE refresh_token_hash = $1',
    [hashToken(refreshToken)]
  );
}

/** Revoke every session for a user (password change, password reset, etc.). */
export async function revokeAllSessions(pool: PoolLike, userId: string): Promise<void> {
  await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
}

/**
 * Validate password complexity.
 * Requires: min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character.
 */
export function validatePasswordComplexity(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password.length > 128) return 'Password must be 128 characters or less';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character';
  return null;
}
