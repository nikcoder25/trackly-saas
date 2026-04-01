/**
 * Auth utilities for Next.js - JWT verification, cookie handling
 */
import jwt from 'jsonwebtoken';
import { AUTH } from './constants';

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
}

export interface JWTPayload {
  id: string;
  email: string;
  iat?: number;
  exp?: number;
}

export function signAccessToken(payload: { id: string; email: string }): string {
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
    `livesov_token=${accessToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(AUTH.accessTokenMaxAge / 1000)}${secure}`,
    `livesov_refresh=${refreshToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(AUTH.refreshTokenMaxAge / 1000)}${secure}`,
  ];
}

export function createClearCookieHeaders(): Array<string> {
  const isProduction = process.env.NODE_ENV === 'production';
  const secure = isProduction ? '; Secure' : '';
  return [
    `livesov_token=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`,
    `livesov_refresh=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`,
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
