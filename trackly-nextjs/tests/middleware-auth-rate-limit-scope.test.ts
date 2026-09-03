import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The tight 10 req/min auth limiter must only cover endpoints that accept or
 * mint credentials. /api/auth/me is called by the dashboard shell on every
 * full page load and every tab focus; when it shared the auth bucket, ten
 * dashboard page loads inside a minute produced a 429, the client treated
 * that as "signed out", and the user was bounced to /login mid-session.
 */
const source = readFileSync(join(__dirname, '../src/middleware.ts'), 'utf8');

describe('middleware auth rate-limit scope', () => {
  it('keys the auth bucket off an explicit credential-path list, not the /api/auth/ prefix', () => {
    expect(source).toMatch(/const isAuth = isCredentialAuthPath\(pathname\);/);
    expect(source).not.toMatch(/const isAuth = pathname\.startsWith\('\/api\/auth\/'\);/);
  });

  it('keeps the credential endpoints under the tight limit', () => {
    for (const p of ['/api/auth/login', '/api/auth/register', '/api/auth/google', '/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/2fa/verify']) {
      expect(source).toContain(`'${p}'`);
    }
  });

  it('leaves session plumbing (me, refresh, sessions, 2fa/status) out of the tight bucket', () => {
    const start = source.indexOf('CREDENTIAL_AUTH_PATHS = new Set([');
    const block = source.slice(start, source.indexOf(']);', start));
    for (const p of ['/api/auth/me', '/api/auth/refresh', '/api/auth/sessions', '/api/auth/2fa/status', '/api/auth/logout']) {
      expect(block).not.toContain(`'${p}'`);
    }
  });
});
