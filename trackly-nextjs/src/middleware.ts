import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const authPaths = ['/login', '/signup', '/reset-password'];

// ── In-memory rate limiting ──────────────────────────────────────────────────
//
// Edge middleware cannot reach Postgres/Redis directly, so we keep a
// per-instance counter here. For a more authoritative backstop, route handlers
// still call the Postgres-backed limiter in src/lib/rate-limit.ts. The
// middleware limit is a first layer - on DigitalOcean App Platform with N
// instances the effective cap is roughly N * LIMIT.

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

function checkRateLimit(key: string, isAuth: boolean): { allowed: boolean; retryAfter: number } {
  cleanupExpired();

  const limit = isAuth ? AUTH_LIMIT : GENERAL_LIMIT;
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

// Resolve a client IP from trusted platform headers. DigitalOcean App Platform
// sets `do-connecting-ip`; other hops may set `cf-connecting-ip` (if we ever
// put Cloudflare in front). `x-forwarded-for` is client-supplied unless a
// trusted proxy rewrites it, so we treat it as a last resort.
function getClientIp(request: NextRequest): string {
  const doIp = request.headers.get('do-connecting-ip');
  if (doIp) return doIp.trim();
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();
  const xri = request.headers.get('x-real-ip');
  if (xri) return xri.trim();
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || 'unknown';
  return 'unknown';
}

// ── Base64url helpers (Edge-safe) ────────────────────────────────────────────

function base64urlToString(b64url: string): string {
  let s = b64url.replace(/-/g, '+').replace(/_/g, '/');
  // Pad to a multiple of 4 - JWT header/payload/signature lengths are often
  // not multiples of 4 and atob() without padding throws on some inputs.
  while (s.length % 4) s += '=';
  return atob(s);
}

function base64urlToBytes(b64url: string): Uint8Array {
  const str = base64urlToString(b64url);
  const buf = new ArrayBuffer(str.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

// ── Auth helpers ─────────────────────────────────────────────────────────────

interface VerifiedPayload {
  id?: string;
  email?: string;
  role?: string;
  plan?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

async function verifyTokenSignature(token: string): Promise<VerifiedPayload | null> {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // Enforce the expected algorithm so we never accept a token with a
    // different alg (e.g. `none` or RS256) that our HMAC check wouldn't
    // actually validate.
    let header: { alg?: string; typ?: string };
    try {
      header = JSON.parse(base64urlToString(parts[0])) as { alg?: string; typ?: string };
    } catch {
      return null;
    }
    if (!header || header.alg !== 'HS256') return null;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret) as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const signature = base64urlToBytes(parts[2]);
    const data = encoder.encode(`${parts[0]}.${parts[1]}`);
    const valid = await crypto.subtle.verify('HMAC', key, signature as BufferSource, data as BufferSource);
    if (!valid) return null;

    const payload = JSON.parse(base64urlToString(parts[1])) as VerifiedPayload;
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API rate limiting. Key by IP + a short hash of the session cookie when
  // present so a flood of anonymous requests that all resolve to "unknown"
  // doesn't share the same bucket across every signed-out visitor.
  if (pathname.startsWith('/api/')) {
    const ip = getClientIp(request);
    const cookieToken = request.cookies.get('livesov_token')?.value;
    const sessionTag = cookieToken ? cookieToken.slice(-16) : 'anon';
    const isAuth = pathname.startsWith('/api/auth/');
    const key = `${isAuth ? 'auth' : 'api'}:${ip}:${sessionTag}`;
    const { allowed, retryAfter } = checkRateLimit(key, isAuth);

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

  // Verify the session cookie once per request. `hasValidToken` is derived
  // from a real HMAC signature check + alg enforcement + exp check, so a
  // forged/tampered JWT can never cause the middleware to advertise a
  // logged-in UX.
  const token = request.cookies.get('livesov_token')?.value;
  const payload = token ? await verifyTokenSignature(token) : null;
  const hasValidToken = !!payload;

  // Admin backend: requires a verified signature with role=admin. `plan`
  // is a billing concept and must not grant admin access.
  if (pathname.startsWith('/admin-backend')) {
    if (!hasValidToken) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (payload?.role !== 'admin') {
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
    const search = request.nextUrl.search;
    loginUrl.searchParams.set('redirect', pathname + (search || ''));
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/admin-backend/:path*', '/dashboard/:path*', '/onboarding', '/login', '/signup', '/reset-password'],
};
