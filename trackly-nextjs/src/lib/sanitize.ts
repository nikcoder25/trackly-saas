/**
 * HTML sanitization for rendering user/AI content safely.
 * Strips all tags except a safe allowlist to prevent XSS.
 */

const ALLOWED_TAGS = new Set(['strong', 'em', 'code', 'mark', 'a', 'br', 'b', 'i', 'u', 'span', 'div', 'p']);
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel', 'style']),
  code: new Set(['style']),
  mark: new Set(['style']),
  span: new Set(['style', 'title']),
  div: new Set(['style']),
};

// Any scheme that can execute script or load arbitrary content. Callers
// reject an attribute value whose stripped form starts with one of these.
const DANGEROUS_SCHEMES = /^(javascript|data|vbscript|file|blob):/i;

// HTML entities we must decode before scheme-checking. Raw `&#106;` for
// the "j" in "javascript:" is inert when read by our regex but is decoded
// by the browser before URL parsing, so a naïve /javascript:/ match would
// miss "&#106;avascript:alert(1)".
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/gi, '&');
}

// Strip whitespace/control chars the URL parser ignores when resolving a
// scheme ("java\tscript:" → "javascript:"). Range covers C0 controls,
// NBSP, unicode spaces, bidi marks and BOM.
const STRIPPABLE = new RegExp(
  '[\\u0000-\\u0020\\u00a0\\u1680\\u2000-\\u200f\\u2028\\u2029\\u202a-\\u202f\\u205f\\u2060\\u3000\\ufeff]',
  'g',
);

function hasDangerousScheme(value: string): boolean {
  const normalized = decodeEntities(value).replace(STRIPPABLE, '');
  return DANGEROUS_SCHEMES.test(normalized);
}

/**
 * Strip dangerous HTML tags and attributes from a string.
 * Only allows safe formatting tags through.
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
