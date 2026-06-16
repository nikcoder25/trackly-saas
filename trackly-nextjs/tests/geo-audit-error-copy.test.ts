import { describe, expect, it } from 'vitest';
import { ssrfErrorToCopy } from '@/lib/safe-fetch';
import { validateUrlClientSide } from '@/app/(public)/geo-audit/validate-url';

// Pins the user-facing copy for finding #5 (misleading SSRF errors)
// and finding #6 (client-side validation). Both surfaces are pure
// functions; tests don't need to mock the route or DOM. If anyone
// changes the copy without updating tests, this file fails.

describe('ssrfErrorToCopy - SSRF code → user copy mapping (finding #5)', () => {
  it('PROTOCOL_BLOCKED → actionable: tell the user which protocols are allowed', () => {
    expect(ssrfErrorToCopy('PROTOCOL_BLOCKED')).toBe(
      'URL protocol not allowed. Use http or https.',
    );
  });

  it('DNS_FAILED / DNS_EMPTY → actionable: domain doesn\'t resolve', () => {
    const expected = "We couldn't find that domain. Check the URL and try again.";
    expect(ssrfErrorToCopy('DNS_FAILED')).toBe(expected);
    expect(ssrfErrorToCopy('DNS_EMPTY')).toBe(expected);
  });

  it('TOO_MANY_REDIRECTS → factual, no security implication', () => {
    expect(ssrfErrorToCopy('TOO_MANY_REDIRECTS')).toBe('URL redirects too many times.');
  });

  it('TOO_LARGE → factual, surfaces the 5 MB cap', () => {
    expect(ssrfErrorToCopy('TOO_LARGE')).toBe('Page is too large to analyze (over 5 MB).');
  });

  it('INVALID_URL → defense path, generic but accurate', () => {
    expect(ssrfErrorToCopy('INVALID_URL')).toBe('Invalid URL.');
  });

  it('HOST_BLOCKED / IP_BLOCKED → intentionally generic (security through obscurity)', () => {
    const expected = "We couldn't reach that URL.";
    expect(ssrfErrorToCopy('HOST_BLOCKED')).toBe(expected);
    expect(ssrfErrorToCopy('IP_BLOCKED')).toBe(expected);
  });

  it('unknown code → falls through to the generic message (never throws)', () => {
    expect(ssrfErrorToCopy('SOMETHING_NEW' as string)).toBe("We couldn't reach that URL.");
    expect(ssrfErrorToCopy('')).toBe("We couldn't reach that URL.");
  });

  it('regression guard: never returns the misleading "private/internal network" copy', () => {
    const codes = [
      'PROTOCOL_BLOCKED', 'HOST_BLOCKED', 'IP_BLOCKED',
      'DNS_FAILED', 'DNS_EMPTY', 'TOO_MANY_REDIRECTS', 'TOO_LARGE',
      'INVALID_URL', 'UNKNOWN',
    ];
    for (const code of codes) {
      expect(ssrfErrorToCopy(code)).not.toMatch(/private|internal network/i);
    }
  });
});

describe('validateUrlClientSide - pre-fetch input validation (finding #6)', () => {
  it('empty string → "Enter a URL"', () => {
    expect(validateUrlClientSide('')).toBe('Enter a URL to audit.');
  });

  it('whitespace-only → "Enter a URL" (the gap the stress test flagged)', () => {
    expect(validateUrlClientSide('   ')).toBe('Enter a URL to audit.');
    expect(validateUrlClientSide('\t\n  ')).toBe('Enter a URL to audit.');
  });

  it('over 2048 chars → "URL is too long"', () => {
    const long = 'https://example.com/' + 'a'.repeat(2100);
    expect(validateUrlClientSide(long)).toBe('URL is too long.');
  });

  it('garbage input → "Invalid URL" with protocol hint', () => {
    expect(validateUrlClientSide('not a url')).toBe(
      'Invalid URL. Include the protocol (e.g. https://example.com).',
    );
    expect(validateUrlClientSide('example.com')).toBe(
      'Invalid URL. Include the protocol (e.g. https://example.com).',
    );
  });

  it('non-http protocols → "must use http or https"', () => {
    expect(validateUrlClientSide('ftp://example.com')).toBe('URL must use http or https.');
    expect(validateUrlClientSide('javascript:alert(1)')).toBe('URL must use http or https.');
    expect(validateUrlClientSide('data:text/html,abc')).toBe('URL must use http or https.');
    expect(validateUrlClientSide('file:///etc/passwd')).toBe('URL must use http or https.');
  });

  it('valid http URL → null (no error)', () => {
    expect(validateUrlClientSide('http://example.com')).toBeNull();
    expect(validateUrlClientSide('http://example.com/path?q=1')).toBeNull();
  });

  it('valid https URL → null', () => {
    expect(validateUrlClientSide('https://example.com')).toBeNull();
    expect(validateUrlClientSide('  https://example.com  ')).toBeNull(); // trimmed
  });
});
