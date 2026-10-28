/**
 * Pure helpers shared by /api/geo-audit and the GEO Audit pages.
 */

/**
 * Users type bare domains ("livesov.com"); the audit needs a full http(s)
 * URL, so add https:// when no protocol is given. Protocol-relative input
 * ("//livesov.com") gets https: too.
 */
export function normalizeAuditUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return t;
  if (t.startsWith('//')) return `https:${t}`;
  return `https://${t}`;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', middot: '·', bull: '•',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  copy: '©', reg: '®', trade: '™', laquo: '«', raquo: '»',
};

/**
 * Decode HTML character references in text pulled out of raw HTML (page
 * titles, meta descriptions). Single pass, so "&amp;lt;" becomes "&lt;"
 * rather than being decoded twice. Unknown named entities are left as is.
 */
export function decodeHtmlEntities(s: string): string {
  return s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return m;
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    const named = NAMED_ENTITIES[ref.toLowerCase()];
    return named ?? m;
  });
}

export type FindingTone = 'pos' | 'warn' | 'neg';

/**
 * Classify one finding string emitted by /api/geo-audit as a pass, a
 * partial pass, or a miss, so the UI can pick the matching icon.
 */
export function geoFindingTone(finding: string): FindingTone {
  const f = finding.trim();
  if (/^No excessive\b/i.test(f)) return 'pos';
  if (/^(Missing|No |Not using|Images are missing)/i.test(f) || /^Content is thin/i.test(f)) return 'neg';
  if (/^(Too many|Slow|Low|Add |Found |Heading hierarchy could|Content lacks)/i.test(f)) return 'warn';
  if (/ - (consider|aim|use|reduce|add)\b/i.test(f)) return 'warn';
  if (/^\d+\/\d+ images\b/i.test(f)) return 'warn';
  return 'pos';
}

/** Icon tone for a category score (0 to 100). */
export function scoreTone(score: number): FindingTone {
  return score >= 70 ? 'pos' : score >= 40 ? 'warn' : 'neg';
}

/**
 * The one finding to show beside a category's score. A good score shows
 * what the page does well; a weak one shows the first thing to fix, so the
 * icon and the text next to it never disagree.
 */
export function pickCategoryFinding(score: number, findings: string[] | undefined): string {
  const list = findings || [];
  if (!list.length) return '';
  const wantPositive = scoreTone(score) === 'pos';
  const match = list.find(f => (geoFindingTone(f) === 'pos') === wantPositive);
  return match ?? list[0];
}
