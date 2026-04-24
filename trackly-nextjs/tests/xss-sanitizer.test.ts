import { describe, it, expect } from 'vitest';
import { sanitizeHtml, safeExternalUrl, safeRedirectPath } from '@/lib/sanitize';

// ─── Sanitizer scheme-split regressions ─────────────────────────────────────

describe('sanitizeHtml rejects dangerous url schemes', () => {
  it('strips plain javascript: href', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/javascript/i);
  });

  it('strips tab-split javascript: href', () => {
    const out = sanitizeHtml('<a href="java\tscript:alert(1)">x</a>');
    expect(out).not.toMatch(/javascript/i);
    expect(out).not.toMatch(/alert/);
  });

  it('strips leading-whitespace scheme "  javascript:..."', () => {
    const out = sanitizeHtml('<a href="   javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/alert/);
  });

  it('strips HTML-entity encoded javascript (&#106;avascript:)', () => {
    const out = sanitizeHtml('<a href="&#106;avascript:alert(1)">x</a>');
    expect(out).not.toMatch(/alert/);
  });

  it('strips vbscript: and data: schemes', () => {
    expect(sanitizeHtml('<a href="vbscript:msgbox(1)">x</a>')).not.toMatch(/vbscript/i);
    expect(sanitizeHtml('<a href="data:text/html,<script>1</script>">x</a>')).not.toMatch(/data:/i);
  });

  it('drops on* event handlers', () => {
    const out = sanitizeHtml('<a href="https://ex.com" onmouseover="alert(1)">x</a>');
    expect(out).not.toMatch(/onmouseover/i);
    expect(out).toMatch(/href="https:\/\/ex\.com"/);
  });

  it('strips <script> tags entirely', () => {
    const out = sanitizeHtml('before<script>alert(1)</script>after');
    expect(out).toBe('beforeafter');
  });

  it('HTML-escapes attribute values to prevent quote break-out', () => {
    // Attacker attribute that tries to close the quote and inject onerror.
    const out = sanitizeHtml('<a href=\'https://x" onerror="alert(1)\'>x</a>');
    expect(out).not.toMatch(/onerror/i);
  });
});

// ─── Open-redirect allowlist ────────────────────────────────────────────────

describe('safeRedirectPath blocks open-redirect vectors', () => {
  it('accepts simple same-origin paths', () => {
    expect(safeRedirectPath('/dashboard')).toBe('/dashboard');
    expect(safeRedirectPath('/dashboard?tab=1')).toBe('/dashboard?tab=1');
    expect(safeRedirectPath('/dashboard#anchor')).toBe('/dashboard#anchor');
  });

  it('rejects protocol-relative "//evil.com"', () => {
    expect(safeRedirectPath('//evil.com')).toBe('/');
    expect(safeRedirectPath('//evil.com/dashboard')).toBe('/');
  });

  it('rejects backslash-normalised "/\\evil.com" (Chrome/Firefox bypass)', () => {
    expect(safeRedirectPath('/\\evil.com')).toBe('/');
    expect(safeRedirectPath('/\\/evil.com')).toBe('/');
    expect(safeRedirectPath('\\\\evil.com')).toBe('/');
  });

  it('rejects absolute and scheme-bearing URLs', () => {
    expect(safeRedirectPath('https://evil.com/x')).toBe('/');
    expect(safeRedirectPath('javascript:alert(1)')).toBe('/');
    expect(safeRedirectPath('data:text/html,x')).toBe('/');
  });

  it('rejects non-string input', () => {
    expect(safeRedirectPath(undefined)).toBe('/');
    expect(safeRedirectPath(null)).toBe('/');
    expect(safeRedirectPath(42)).toBe('/');
  });

  it('honours custom fallback', () => {
    expect(safeRedirectPath('//evil.com', '/login')).toBe('/login');
    expect(safeRedirectPath('/dashboard', '/login')).toBe('/dashboard');
  });
});

describe('safeExternalUrl blocks href/src XSS vectors', () => {
  it('accepts http(s), mailto, tel, and same-origin paths', () => {
    expect(safeExternalUrl('https://example.com')).toBe('https://example.com');
    expect(safeExternalUrl('http://example.com')).toBe('http://example.com');
    expect(safeExternalUrl('mailto:a@b.com')).toBe('mailto:a@b.com');
    expect(safeExternalUrl('tel:+15555555555')).toBe('tel:+15555555555');
    expect(safeExternalUrl('/dashboard')).toBe('/dashboard');
    expect(safeExternalUrl('?q=x')).toBe('?q=x');
    expect(safeExternalUrl('#anchor')).toBe('#anchor');
  });

  it('rejects javascript: in every shape', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBe('#');
    expect(safeExternalUrl('JAVASCRIPT:alert(1)')).toBe('#');
    expect(safeExternalUrl('  javascript:alert(1)')).toBe('#');
    expect(safeExternalUrl('java\tscript:alert(1)')).toBe('#');
  });

  it('rejects data:, vbscript:, file:, blob:', () => {
    expect(safeExternalUrl('data:text/html,<script>1</script>')).toBe('#');
    expect(safeExternalUrl('vbscript:msgbox(1)')).toBe('#');
    expect(safeExternalUrl('file:///etc/passwd')).toBe('#');
    expect(safeExternalUrl('blob:https://x/123')).toBe('#');
  });

  it('rejects protocol-relative and backslash forms', () => {
    expect(safeExternalUrl('//evil.com')).toBe('#');
    expect(safeExternalUrl('\\\\evil.com')).toBe('#');
    expect(safeExternalUrl('/\\evil.com')).toBe('#');
  });

  it('returns custom fallback when unsafe', () => {
    expect(safeExternalUrl('javascript:alert(1)', '')).toBe('');
  });
});

// ─── CSP header smoke test ──────────────────────────────────────────────────
//
// The CSP moved from next.config.ts into middleware.ts so it can embed a
// per-request nonce (replacing 'unsafe-inline' in script-src). We assert the
// middleware source as text rather than importing it so the test stays
// hermetic — next/server isn't a plain-Node module.

describe('CSP smoke test', () => {
  it('middleware.ts declares a strict nonce-based Content-Security-Policy', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const source = readFileSync(
      path.resolve(__dirname, '..', 'src', 'middleware.ts'),
      'utf-8',
    );

    // The CSP response header is set on every response.
    expect(source).toMatch(/['"]Content-Security-Policy['"]/);

    // Required primitives.
    expect(source).toMatch(/default-src 'self'/);
    expect(source).toMatch(/frame-ancestors 'none'/);

    // Script-src must use a per-request nonce instead of 'unsafe-inline'.
    expect(source).toMatch(/script-src[^,;`]*'nonce-\$\{nonce\}'/);
    expect(source).not.toMatch(/script-src[^,;`]*'unsafe-inline'/);

    // Hard-bans that must never regress into the policy.
    expect(source).not.toMatch(/'unsafe-eval'/);
    // No wildcard source ending a directive (e.g. "script-src *;").
    expect(source).not.toMatch(/-src\s+\*\s*['"]/);
  });

  it('next.config.ts no longer carries its own CSP header', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const source = readFileSync(
      path.resolve(__dirname, '..', 'next.config.ts'),
      'utf-8',
    );

    // CSP is now owned by middleware.ts; having it here again as a header
    // entry would either shadow the nonce-bearing one or let 'unsafe-inline'
    // sneak back in. A comment that names the string is fine, an actual
    // `key: 'Content-Security-Policy'` entry is not.
    expect(source).not.toMatch(/key:\s*['"]Content-Security-Policy['"]/);
  });
});
