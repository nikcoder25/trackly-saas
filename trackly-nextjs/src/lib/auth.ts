/**
 * Auth utilities for Next.js - JWT verification, cookie handling
 */
import jwt from 'jsonwebtoken';
import { AUTH } from './constants';

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') console.error('[FATAL] JWT_SECRET is not set.');
    return '';
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
