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
 * src/lib/pdf-report.ts is a hardcoded const. An agency buying the Agency plan
 * for that would find out in their first client deliverable.
 *
 * This is a mechanical check, not a judgement call: if the feature ever ships,
 * delete the offending entry here in the same commit that ships it.
 *
 * Google rank tracking DID ship branded reports (agency name, logo, colours
 * and custom domain: src/lib/rank-tracking/reports.ts + clients.ts), so the
 * rank tracking surfaces and the exact rank tracking pricing copy below are
 * exempt. The AI visibility PDF (src/lib/pdf-report.ts) still has no branding
 * override, so any other white-label or logo claim still fails.
 */

/** Files that describe the rank tracking module, which ships branding, plus
 *  the Google rank tracker marketing pages (/rank-tracker hub and the
 *  /uses/*rank-track* pages and /serpfox-alternative). The AI engine pages (/chatgpt-rank-tracker etc.)
 *  are AI visibility pages and stay covered. */
const RANK_TRACKING_FILE = /(^|\/)(lib|components|app\/api)\/rank-tracking\/|dashboard\/rank-tracking\/|src\/app\/client\/|dashboard-nav(-v3)?\.ts$|\(public\)\/rank-tracker\/|\(public\)\/uses\/[^/]*rank-track[^/]*\/|\(public\)\/serpfox-alternative\//;

/** Exact rank tracking pricing copy (PRICING_PLANS.rankFeatures + the /pricing strip),
 *  plus links to the white label rank tracker page (sitemap, footer, hubs). */
const RANK_TRACKING_COPY = ["'White-label PDF reports'", "t: 'White-label reports'", "'Your logo, a share link for every client.'", '/uses/white-label-rank-tracker'];

function isRankTrackingClaim(file: string, line: string): boolean {
  return RANK_TRACKING_FILE.test(file) || RANK_TRACKING_COPY.some((c) => line.includes(c));
}

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
        if (/white[\s-]?label/i.test(line) && !isRankTrackingClaim(file, line)) {
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
        if (/your (own )?logo|under your (own )?brand\b/i.test(line) && !isRankTrackingClaim(file, line)) {
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
    expect(home).toMatch(/const tiers = PRICING_PLANS(\.filter\(.*?\))?\.map/);
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

describe('Agency daily auto-run claim matches the credit maths', () => {
  it('states how many prompts on all engines fit a daily scan', async () => {
    const { PLAN_CREDITS } = await import('@/lib/plan-config');
    const cfg = PLAN_CREDITS.agency;
    const fits = Math.floor(cfg.monthlyCredits / 30 / cfg.maxPlatforms);
    const agency = PRICING_PLANS.find((p) => p.name === 'Agency');
    expect(agency).toBeDefined();
    const daily = agency!.features.find((f) => /daily auto-runs/i.test(f));
    expect(daily).toBe(`Daily auto-runs (about ${fits} prompts on all ${cfg.maxPlatforms} engines)`);
  });
});

describe('public plan prices and rank tracking allowances', () => {
  it('lists the current monthly and annual prices', () => {
    const byName = Object.fromEntries(PRICING_PLANS.map((p) => [p.name, [p.price, p.annualPrice]]));
    expect(byName).toEqual({
      Free: ['$0', '$0'],
      Starter: ['$19', '$15'],
      Pro: ['$49', '$39'],
      Agency: ['$129', '$103'],
    });
  });

  it('keeps plan-config price labels in step with PRICING_PLANS', async () => {
    const { PLAN_CREDITS } = await import('@/lib/plan-config');
    for (const p of PRICING_PLANS) {
      expect(PLAN_CREDITS[p.name.toLowerCase()].price, p.name).toBe(p.price);
    }
  });

  it('keeps the annual price at roughly 20% off monthly', () => {
    for (const p of PRICING_PLANS.filter((x) => x.price !== '$0')) {
      const m = Number(p.price.slice(1));
      const a = Number(p.annualPrice.slice(1));
      expect(a / m, p.name).toBeGreaterThan(0.75);
      expect(a / m, p.name).toBeLessThan(0.82);
    }
  });

  it('advertises the rank credits the rank tracker actually enforces', async () => {
    const { RANK_CREDITS_BY_PLAN, CHECKS_PER_MONTH } = await import('@/lib/rank-tracking/credits');
    for (const p of PRICING_PLANS) {
      const credits = RANK_CREDITS_BY_PLAN[p.name.toLowerCase()];
      expect(p.rankCredits, p.name).toBe(credits);
      if (credits > 0) {
        const weekly = credits / CHECKS_PER_MONTH.weekly;
        expect(p.rankFeatures[0], p.name).toBe(
          `${credits.toLocaleString('en-US')} credits (${weekly.toLocaleString('en-US')} keywords weekly)`,
        );
      } else {
        expect(p.rankFeatures, p.name).toEqual([]);
      }
    }
  });

  it('only promises top 100 and daily rank checks on plans that allow them', async () => {
    const { TOP100_PLANS, DAILY_PLANS } = await import('@/lib/rank-tracking/credits');
    for (const p of PRICING_PLANS) {
      const key = p.name.toLowerCase();
      const text = p.rankFeatures.join(' | ');
      if (/top 100/i.test(text)) expect(TOP100_PLANS.has(key), `${p.name} top 100`).toBe(true);
      if (/daily/i.test(text)) expect(DAILY_PLANS.has(key), `${p.name} daily`).toBe(true);
    }
  });
});
