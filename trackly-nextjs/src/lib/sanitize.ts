/**
 * HTML sanitization for rendering user/AI content safely.
 * Strips all tags except a safe allowlist to prevent XSS.
 */

const ALLOWED_TAGS = new Set(['strong', 'em', 'code', 'mark', 'a', 'br', 'b', 'i', 'u', 'span', 'div', 'p']);
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  span: new Set(['title']),
};

// Dangerous CSS patterns that could enable XSS or UI redressing
const DANGEROUS_CSS_RE = /expression\s*\(|url\s*\(|javascript:|data:|import\s|\\|position\s*:\s*(fixed|absolute)|z-index|(?:-moz-|-webkit-)binding/i;

/**
 * Escape HTML entities in an attribute value to prevent breakout.
 */
function escapeAttrValue(val: string): string {
  return val.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Strip dangerous HTML tags and attributes from a string.
 * Only allows safe formatting tags through.
 */
export function sanitizeHtml(html: string): string {
  // Decode HTML entities that could bypass checks (&#x6a;avascript: → javascript:)
  let clean = html.replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  clean = clean.replace(/&#(\d+);?/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));

  // Remove script tags and their content entirely
  clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Remove style tags and their content entirely
  clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  // Remove event handlers from any remaining tags (including encoded variants)
  clean = clean.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  clean = clean.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '');
  // Remove javascript: and data: URLs (case-insensitive, whitespace-tolerant)
  clean = clean.replace(/href\s*=\s*["']?\s*(?:javascript|data|vbscript)\s*:/gi, 'href="');
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
      // Block javascript:/data:/vbscript: in any attribute value
      if (/(?:javascript|data|vbscript)\s*:/i.test(attrValue)) continue;
      // Block dangerous CSS in style attributes
      if (attrName === 'style' && DANGEROUS_CSS_RE.test(attrValue)) continue;
      // Escape attribute value to prevent breakout
      safeAttrs.push(`${attrName}="${escapeAttrValue(attrValue)}"`);
    }
    // Force rel="noopener noreferrer" on links for safety
    if (tagLower === 'a') {
      const hasRel = safeAttrs.some(a => a.startsWith('rel='));
      if (!hasRel) safeAttrs.push('rel="noopener noreferrer"');
      const hasTarget = safeAttrs.some(a => a.startsWith('target='));
      if (!hasTarget) safeAttrs.push('target="_blank"');
    }
    return `<${tagLower}${safeAttrs.length ? ' ' + safeAttrs.join(' ') : ''}>`;
  });
  return clean;
}
