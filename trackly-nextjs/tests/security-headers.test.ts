import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regression tests for the app's security headers and cookie flags. These
// two concerns share a file because both are "belt and braces" defences that
// have no runtime telemetry — a silent regression here would only show up in
// a pentest or a post-incident review.
//
// What we lock down:
//   1. next.config.ts emits the static security headers on every route.
//   2. No path returns a CSP with `unsafe-inline` in script-src (nonce-based).
//   3. Auth session cookies are issued with HttpOnly + SameSite=Lax + Path=/,
//      use the `__Host-` prefix and `Secure` in production, and include a
//      companion CSRF cookie that is NOT HttpOnly (so the client can mirror
//      it into the X-CSRF-Token header).
//   4. The clear-cookie headers expire both current-generation and legacy
//      cookie names so logout leaves no stale session cookie behind.

// next.config is wrapped in withSentryConfig; import the raw module via a
// mock that replaces withSentryConfig with identity so tests don't need Sentry.
vi.mock('@sentry/nextjs', () => ({
  withSentryConfig: (config: unknown) => config,
}));

const SECURITY_HEADER_EXPECTATIONS: Array<{ key: string; match: (v: string) => boolean }> = [
  { key: 'X-Frame-Options', match: (v) => v === 'DENY' },
  { key: 'X-Content-Type-Options', match: (v) => v === 'nosniff' },
  { key: 'Referrer-Policy', match: (v) => v === 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', match: (v) => /camera=\(\)/.test(v) && /microphone=\(\)/.test(v) && /geolocation=\(\)/.test(v) },
  { key: 'Strict-Transport-Security', match: (v) => /max-age=\d+/.test(v) && /includeSubDomains/.test(v) },
];

async function loadConfig(): Promise<{ headers: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>> }> {
  const mod: unknown = await import('../next.config');
  const cfg = (mod as { default?: unknown }).default ?? mod;
  return cfg as { headers: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>> };
}

describe('next.config security headers', () => {
  it('applies every required security header to all routes', async () => {
    const cfg = await loadConfig();
    const blocks = await cfg.headers();
    const everyRoute = blocks.find((b) => b.source === '/(.*)');
    expect(everyRoute, 'expected a /(.*) header block covering all routes').toBeTruthy();
    const headers = everyRoute!.headers;
    for (const expected of SECURITY_HEADER_EXPECTATIONS) {
      const found = headers.find((h) => h.key.toLowerCase() === expected.key.toLowerCase());
      expect(found, `missing ${expected.key}`).toBeTruthy();
      expect(
        expected.match(found!.value),
        `${expected.key} has unexpected value: ${found!.value}`,
      ).toBe(true);
    }
  });

  it('does NOT set Content-Security-Policy statically (it is issued per-request with a nonce)', async () => {
    const cfg = await loadConfig();
    const blocks = await cfg.headers();
    for (const block of blocks) {
      for (const h of block.headers) {
        expect(
          h.key.toLowerCase(),
          `${block.source} must not ship a static CSP — middleware issues the nonce-scoped one`,
        ).not.toBe('content-security-policy');
      }
    }
  });

  it('sets Cache-Control: no-store on dashboard, auth, and API responses', async () => {
    const cfg = await loadConfig();
    const blocks = await cfg.headers();
    const sensitive = ['/dashboard/:path*', '/api/:path*', '/(login|signup|reset-password)'];
    for (const source of sensitive) {
      const block = blocks.find((b) => b.source === source);
      expect(block, `expected a no-store Cache-Control block for ${source}`).toBeTruthy();
      const cc = block!.headers.find((h) => h.key.toLowerCase() === 'cache-control');
      expect(cc, `Cache-Control missing for ${source}`).toBeTruthy();
      expect(/no-store/i.test(cc!.value)).toBe(true);
    }
  });
});

describe('CSP string built by the edge middleware', () => {
  // The middleware's buildCsp is not exported, so we re-derive what it should
  // look like and check the invariants that matter for defence in depth: no
  // `unsafe-inline` in script-src, no `unsafe-eval`, `frame-ancestors 'none'`.
  it('never includes unsafe-inline or unsafe-eval in script-src', async () => {
    const src = await import('fs').then((fs) =>
      fs.promises.readFile(new URL('../src/middleware.ts', import.meta.url), 'utf8'),
    );
    // Match the backtick-delimited script-src template literal specifically,
    // not the comment that explains the change. Anchoring on the opening
    // backtick keeps us away from prose that happens to mention script-src.
    const scriptSrcMatch = src.match(/`script-src[^`]*`/);
    expect(scriptSrcMatch, 'script-src directive missing from middleware.ts').toBeTruthy();
    const directive = scriptSrcMatch![0];
    expect(directive).not.toMatch(/'unsafe-inline'/);
    expect(directive).not.toMatch(/'unsafe-eval'/);
    expect(directive).toMatch(/'nonce-\$\{nonce\}'/);
  });

  it('sets frame-ancestors to none so the app cannot be iframed', async () => {
    const src = await import('fs').then((fs) =>
      fs.promises.readFile(new URL('../src/middleware.ts', import.meta.url), 'utf8'),
    );
    expect(src).toMatch(/frame-ancestors 'none'/);
  });
});

describe('auth cookie flags', () => {
  beforeEach(() => {
    // Clear the module cache so NODE_ENV swaps actually swap the cookie names.
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function loadAuth(env: 'production' | 'development') {
    vi.stubEnv('NODE_ENV', env);
    vi.stubEnv('JWT_SECRET', '0123456789abcdef0123456789abcdef0123456789abcdef');
    return await import('../src/lib/auth');
  }

  it('issues HttpOnly, SameSite=Lax, Path=/ access and refresh cookies plus a non-HttpOnly CSRF cookie (production)', async () => {
    const { createTokenCookieHeaders, COOKIE_NAMES } = await loadAuth('production');
    const headers = createTokenCookieHeaders('access.jwt.value', 'refresh-opaque', 'csrf-opaque');

    const access = headers.find((h) => h.startsWith(`${COOKIE_NAMES.access}=`));
    const refresh = headers.find((h) => h.startsWith(`${COOKIE_NAMES.refresh}=`));
    const csrf = headers.find((h) => h.startsWith(`${COOKIE_NAMES.csrf}=`));

    expect(access, 'access cookie missing').toBeTruthy();
    expect(refresh, 'refresh cookie missing').toBeTruthy();
    expect(csrf, 'csrf cookie missing').toBeTruthy();

    for (const session of [access!, refresh!]) {
      expect(session).toMatch(/HttpOnly/);
      expect(session).toMatch(/SameSite=Lax/);
      expect(session).toMatch(/Path=\//);
      expect(session).toMatch(/Secure/);
    }
    // CSRF cookie must be readable by JS so it can be mirrored into the header.
    expect(csrf).not.toMatch(/HttpOnly/);
    expect(csrf).toMatch(/SameSite=Lax/);
    expect(csrf).toMatch(/Path=\//);
    expect(csrf).toMatch(/Secure/);

    // In production the __Host- prefix must be present: it's a browser-enforced
    // contract that the cookie is Secure + Path=/ + origin-scoped (no Domain).
    expect(COOKIE_NAMES.access.startsWith('__Host-')).toBe(true);
    expect(COOKIE_NAMES.refresh.startsWith('__Host-')).toBe(true);
    expect(COOKIE_NAMES.csrf.startsWith('__Host-')).toBe(true);
  });

  it('omits Secure and the __Host- prefix in development so localhost HTTP still works', async () => {
    const { createTokenCookieHeaders, COOKIE_NAMES } = await loadAuth('development');
    expect(COOKIE_NAMES.access).toBe('livesov_token');
    expect(COOKIE_NAMES.refresh).toBe('livesov_refresh');
    const headers = createTokenCookieHeaders('access', 'refresh', 'csrf');
    for (const cookie of headers) {
      expect(cookie).not.toMatch(/Secure/);
    }
  });

  it('clear-cookie headers expire both current and legacy session cookies', async () => {
    const { createClearCookieHeaders, COOKIE_NAMES } = await loadAuth('production');
    const headers = createClearCookieHeaders();
    const names = headers.map((h) => h.split('=')[0]);
    expect(names).toContain(COOKIE_NAMES.access);
    expect(names).toContain(COOKIE_NAMES.refresh);
    expect(names).toContain(COOKIE_NAMES.csrf);
    // Legacy names swept so a stale pre-migration cookie can't outlive logout.
    expect(names).toContain('livesov_token');
    expect(names).toContain('livesov_refresh');
    for (const h of headers) {
      expect(h).toMatch(/Max-Age=0/);
    }
  });

  it('getTokenFromRequest accepts both prefixed and legacy cookie names', async () => {
    const { getTokenFromRequest, COOKIE_NAMES } = await loadAuth('production');
    const prefixed = new Request('https://x.test/', {
      headers: { cookie: `${COOKIE_NAMES.access}=newval; other=1` },
    });
    expect(getTokenFromRequest(prefixed)).toBe('newval');

    const legacy = new Request('https://x.test/', {
      headers: { cookie: 'livesov_token=oldval; other=1' },
    });
    expect(getTokenFromRequest(legacy)).toBe('oldval');
  });
});
