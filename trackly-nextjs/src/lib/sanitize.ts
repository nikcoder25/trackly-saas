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
  // Remove javascript: and data: URLs
  clean = clean.replace(/href\s*=\s*["']?\s*javascript:/gi, 'href="');
  clean = clean.replace(/href\s*=\s*["']?\s*data:/gi, 'href="');
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
      if (allowed.has(attrName)) {
        // Extra check: don't allow javascript: in any attribute value
        if (!/javascript:/i.test(attrValue) && !/data:/i.test(attrValue)) {
          safeAttrs.push(`${attrName}="${attrValue}"`);
        }
      }
    }
    return `<${tagLower}${safeAttrs.length ? ' ' + safeAttrs.join(' ') : ''}>`;
  });
  return clean;
}
