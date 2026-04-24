/**
 * URL-safety helpers for preventing XSS via href/src and open-redirects.
 *
 * Covered attacker tricks:
 *   - javascript:, data:, vbscript:, file:, blob: schemes
 *   - Whitespace/tab/newline/unicode bidi splits inside the scheme
 *     (e.g. "java\tscript:", " javascript:", " JavaScript:")
 *   - Protocol-relative URLs ("//evil.com") masquerading as site-relative
 *   - Backslash-as-slash path traversal ("/\\evil.com"), which Chrome and
 *     Firefox both normalise to "//evil.com" on navigation
 */

const DANGEROUS_SCHEMES = /^(javascript|data|vbscript|file|blob):/i;

// ASCII + common unicode whitespace/control chars the URL parser
// ignores when resolving the scheme. Stripping these closes splits
// like "java\tscript:" and " JavaScript:". Ranges cover C0 controls,
// plain whitespace, NBSP, unicode spaces, bidi overrides, and BOM.
const STRIPPABLE = new RegExp(
  '[\\u0000-\\u0020\\u00a0\\u1680\\u2000-\\u200f\\u2028\\u2029\\u202a-\\u202f\\u205f\\u2060\\u3000\\ufeff]',
  'g',
);

/**
 * Returns `url` if it is safe to use as an <a href> or <img src> target,
 * otherwise returns `fallback` (default "#"). Accepts http(s):, mailto:,
 * tel:, and same-origin relative URLs.
 */
export function safeExternalUrl(url: unknown, fallback: string = '#'): string {
  if (typeof url !== 'string') return fallback;
  const stripped = url.replace(STRIPPABLE, '');
  if (!stripped) return fallback;
  if (DANGEROUS_SCHEMES.test(stripped)) return fallback;
  // Reject protocol-relative and backslash-normalised equivalents.
  if (/^(\/\/|\\\\|\/\\|\\\/)/.test(stripped)) return fallback;
  if (/^https?:\/\//i.test(stripped)) return url;
  if (/^(mailto:|tel:)/i.test(stripped)) return url;
  if (/^[/?#]/.test(stripped)) return url;
  return fallback;
}

/**
 * Returns the given `redirect` path if it is a safe same-origin redirect
 * target, otherwise returns `fallback`. Stricter than safeExternalUrl:
 * only accepts paths beginning with a single `/` and rejects
 * protocol-relative, backslash, and scheme-bearing inputs.
 *
 * Use for login ?redirect=, ?next=, ?returnTo=, ?callbackUrl= params.
 */
export function safeRedirectPath(redirect: unknown, fallback: string = '/'): string {
  if (typeof redirect !== 'string') return fallback;
  const stripped = redirect.replace(STRIPPABLE, '');
  if (!stripped) return fallback;
  if (!stripped.startsWith('/')) return fallback;
  // Blocks "//evil.com", "/\evil.com", "\\/evil.com", and any
  // scheme-qualified URL that somehow began with '/'.
  if (/^\/[/\\]/.test(stripped)) return fallback;
  if (DANGEROUS_SCHEMES.test(stripped)) return fallback;
  return redirect;
}
