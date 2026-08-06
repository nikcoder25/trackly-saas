import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Regression guard: the dashboard Overview must never render the demo
 * ("Acme PM") figures while the signed-in user's brand data is still loading.
 *
 * The bug: `useOverviewData` returns `null` for the whole window in which the
 * brand fetch is in flight, and `PageOverview` did `const d = data ||
 * buildFallback()`. That made the page paint the sample dashboard - 27.4%
 * Share of Voice, 1,284 mentions, Linear/Asana/Monday competitors - for a few
 * hundred milliseconds on every load before the real numbers replaced them.
 *
 * The fix distinguishes the two states that `buildFallback()` was covering:
 *   - loading (data === null)      -> skeletons
 *   - no brand connected at all    -> sample data, badged "Sample data"
 *
 * We assert against the *source* because the test runner is node (not jsdom)
 * and rendering the page would require mocking auth, brand and run contexts.
 * A structural scan is the low-noise way to catch a re-introduction.
 */

const REPO_ROOT = join(__dirname, '..');
const OVERVIEW = 'src/app/dashboard-v2/pages/overview.tsx';
const BRAND_HOOK = 'src/hooks/useBrandData.ts';

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

/** Drop block and line comments. The docblocks on these components describe
 *  the bug, so they legitimately name the demo values ("Acme PM", 27.4%); it
 *  is the *rendered* output that must not contain them. */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('Overview: no sample-data flash on load', () => {
  const src = read(OVERVIEW);

  it('takes loading and error as explicit signals from the data hook', () => {
    expect(src).toMatch(/const\s*\{\s*data,\s*loading,\s*error:\s*loadError,\s*retry\s*\}\s*=\s*useOverviewData/);
  });

  it('returns a skeleton (not the demo fallback) while loading', () => {
    expect(src).toMatch(/if\s*\(\s*loading\s*\)\s*return\s*<OverviewSkeleton/);

    // The skeleton branch must come before any of the real/fallback rendering,
    // otherwise the demo numbers would still paint first.
    const loadingReturn = src.indexOf('if (loading) return <OverviewSkeleton');
    const pageHead = src.indexOf('<PageHead title={firstName');
    expect(loadingReturn).toBeGreaterThan(-1);
    expect(pageHead).toBeGreaterThan(-1);
    expect(loadingReturn).toBeLessThan(pageHead);
  });

  it('returns a retry state (not the demo fallback) when the load fails', () => {
    // A failed fetch used to fall through to buildFallback(), so a network
    // blip or an expired session left the user looking at Acme PM's numbers
    // indefinitely - worse than the flash, because nothing resolved it.
    expect(src).toMatch(/const\s+loadFailed\s*=\s*!!error\s*&&\s*!brand/);
    expect(src).toMatch(/if\s*\(\s*loading\s*\|\|\s*loadFailed\s*\)\s*return\s+null/);
    expect(src).toMatch(/if\s*\(\s*loadError\s*\)\s*return\s*<OverviewLoadError/);
  });

  it('still keeps buildFallback for the genuine no-brand state', () => {
    // The fallback is intentional for accounts with no brand connected - it is
    // paired with the visible "Sample data" badge. Only the *loading* window
    // was wrong.
    expect(src).toContain('buildFallback()');
    expect(src).toContain('Sample data');
  });

  it('gates the sample-data badge on hasReal, not on the loading state', () => {
    expect(src).toMatch(/!d\.hasReal\s*&&\s*\(/);
  });

  it('defines skeleton and error views that render no demo figures', () => {
    for (const fn of ['function OverviewSkeleton', 'function OverviewLoadError']) {
      const start = src.indexOf(fn);
      expect(start, `${fn} should exist`).toBeGreaterThan(-1);
      // Each is followed by another top-level `function ` declaration.
      const end = src.indexOf('\nfunction ', start + 1);
      const body = stripComments(src.slice(start, end > -1 ? end : undefined));

      // None of the sample values may leak into either non-data view.
      for (const demo of ['Acme', '27.4', '1284', '1,284', 'Linear', 'Asana', 'Monday']) {
        expect(body, `${fn} must not contain "${demo}"`).not.toContain(demo);
      }
    }
  });
});

describe('useBrandData surfaces load failures', () => {
  const src = read(BRAND_HOOK);

  it('merges the brand-list error into the returned error', () => {
    // Without this, a failed /api/brands (401 after a session rotation, or a
    // network error) is indistinguishable from an account that simply has no
    // brands: both are brands:[] + selectedBrand:null. The Overview would then
    // pick the sample dashboard for a signed-in user whose session expired.
    expect(src).toMatch(/error:\s*contextError/);
    expect(src).toMatch(/const\s+error\s*=\s*contextError\s*\|\|\s*fullError/);
  });

  it('clears a prior failure once a retry succeeds', () => {
    const start = src.indexOf('const reload = useCallback');
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf('}, [fullData, brandId', start));
    expect(body).toContain('setFullError(null)');
  });
});
