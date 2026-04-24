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

// Cookie names. In production we prefix with `__Host-` so the browser enforces
// Secure + Path=/ + no Domain attribute (origin-scoped). On plain-HTTP dev
// (`npm run dev`) browsers reject `__Host-` cookies, so we keep the legacy
// names there. Read paths (`getTokenFromRequest`, middleware) accept both so
// an in-flight deploy doesn't invalidate sessions mid-request.
const PROD = process.env.NODE_ENV === 'production';
export const COOKIE_NAMES = {
  access: PROD ? '__Host-livesov_token' : 'livesov_token',
  refresh: PROD ? '__Host-livesov_refresh' : 'livesov_refresh',
  csrf: PROD ? '__Host-livesov_csrf' : 'livesov_csrf',
} as const;

// Legacy cookie names so we can sweep them on logout and accept them on read
// during the transition window. Safe to remove after one refresh cycle
// (accessTokenMaxAge + refreshTokenMaxAge).
const LEGACY_COOKIE_NAMES = {
  access: 'livesov_token',
  refresh: 'livesov_refresh',
} as const;

function baseFlags(maxAgeSec: number): string {
  // HttpOnly + SameSite=Lax + Path=/ on every session cookie. `Secure` is set
  // in production so browsers refuse to send the cookie over plain HTTP. We
  // stop short of SameSite=Strict because the app opens the dashboard from
  // email-verification and billing-return top-level navigations, which Strict
  // would strip.
  const secure = PROD ? '; Secure' : '';
  return `HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${secure}`;
}

/**
 * Issue a non-HttpOnly CSRF token cookie. Paired with a request header of the
 * same value this implements the double-submit cookie pattern. The token is
 * opaque and rotated on every session issue/refresh.
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function createTokenCookieHeaders(
  accessToken: string,
  refreshToken: string,
  csrfToken: string = generateCsrfToken(),
): Array<string> {
  const accessMax = Math.floor(AUTH.accessTokenMaxAge / 1000);
  const refreshMax = Math.floor(AUTH.refreshTokenMaxAge / 1000);
  const secure = PROD ? '; Secure' : '';
  return [
    `${COOKIE_NAMES.access}=${accessToken}; ${baseFlags(accessMax)}`,
    `${COOKIE_NAMES.refresh}=${refreshToken}; ${baseFlags(refreshMax)}`,
    // CSRF cookie is deliberately NOT HttpOnly so first-party JS can mirror
    // it into the X-CSRF-Token header on state-changing fetches. SameSite=Lax
    // keeps it from riding along on cross-site navigations.
    `${COOKIE_NAMES.csrf}=${csrfToken}; SameSite=Lax; Path=/; Max-Age=${refreshMax}${secure}`,
  ];
}

export function createClearCookieHeaders(): Array<string> {
  const secure = PROD ? '; Secure' : '';
  const expire = `HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
  // Clear the current-generation cookies and the legacy ones so no stale
  // session cookie survives a logout after a cookie-name migration.
  return [
    `${COOKIE_NAMES.access}=; ${expire}`,
    `${COOKIE_NAMES.refresh}=; ${expire}`,
    `${COOKIE_NAMES.csrf}=; SameSite=Lax; Path=/; Max-Age=0${secure}`,
    `${LEGACY_COOKIE_NAMES.access}=; ${expire}`,
    `${LEGACY_COOKIE_NAMES.refresh}=; ${expire}`,
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
function readCookieValue(cookieHeader: string, name: string): string | null {
  // Escape for regex use in case the cookie name ever contains regex metachars
  // (e.g. the `__Host-` prefix is safe, but future renames could introduce them).
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
  return match ? match[1] : null;
}

export function getTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieHeader = request.headers.get('cookie') || '';
  return (
    readCookieValue(cookieHeader, COOKIE_NAMES.access) ||
    readCookieValue(cookieHeader, LEGACY_COOKIE_NAMES.access)
  );
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

/**
 * Drop this user's session rows that are past the refresh-token TTL. Called
 * opportunistically on every login/refresh so the table stays bounded without
 * a dedicated cron. Scoped to user_id so the delete is cheap.
 */
async function pruneExpiredSessionsForUser(pool: PoolLike, userId: string): Promise<void> {
  const maxAgeSec = Math.floor(AUTH.refreshTokenMaxAge / 1000);
  try {
    await pool.query(
      `DELETE FROM user_sessions
        WHERE user_id = $1
          AND last_used_at < NOW() - make_interval(secs => $2)`,
      [userId, maxAgeSec]
    );
  } catch {
    // Cleanup is best-effort; never fail the auth call because of it.
  }
}

export function getRefreshTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie') || '';
  return (
    readCookieValue(cookieHeader, COOKIE_NAMES.refresh) ||
    readCookieValue(cookieHeader, LEGACY_COOKIE_NAMES.refresh)
  );
}

export function getCsrfCookieFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie') || '';
  return readCookieValue(cookieHeader, COOKIE_NAMES.csrf);
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
  await pruneExpiredSessionsForUser(pool, userId);
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
  const userId = result.rows[0].user_id as string;
  await pruneExpiredSessionsForUser(pool, userId);
  return { userId, refreshToken: newToken };
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
