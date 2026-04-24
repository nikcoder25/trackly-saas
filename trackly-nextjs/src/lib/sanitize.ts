/**
 * HTML, URL, and markdown sanitization helpers.
 *
 * Single source of truth for rendering untrusted content safely:
 *   - escapeHtml: HTML-entity escape for text interpolation
 *   - safeExternalUrl / safeRedirectPath: reject XSS/open-redirect URLs
 *   - sanitizeHtml: allowlist-based tag/attribute filter
 *   - highlightBrand / renderInlineMarkdown: safe markdown subset
 *
 * Covered attacker tricks:
 *   - javascript:, data:, vbscript:, file:, blob: schemes
 *   - Whitespace/tab/newline/unicode bidi splits inside a scheme
 *     (e.g. "java\tscript:", " javascript:", " JavaScript:")
 *   - HTML-entity obfuscation ("&#106;avascript:alert(1)")
 *   - Protocol-relative URLs ("//evil.com") masquerading as site-relative
 *   - Backslash-as-slash path traversal ("/\\evil.com"), which Chrome and
 *     Firefox both normalise to "//evil.com" on navigation
 *   - Attribute-quote breakout ('<a href=\'x" onerror="alert(1)\'>')
 */

// --- Shared scheme/whitespace primitives ---------------------------------

const DANGEROUS_SCHEMES = /^(javascript|data|vbscript|file|blob):/i;

// ASCII + unicode whitespace/control chars the URL parser ignores when
// resolving the scheme. Stripping these closes splits like "java\tscript:"
// and " JavaScript:". Ranges cover C0 controls, plain whitespace, NBSP,
// unicode spaces, bidi overrides, and BOM.
const STRIPPABLE = new RegExp(
  '[\\u0000-\\u0020\\u00a0\\u1680\\u2000-\\u200f\\u2028\\u2029\\u202a-\\u202f\\u205f\\u2060\\u3000\\ufeff]',
  'g',
);

// Browsers decode HTML entities before URL parsing, so a naive /javascript:/
// match would miss "&#106;avascript:alert(1)". Decode before scheme-checking.
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/gi, '&');
}

function hasDangerousScheme(value: string): boolean {
  const normalized = decodeEntities(value).replace(STRIPPABLE, '');
  return DANGEROUS_SCHEMES.test(normalized);
}

// --- HTML entity escaping ------------------------------------------------

/**
 * Escape user text for safe embedding in HTML. Tolerant of null/undefined
 * so it can be dropped into template literals that read from optional
 * record fields.
 */
export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- URL safety ----------------------------------------------------------

/**
 * Returns `url` if it is safe to use as an `<a href>` or `<img src>`
 * target, otherwise `fallback` (default "#"). Accepts http(s):, mailto:,
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
 * Returns `redirect` if it is a safe same-origin redirect target, otherwise
 * `fallback`. Stricter than safeExternalUrl: only accepts paths beginning
 * with a single `/` and rejects protocol-relative, backslash, and
 * scheme-bearing inputs.
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

// --- HTML allowlist sanitizer --------------------------------------------

const ALLOWED_TAGS = new Set(['strong', 'em', 'code', 'mark', 'a', 'br', 'b', 'i', 'u', 'span', 'div', 'p']);
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel', 'style']),
  code: new Set(['style']),
  mark: new Set(['style']),
  span: new Set(['style', 'title']),
  div: new Set(['style']),
};

/**
 * Strip dangerous HTML tags and attributes from a string. Only allows safe
 * formatting tags through.
 */
export function sanitizeHtml(html: string): string {
  // Remove script tags and their content entirely
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Remove event handlers from any remaining tags
  clean = clean.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  clean = clean.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '');
  // Remove all tags not in allowlist
  clean = clean.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag) => {
    const tagLower = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(tagLower)) return '';
    // For closing tags, just return the clean closing tag
    if (match.startsWith('</')) return `</${tagLower}>`;
    // For opening tags, filter attributes
    const allowed = ALLOWED_ATTRS[tagLower];
    if (!allowed) return `<${tagLower}>`;
    // Extract and filter attributes
    const attrString = match.slice(tag.length + 1, match.endsWith('/>') ? -2 : -1).trim();
    const safeAttrs: string[] = [];
    const attrRe = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
    let m;
    while ((m = attrRe.exec(attrString)) !== null) {
      const attrName = m[1].toLowerCase();
      const attrValue = m[2] ?? m[3] ?? m[4] ?? '';
      if (!allowed.has(attrName)) continue;
      // Reject dangerous schemes after decoding HTML entities and
      // stripping splitter whitespace/control chars. Old code only
      // matched the literal lowercase "javascript:" / "data:" prefix.
      if (hasDangerousScheme(attrValue)) continue;
      // Belt-and-braces: don't let attacker-controlled quotes break out
      // of the attribute we're about to emit.
      const escapedValue = attrValue.replace(/"/g, '&quot;').replace(/</g, '&lt;');
      safeAttrs.push(`${attrName}="${escapedValue}"`);
    }
    return `<${tagLower}${safeAttrs.length ? ' ' + safeAttrs.join(' ') : ''}>`;
  });
  return clean;
}

// --- Brand markdown rendering --------------------------------------------

const MARK_STYLE =
  'background:rgba(16,185,129,.12);color:var(--green);border-radius:3px;padding:1px 4px;font-weight:700;';
const CODE_STYLE =
  'background:var(--bg3);padding:1px 4px;border-radius:3px;font-family:var(--mono);font-size:11px;';
const LINK_STYLE = 'color:var(--primary);text-decoration:underline;';

/**
 * Escape `text` and wrap case-insensitive occurrences of `brand` in a
 * `<mark>` tag. Output is safe to pass to sanitizeHtml at the render site.
 */
export function highlightBrand(text: string, brand: string | null | undefined): string {
  const escaped = escapeHtml(text);
  if (!brand) return escaped;
  const pattern = escapeRegex(escapeHtml(brand));
  if (!pattern) return escaped;
  return escaped.replace(new RegExp(`(${pattern})`, 'gi'), `<mark style="${MARK_STYLE}">$1</mark>`);
}

/**
 * Render a minimal safe markdown subset as HTML:
 *   **bold**, `code`, # headings (h1-h3 → strong), - or • bullets,
 *   numbered lists, [label](https://...) links.
 * Input is HTML-escaped first, so callers may pass arbitrary user text.
 * When `brand` is supplied, brand-name mentions are wrapped in `<mark>`.
 * The result should still be passed through sanitizeHtml at the render
 * site (defense in depth).
 */
export function renderInlineMarkdown(
  text: string,
  opts: { brand?: string | null } = {},
): string {
  if (!text) return '';
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/`([^`]+)`/g, `<code style="${CODE_STYLE}">$1</code>`);
  html = html.replace(/^#{1,3}\s+(.+)$/gm, '<strong>$1</strong>');
  html = html.replace(/^[-•]\s+(.+)$/gm, '&nbsp;&nbsp;• $1');
  html = html.replace(/^(\d+)\.\s+(.+)$/gm, '&nbsp;&nbsp;$1. $2');
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    `<a href="$2" target="_blank" rel="noopener" style="${LINK_STYLE}">$1</a>`,
  );
  if (opts.brand) {
    const pattern = escapeRegex(escapeHtml(opts.brand));
    if (pattern) {
      html = html.replace(
        new RegExp(`(${pattern})`, 'gi'),
        `<mark style="${MARK_STYLE}">$1</mark>`,
      );
    }
  }
  return html;
}
