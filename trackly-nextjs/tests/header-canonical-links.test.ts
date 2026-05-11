import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MARKETING_NAV_LINKS } from '@/lib/marketing-nav';

// Regression guard for finding #2 (inconsistent header navigation).
// PR-6 unified the two marketing header sources behind a single
// shared array — MARKETING_NAV_LINKS — and this test pins both the
// canonical link set AND the fact that both consumers actually
// import it (so a future contributor cannot silently reintroduce a
// local nav-link array and let the headers drift again).

describe('MARKETING_NAV_LINKS — canonical 6-link header set (finding #2)', () => {
  it('contains exactly the canonical 6 items in canonical order', () => {
    expect(MARKETING_NAV_LINKS).toHaveLength(6);
    expect(MARKETING_NAV_LINKS.map(l => l.href)).toEqual([
      '/#features',
      '/how-it-works',
      '/pricing',
      '/tools',
      '/blog',
      '/contact',
    ]);
  });

  it('every label matches the canonical English string', () => {
    expect(MARKETING_NAV_LINKS.map(l => l.label)).toEqual([
      'Features',
      'How it Works',
      'Pricing',
      'Free Tools',
      'Blog',
      'Contact',
    ]);
  });

  it('does NOT include /geo-audit (PR-6 compromise — GEO Audit moved out of top nav)', () => {
    for (const link of MARKETING_NAV_LINKS) {
      expect(link.href).not.toBe('/geo-audit');
      expect(link.homeHref).not.toBe('/geo-audit');
    }
  });

  it('every href is unique', () => {
    const hrefs = MARKETING_NAV_LINKS.map(l => l.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('homeHref (anchor-on-home variant) is only set for items with real pages — How it Works + Pricing', () => {
    const withHomeHref = MARKETING_NAV_LINKS.filter(l => l.homeHref);
    expect(withHomeHref.map(l => l.href)).toEqual(['/how-it-works', '/pricing']);
    for (const link of withHomeHref) {
      expect(link.homeHref).toMatch(/^\/#/); // homeHref must be an in-page anchor
    }
  });

  it('Features always uses the anchor form (no `/features` real page exists; PR-1 added a 301)', () => {
    const features = MARKETING_NAV_LINKS.find(l => l.label === 'Features');
    expect(features?.href).toBe('/#features');
    expect(features?.homeHref).toBeUndefined();
  });
});

describe('Both header sources import MARKETING_NAV_LINKS (finding #2)', () => {
  // Source-level guard against a future commit reintroducing a local
  // `const navLinks = [...]` array in either consumer and letting the
  // headers drift again.
  const NAV_SOURCES = [
    'src/components/seo/SeoLayout.tsx',
    'src/app/(public)/home/page.tsx',
  ];

  for (const rel of NAV_SOURCES) {
    it(`${rel} imports MARKETING_NAV_LINKS from @/lib/marketing-nav`, () => {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      expect(src).toMatch(
        /import\s+\{[^}]*MARKETING_NAV_LINKS[^}]*\}\s+from\s+['"]@\/lib\/marketing-nav['"]/,
      );
    });
  }
});
