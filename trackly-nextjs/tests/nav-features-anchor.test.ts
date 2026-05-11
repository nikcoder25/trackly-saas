import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Regression guard for finding #1. The legacy `/features` route never
// shipped as a page; the canonical destination is the homepage anchor
// `/#features`. A 301 in next.config.ts catches stray external traffic,
// but a hardcoded `<Link href="/features">` in a nav component would
// emit a 301 on every page load and degrade SSR HTML for crawlers.
// Pin the canonical form in every component that renders the public
// header / footer.
const NAV_SOURCES = [
  'src/components/seo/SeoLayout.tsx',
  'src/app/(public)/home/page.tsx',
];

describe('legacy /features link must remain anchor-form', () => {
  for (const rel of NAV_SOURCES) {
    it(`${rel} uses /#features and never a bare /features link`, () => {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      // `/#features` passes this check because the slash is followed
      // by `#`, not by `features`. `\b` blocks false positives on
      // hypothetical sibling routes (e.g. `/features-pricing`).
      expect(src).not.toMatch(/href\s*=\s*["'`]\/features\b/);
      // Sanity: ensure the file still has a /#features link, else the
      // regression check would silently pass on a file that lost the
      // nav entry entirely.
      expect(src).toMatch(/href\s*=\s*["'`]\/#features\b/);
    });
  }
});
