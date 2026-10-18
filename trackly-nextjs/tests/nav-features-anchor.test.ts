import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// /features is a real page (src/app/(public)/features). It used to 301 to
// the homepage `#features` anchor; that redirect is gone, so every public
// header/footer must link the real page and pass it link equity.
const NAV_SOURCES = [
  'src/components/seo/SeoLayout.tsx',
  'src/components/site/SiteFooter.tsx',
];

describe('/features is a real page', () => {
  it('has a route', () => {
    expect(existsSync(join(process.cwd(), 'src/app/(public)/features/page.tsx'))).toBe(true);
  });

  it('is no longer redirected in next.config.ts', () => {
    const cfg = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8');
    expect(cfg).not.toMatch(/source:\s*['"]\/features['"]/);
  });

  for (const rel of NAV_SOURCES) {
    it(`${rel} links /features and never the old /#features anchor`, () => {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      expect(src).not.toMatch(/href\s*=\s*["'`]\/#features\b/);
      expect(src).toMatch(/href\s*=\s*["'`]\/features\b/);
    });
  }
});
