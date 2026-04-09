import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const authPaths = ['/login', '/signup', '/reset-password'];

// ── In-memory rate limiting ──────────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60 * 1000; // 1 minute
const GENERAL_LIMIT = 100;   // 100 req/min for general API routes
const AUTH_LIMIT = 10;        // 10 req/min for auth routes

// Cleanup expired entries every 5 minutes
let lastCleanup = Date.now();

function cleanupExpired() {
  const now = Date.now();
  if (now - lastCleanup < 5 * 60 * 1000) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}

function checkRateLimit(ip: string, isAuth: boolean): { allowed: boolean; retryAfter: number } {
  cleanupExpired();

  const limit = isAuth ? AUTH_LIMIT : GENERAL_LIMIT;
  const key = `${isAuth ? 'auth' : 'api'}:${ip}`;
  const now = Date.now();

  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }

  entry.count++;
  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  return { allowed: true, retryAfter: 0 };
}

// ── Auth helpers ─────────────────────────────────────────────────────────────

async function verifyTokenSignature(token: string): Promise<Record<string, unknown> | null> {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const signature = Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const data = encoder.encode(`${parts[0]}.${parts[1]}`);
    const valid = await crypto.subtle.verify('HMAC', key, signature, data);
    if (!valid) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 < Date.now() : true;
  } catch {
    return true;
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API rate limiting
  if (pathname.startsWith('/api/')) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const isAuth = pathname.startsWith('/api/auth/');
    const { allowed, retryAfter } = checkRateLimit(ip, isAuth);

    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.', retryAfter },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfter) },
        }
      );
    }

    return NextResponse.next();
  }

  const token = request.cookies.get('livesov_token')?.value;
  const hasValidToken = token && !isTokenExpired(token);

  // Admin backend: requires valid token + verified JWT signature with admin role
  if (pathname.startsWith('/admin-backend')) {
    if (!hasValidToken) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    const payload = await verifyTokenSignature(token);
    if (!payload || (payload.role !== 'admin' && payload.plan !== 'owner')) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  // If user is on auth page but already logged in, redirect to dashboard
  if (authPaths.some((p) => pathname.startsWith(p)) && hasValidToken) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // If user is on any dashboard or onboarding page but not logged in, redirect to login
  if ((pathname.startsWith('/dashboard') || pathname.startsWith('/onboarding')) && !hasValidToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/admin-backend/:path*', '/dashboard/:path*', '/onboarding', '/login', '/signup', '/reset-password'],
};
