import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PRICING_PLANS } from '@/lib/constants';

/**
 * Guard against marketing writing checks the product cannot cash.
 *
 * The site advertised "white-label reports" on 11 files and ~38 surfaces -
 * a paid-tier feature bullet, a partner-program perk tier, two FAQs that
 * answered "Yes", a meta description we were actively ranking on, and a case
 * study asserting a named customer had used it. No such capability exists:
 * `generateReport(brand)` takes no branding override and `BRANDING` in
 * src/lib/pdf-report.ts is a hardcoded const. An agency buying the $89 plan
 * for that would find out in their first client deliverable.
 *
 * This is a mechanical check, not a judgement call: if the feature ever ships,
 * delete the offending entry here in the same commit that ships it.
 */

const SRC = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Strip block + line comments so our own explanatory notes don't self-trip. */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('no unbacked white-label claims', () => {
  it('never advertises white-labelling anywhere in user-facing source', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const body = stripComments(readFileSync(file, 'utf8'));
      for (const [i, line] of body.split('\n').entries()) {
        if (/white[\s-]?label/i.test(line)) {
          offenders.push(`${file.replace(process.cwd() + '/', '')}:${i + 1}: ${line.trim().slice(0, 100)}`);
        }
      }
    }
    expect(
      offenders,
      'white-label is advertised but no branding-override capability exists (see src/lib/pdf-report.ts BRANDING)',
    ).toEqual([]);
  });

  it('does not promise customer logos on reports', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const body = stripComments(readFileSync(file, 'utf8'));
      for (const [i, line] of body.split('\n').entries()) {
        // "your logo" / "under your own brand" - the same promise, reworded.
        if (/your (own )?logo|under your (own )?brand\b/i.test(line)) {
          offenders.push(`${file.replace(process.cwd() + '/', '')}:${i + 1}: ${line.trim().slice(0, 100)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('homepage pricing cannot drift from /pricing', () => {
  it('derives its plan cards from PRICING_PLANS rather than a hardcoded copy', () => {
    const home = readFileSync(join(SRC, 'app/(public)/home/page.tsx'), 'utf8');
    expect(home).toContain("import { PRICING_PLANS } from '@/lib/constants'");
    expect(home).toMatch(/const tiers = PRICING_PLANS\.map/);
  });

  it('keeps every plan self-serve - no "Contact sales" dead end on a listed price', () => {
    // The homepage used to route Agency to /contact while /pricing sold the
    // same plan self-serve with a free trial. If a plan has a public price,
    // the CTA must let people buy it.
    for (const plan of PRICING_PLANS) {
      expect(plan.price, `${plan.name} should have a public price`).toMatch(/^\$/);
      expect(
        plan.cta.toLowerCase(),
        `${plan.name} lists a price but its CTA is "${plan.cta}"`,
      ).not.toContain('contact');
    }
  });

  it('does not list features on a plan that the product does not have', () => {
    for (const plan of PRICING_PLANS) {
      for (const f of plan.features) {
        expect(f, `${plan.name} advertises "${f}"`).not.toMatch(/white[\s-]?label/i);
      }
    }
  });
});
