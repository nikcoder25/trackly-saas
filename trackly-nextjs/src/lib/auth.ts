/**
 * Auth utilities for Next.js - JWT verification, cookie handling
 */
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { AUTH } from './constants';

const JWT_SECRET = process.env.JWT_SECRET || '';

export interface JWTPayload {
  id: string;
  email: string;
  iat?: number;
  exp?: number;
}

export function signAccessToken(payload: { id: string; email: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m', algorithm: 'HS256' });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Get the current authenticated user from cookies or Authorization header.
 * For use in Server Components and API routes.
 */
export async function getAuthUser(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('livesov_token')?.value;
  if (!token) return null;
  return verifyToken(token);
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
