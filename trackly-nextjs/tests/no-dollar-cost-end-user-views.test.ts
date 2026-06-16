import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Snapshot-style guard for #459 scope 2: end-user views must not render
 * provider dollar cost. The `usd_cost` column on `tenant_cost_events` is
 * preserved (the API still computes it for admin/internal cost
 * dashboards), but the user-facing Activity & Logs and Credit Ledger
 * pages must not surface it.
 *
 * We assert against the *source* of each page so the test catches both
 * direct `${...}` template literals and JSX text like `~${...}`. A
 * structural source scan beats a render snapshot here because (a) the
 * test runner is `node`, not `jsdom`, and (b) we want a low-noise
 * regression catcher that does not require mocking auth/data.
 *
 * Out of scope for this guard:
 *   - Admin dashboards (kept intentional - see issue #459 description).
 *   - Backend code that computes usd_cost (we only police the rendered
 *     surface, not the data layer).
 */

const REPO_ROOT = join(__dirname, '..');

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

/**
 * Heuristic: any literal that puts a `$` immediately before a JS
 * expression, a digit, or a numeric format helper. This catches
 * `~$${cost}`, `$${x.toFixed(...)}`, `$0.00`, etc. We intentionally do
 * NOT flag bare `$` because it appears in many CSS-in-JS shorthands and
 * inside the JSX templates themselves; the leading character class is
 * what makes a dollar amount.
 *
 * Allowed in tests / strings: `$1`, `$2` SQL placeholders are not in
 * .tsx files, so they don't false-positive here.
 */
const DOLLAR_AMOUNT_RE = /\$\$?\{[^}]*(?:cost|usd|Cost|Usd|USD|price|Price)[^}]*\}|\$\$\{[^}]*\.toFixed\([^)]*\)\}|"\s*\$\d|'\s*\$\d/;

/**
 * A simpler, broader sweep: any string- or template-literal that puts a
 * `$` glyph next to a JS expression (`${ ... }`) inside a .tsx file is
 * very likely formatting a dollar amount. We use this as the primary
 * guard - it's a regression test, false positives are easy to fix by
 * renaming the variable; missing a real regression is what we care
 * about.
 */
const DOLLAR_INTERPOLATION_RE = /\$\$\{[^}]+\}/;

function lines(src: string): string[] {
  return src.split(/\r?\n/);
}

/**
 * Scan a .tsx file for JSX text that would render a dollar amount.
 * Returns the offending lines (1-indexed) or [] if clean.
 */
function findDollarRenders(src: string): Array<{ lineno: number; text: string }> {
  const offenders: Array<{ lineno: number; text: string }> = [];
  lines(src).forEach((line, i) => {
    // Skip pure comments - those don't reach the DOM.
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    if (DOLLAR_INTERPOLATION_RE.test(line) || DOLLAR_AMOUNT_RE.test(line)) {
      offenders.push({ lineno: i + 1, text: line });
    }
  });
  return offenders;
}

describe('#459 scope 2 - end-user views do not render provider USD cost', () => {
  it('Credit Ledger page (/dashboard/billing/ledger) does not render a $ amount', () => {
    const src = read('src/app/(dashboard)/dashboard/billing/ledger/page.tsx');
    const offenders = findDollarRenders(src);
    expect(
      offenders,
      `Credit Ledger page is rendering a dollar amount:\n${offenders
        .map((o) => `  L${o.lineno}: ${o.text.trim()}`)
        .join('\n')}`,
    ).toEqual([]);
  });

  it('Credit Ledger page header no longer references "provider cost"', () => {
    // The specific copy removed by #459 was the
    // "~$X.XXXX provider cost" line next to the headline credits tile.
    // Belt-and-suspenders to the regex check above.
    const src = read('src/app/(dashboard)/dashboard/billing/ledger/page.tsx');
    expect(src.toLowerCase()).not.toContain('provider cost');
  });

  it('API Call Logs tab (/dashboard/activity) does not render a $ amount', () => {
    const src = read('src/app/(dashboard)/dashboard/activity/page.tsx');
    const offenders = findDollarRenders(src);
    expect(
      offenders,
      `Activity page is rendering a dollar amount:\n${offenders
        .map((o) => `  L${o.lineno}: ${o.text.trim()}`)
        .join('\n')}`,
    ).toEqual([]);
  });

  it('API Call Logs tab no longer renders a "Cost" column header or a totalCost stat', () => {
    const src = read('src/app/(dashboard)/dashboard/activity/page.tsx');
    // The previous design rendered <th className="th">Cost</th> and a
    // `totalCost` accumulator. Both must be gone from this page.
    expect(src).not.toMatch(/<th[^>]*>\s*Cost\s*<\/th>/);
    expect(src).not.toMatch(/\btotalCost\b/);
  });
});
