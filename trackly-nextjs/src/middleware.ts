import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const authPaths = ['/login', '/signup', '/reset-password'];

// Cookie names must stay in sync with src/lib/auth.ts. Duplicated here because
// the Edge runtime can't import from node-targeted modules (crypto, pg) that
// auth.ts transitively pulls in.
const PROD = process.env.NODE_ENV === 'production';
const ACCESS_COOKIE = PROD ? '__Host-livesov_token' : 'livesov_token';
const LEGACY_ACCESS_COOKIE = 'livesov_token';
const CSRF_COOKIE = PROD ? '__Host-livesov_csrf' : 'livesov_csrf';

// State-changing methods that need CSRF enforcement.
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Path prefixes where CSRF enforcement does not apply:
//  * Webhooks authenticate via HMAC (dodopayments, resend) - they legitimately
//    come from a third-party origin with no user cookies in play.
//  * Cron endpoints authenticate via Authorization: Bearer CRON_SECRET - no
//    cookies are trusted, so cross-site requests can't leverage them anyway.
//  * Auth login/register/google seed the session, so there's no prior CSRF
//    cookie to double-submit. We still enforce the Origin/Referer check for
//    these in `isSameOrigin` below, which catches classic login CSRF.
const CSRF_EXEMPT_PREFIXES = [
  '/api/webhooks/',
  '/api/payments/webhooks/',
  '/api/cron',
  // Self-Serve Connect public endpoints (serve + heartbeat) are called
  // cross-origin from the customer's own site by the /c.js snippet. They're
  // anonymous, cookieless, and keyed only by a public site id, so the classic
  // cookie-riding CSRF threat doesn't apply — and the same-origin check would
  // otherwise block the legitimate cross-origin heartbeat POST.
  '/api/connect/',
];

// Bootstrap / anonymous endpoints: no CSRF token yet (user isn't logged in),
// but we still require Origin to match an allowed origin so an attacker site
// can't POST on behalf of a victim (login CSRF fixation, contact form abuse).
const CSRF_BOOTSTRAP_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/google',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/refresh',
  '/api/contact',
  '/api/newsletter',
  '/api/free-check',
  // Free public tools: submitted by signed-out visitors who have no CSRF
  // cookie yet (it's only issued at login). These endpoints are anonymous
  // and non-credentialed, so the Origin check is the meaningful protection
  // - same posture as /api/contact and /api/free-check above.
  '/api/geo-audit',
  '/api/tools/llms-txt-generator',
  '/api/tools/ai-crawler-checker',
  '/api/tools/chatgpt-mention-checker',
  '/api/tools/citation-finder',
  '/api/tools/competitor-finder',
]);

function getAllowedOrigins(request: NextRequest): Set<string> {
  const origins = new Set<string>();
  // The request's own origin is always allowed - this covers same-origin
  // fetches regardless of what's configured in env.
  origins.add(new URL(request.url).origin);
  const appUrl = process.env.APP_URL;
  if (appUrl) {
    try { origins.add(new URL(appUrl).origin); } catch { /* ignore malformed */ }
  }
  const allowed = process.env.ALLOWED_ORIGINS;
  if (allowed) {
    for (const raw of allowed.split(',')) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      try { origins.add(new URL(trimmed).origin); } catch { /* ignore malformed */ }
    }
  }
  return origins;
}

function isSameOrigin(request: NextRequest): boolean {
  const allowed = getAllowedOrigins(request);
  const origin = request.headers.get('origin');
  if (origin) return allowed.has(origin);
  // Some browsers omit Origin on same-origin requests - fall back to Referer.
  const referer = request.headers.get('referer');
  if (referer) {
    try { return allowed.has(new URL(referer).origin); } catch { return false; }
  }
  // No Origin and no Referer on a state-changing request is a red flag. In
  // production we refuse; in dev we allow so curl/Postman still work.
  return !PROD;
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Server-to-server cron dispatcher (src/app/api/cron/route.ts) POSTs to
// /api/brands/[id]/run with `x-cron-secret: $CRON_SECRET`. Node-side fetch
// emits no Origin/Referer header, so the same-origin check below would 403
// every scheduled run. The shared secret is itself proof the caller is
// trusted infra, not a victim's browser, so it makes both the Origin check
// and the double-submit CSRF token check moot - the same reasoning that
// already exempts `Authorization: Bearer` callers from the token check.
function hasValidCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const header = request.headers.get('x-cron-secret');
  if (!header) return false;
  return timingSafeEqualStrings(header, cronSecret);
}

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

// ── CSP nonce ────────────────────────────────────────────────────────────────
//
// A per-request nonce lets us drop `'unsafe-inline'` from script-src while
// still allowing our own inline scripts (Google Analytics init, JSON-LD). The
// nonce is exposed to server components via the `x-nonce` request header and
// appears in the response CSP header so the browser trusts only scripts we
// tagged ourselves.

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://accounts.google.com https://apis.google.com https://www.googletagmanager.com https://www.google-analytics.com https://www.googleadservices.com https://browser.sentry-cdn.com https://challenges.cloudflare.com https://www.clarity.ms https://*.clarity.ms`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: https://lh3.googleusercontent.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://www.google.com",
    "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com https://*.sentry.io https://www.google-analytics.com https://analytics.google.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://www.google.com https://challenges.cloudflare.com https://*.clarity.ms https://c.bing.com",
    "worker-src 'self' blob:",
    "frame-src https://accounts.google.com https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
  ].join('; ');
}

function applyCspHeaders(response: NextResponse, nonce: string, csp: string, requestId?: string) {
  response.headers.set('x-nonce', nonce);
  response.headers.set('Content-Security-Policy', csp);
  if (requestId) response.headers.set(REQUEST_ID_HEADER, requestId);
}

// ── Request-id propagation ───────────────────────────────────────────────────
//
// Every request gets a UUID stamped onto `x-request-id` (unless the caller
// already set one - load balancers and tracing frontends often do). Server
// components and route handlers read it via the request headers; the
// structured logger merges it into every record under `requestId` so a
// single page load can be reconstructed across logs, Sentry events, and
// downstream provider calls. Echoed back on the response so clients (and
// our own front-end fetchers) can reference it in support tickets.
const REQUEST_ID_HEADER = 'x-request-id';

function ensureRequestId(headers: Headers): string {
  const incoming = headers.get(REQUEST_ID_HEADER);
  if (incoming && incoming.length > 0 && incoming.length <= 128) return incoming;
  // crypto.randomUUID() is available in the Edge runtime; fall back to
  // a hex-encoded random buffer if the runtime ever loses it.
  try {
    return crypto.randomUUID();
  } catch {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let hex = '';
    for (const b of bytes) hex += b.toString(16).padStart(2, '0');
    return hex;
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  // Forward the nonce to server components via a request header so pages can
  // stamp it onto their own inline scripts (JSON-LD, analytics init, etc.).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  // Stamp / preserve a request id so route handlers and the structured
  // logger can correlate every record from this request.
  const requestId = ensureRequestId(requestHeaders);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  // API rate limiting. Key by IP + a short hash of the session cookie when
  // present so a flood of anonymous requests that all resolve to "unknown"
  // doesn't share the same bucket across every signed-out visitor.
  if (pathname.startsWith('/api/')) {
    const ip = getClientIp(request);
    const cookieToken =
      request.cookies.get(ACCESS_COOKIE)?.value ||
      request.cookies.get(LEGACY_ACCESS_COOKIE)?.value;
    const sessionTag = cookieToken ? cookieToken.slice(-16) : 'anon';
    const isAuth = pathname.startsWith('/api/auth/');
    const key = `${isAuth ? 'auth' : 'api'}:${ip}:${sessionTag}`;
    const { allowed, retryAfter } = checkRateLimit(key, isAuth);

    if (!allowed) {
      const limited = NextResponse.json(
        { error: 'Too many requests. Please try again later.', retryAfter },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfter) },
        }
      );
      applyCspHeaders(limited, nonce, csp, requestId);
      return limited;
    }

    // CSRF enforcement for state-changing methods. Applied in the edge
    // middleware so every /api/ route gets it by default - route authors
    // can't forget to add it. Exempt paths are listed above.
    if (UNSAFE_METHODS.has(request.method)) {
      const exempt =
        CSRF_EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p)) ||
        hasValidCronSecret(request);
      if (!exempt) {
        // Step 1: Origin must match. This alone blocks cross-site form POSTs
        // even in browsers that ignore SameSite (old Safari, embedded webviews).
        if (!isSameOrigin(request)) {
          const forbidden = NextResponse.json(
            { error: 'Cross-origin request blocked' },
            { status: 403 },
          );
          applyCspHeaders(forbidden, nonce, csp, requestId);
          return forbidden;
        }
        // Step 2: double-submit CSRF token check for any route that already
        // has a session. Bootstrap auth routes (no cookie yet) skip this.
        const isBootstrap = CSRF_BOOTSTRAP_PATHS.has(pathname);
        if (!isBootstrap) {
          const csrfCookie = request.cookies.get(CSRF_COOKIE)?.value;
          const csrfHeader = request.headers.get('x-csrf-token');
          const hasBearer = (request.headers.get('authorization') || '').startsWith('Bearer ');
          // Bearer-authenticated requests (server-to-server, automation) are
          // immune to CSRF because they don't ride on the victim's cookie.
          if (!hasBearer) {
            if (!csrfCookie || !csrfHeader || !timingSafeEqualStrings(csrfCookie, csrfHeader)) {
              const forbidden = NextResponse.json(
                { error: 'Invalid or missing CSRF token' },
                { status: 403 },
              );
              applyCspHeaders(forbidden, nonce, csp, requestId);
              return forbidden;
            }
          }
        }
      }
    }

    const next = NextResponse.next({ request: { headers: requestHeaders } });
    applyCspHeaders(next, nonce, csp, requestId);
    return next;
  }

  // Verify the session cookie once per request. `hasValidToken` is derived
  // from a real HMAC signature check + alg enforcement + exp check, so a
  // forged/tampered JWT can never cause the middleware to advertise a
  // logged-in UX.
  const token =
    request.cookies.get(ACCESS_COOKIE)?.value ||
    request.cookies.get(LEGACY_ACCESS_COOKIE)?.value;
  const payload = token ? await verifyTokenSignature(token) : null;
  const hasValidToken = !!payload;

  // Admin backend: requires a verified signature with role=admin. `plan`
  // is a billing concept and must not grant admin access.
  if (pathname.startsWith('/admin-backend')) {
    if (!hasValidToken) {
      const redirect = NextResponse.redirect(new URL('/login', request.url));
      applyCspHeaders(redirect, nonce, csp, requestId);
      return redirect;
    }
    if (payload?.role !== 'admin') {
      const redirect = NextResponse.redirect(new URL('/dashboard', request.url));
      applyCspHeaders(redirect, nonce, csp, requestId);
      return redirect;
    }
    const next = NextResponse.next({ request: { headers: requestHeaders } });
    applyCspHeaders(next, nonce, csp, requestId);
    return next;
  }

  // If user is on auth page but already logged in, redirect to dashboard
  if (authPaths.some((p) => pathname.startsWith(p)) && hasValidToken) {
    const redirect = NextResponse.redirect(new URL('/dashboard', request.url));
    applyCspHeaders(redirect, nonce, csp, requestId);
    return redirect;
  }

  // If user is on any dashboard or onboarding page but not logged in, redirect to login
  if ((pathname.startsWith('/dashboard') || pathname.startsWith('/onboarding')) && !hasValidToken) {
    const loginUrl = new URL('/login', request.url);
    const search = request.nextUrl.search;
    loginUrl.searchParams.set('redirect', pathname + (search || ''));
    const redirect = NextResponse.redirect(loginUrl);
    applyCspHeaders(redirect, nonce, csp, requestId);
    return redirect;
  }

  const next = NextResponse.next({ request: { headers: requestHeaders } });
  applyCspHeaders(next, nonce, csp, requestId);
  return next;
}

export const config = {
  // Match every route that returns HTML or JSON so CSP applies everywhere,
  // while excluding static assets where the browser wouldn't evaluate scripts
  // and the nonce would be meaningless.
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|site.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|otf|css|js|map)).*)',
    },
  ],
};
