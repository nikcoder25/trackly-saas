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

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

describe('Overview: no sample-data flash on load', () => {
  const src = read(OVERVIEW);

  it('derives an explicit loading flag from the null data hook result', () => {
    expect(src).toMatch(/const\s+loading\s*=\s*data\s*===\s*null/);
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

  it('defines an OverviewSkeleton that renders no demo figures', () => {
    const start = src.indexOf('function OverviewSkeleton');
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf('\nexport function PageOverview', start);
    const body = src.slice(start, end > -1 ? end : undefined);

    // None of the sample values may leak into the loading view.
    for (const demo of ['Acme', '27.4', '1284', '1,284', 'Linear', 'Asana', 'Monday']) {
      expect(body).not.toContain(demo);
    }
  });
});
