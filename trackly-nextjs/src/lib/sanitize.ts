/**
 * HTML sanitization for rendering user/AI content safely.
 * Strips all tags except a safe allowlist to prevent XSS.
 *
 * Inline `style` is deliberately NOT allowed — even after scrubbing
 * `javascript:` / `data:` URLs, CSS can be a vector (url(...), @import,
 * IE `expression()`, `-moz-binding`, and obfuscated values via HTML
 * entities). Callers that need visual styling should use one of the
 * whitelisted class names (md-hl, md-code, md-link) defined in
 * src/styles/globals.css.
 */

const ALLOWED_TAGS = new Set(['strong', 'em', 'code', 'mark', 'a', 'br', 'b', 'i', 'u', 'span', 'div', 'p']);
// `class` is allowed but its value is matched against ALLOWED_CLASSES,
// so attackers can't smuggle in arbitrary CSS selectors to match against
// global stylesheet rules.
const ALLOWED_CLASSES = new Set(['md-hl', 'md-code', 'md-link']);
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel', 'class']),
  code: new Set(['class']),
  mark: new Set(['class']),
  span: new Set(['class', 'title']),
  div: new Set(['class']),
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
      if (!allowed.has(attrName)) continue;
      // Defense in depth: reject any scheme-like prefix in any attribute.
      if (/javascript:/i.test(attrValue) || /data:/i.test(attrValue) || /vbscript:/i.test(attrValue)) continue;
      if (attrName === 'class') {
        // Only whitelist-matching classes land in the output. Unknown
        // class names are dropped silently so markup still renders.
        const safeClasses = attrValue.split(/\s+/).filter(c => ALLOWED_CLASSES.has(c));
        if (!safeClasses.length) continue;
        safeAttrs.push(`class="${safeClasses.join(' ')}"`);
        continue;
      }
      safeAttrs.push(`${attrName}="${attrValue}"`);
    }
    return `<${tagLower}${safeAttrs.length ? ' ' + safeAttrs.join(' ') : ''}>`;
  });
  return clean;
}
