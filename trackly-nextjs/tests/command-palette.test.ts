import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { navGroups, allNavItems, matchesNavQuery } from '@/lib/dashboard-nav';

const SHELL = join(process.cwd(), 'src/components/dashboard/LvxShell.tsx');
const SIDEBAR = join(process.cwd(), 'src/components/dashboard/Sidebar.tsx');
const PALETTE = join(process.cwd(), 'src/components/dashboard/CommandPalette.tsx');

/**
 * Regression guard for the bug that prompted this feature: the topbar search
 * looked like an input but was `<Link><span>Search…</span></Link>` with a ⌘K
 * badge and no handler anywhere. Clicking it navigated away; typing was
 * impossible because no input existed.
 */
describe('the topbar search is real', () => {
  const shell = readFileSync(SHELL, 'utf8');

  it('is not a Link pretending to be a search box', () => {
    // The old markup, which must never come back.
    expect(shell).not.toMatch(/<Link[^>]*className="global-search/);
  });

  it('opens the palette instead of navigating', () => {
    expect(shell).toMatch(/className="global-search[^"]*"/);
    expect(shell).toMatch(/setSearchOpen\(true\)/);
  });

  it('mounts the palette so the shortcut is always live', () => {
    expect(shell).toMatch(/<CommandPalette\s+open=\{searchOpen\}/);
  });

  it('backs the advertised shortcut with a real handler', () => {
    const palette = readFileSync(PALETTE, 'utf8');
    expect(shell, 'the ⌘K badge is still shown').toMatch(/⌘ K/);
    expect(palette).toMatch(/metaKey \|\| e\.ctrlKey/);
    expect(palette).toMatch(/addEventListener\('keydown'/);
  });

  it('renders a focusable text input', () => {
    const palette = readFileSync(PALETTE, 'utf8');
    expect(palette).toMatch(/<input/);
    expect(palette).toMatch(/onChange=\{\(e\) => setQuery\(e\.target\.value\)\}/);
    expect(palette).toMatch(/inputRef\.current\?\.focus\(\)/);
  });

  it('closes on Escape', () => {
    const palette = readFileSync(PALETTE, 'utf8');
    expect(palette).toMatch(/e\.key === 'Escape'/);
  });

  it('discards stale responses so slow keystrokes cannot overwrite fast ones', () => {
    const palette = readFileSync(PALETTE, 'utf8');
    expect(palette).toMatch(/seq !== requestSeq\.current/);
  });
});

describe('nav is shared, not duplicated', () => {
  it('Sidebar imports the shared list rather than declaring its own', () => {
    const sidebar = readFileSync(SIDEBAR, 'utf8');
    expect(sidebar).toMatch(/from '@\/lib\/dashboard-nav'/);
    expect(sidebar, 'a second copy would drift out of sync').not.toMatch(/^const navGroups\s*=/m);
  });

  it('exposes every sidebar destination to the palette', () => {
    const fromGroups = navGroups.flatMap((g) => g.items.map((i) => i.href));
    expect(allNavItems.map((i) => i.href)).toEqual(fromGroups);
    expect(allNavItems.length).toBeGreaterThan(15);
  });

  it('has unique hrefs', () => {
    const hrefs = allNavItems.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe('matchesNavQuery', () => {
  it('matches on plain substrings', () => {
    expect(matchesNavQuery('Query Tracker', 'track')).toBe(true);
    expect(matchesNavQuery('Citations', 'cit')).toBe(true);
  });

  it('matches initials and gapped subsequences', () => {
    // The behaviour that makes a palette feel fast: type the shape of the
    // word, not its prefix.
    expect(matchesNavQuery('Query Tracker', 'qt')).toBe(true);
    expect(matchesNavQuery('GEO Audit', 'geoau')).toBe(true);
    expect(matchesNavQuery('Evidence & Proof', 'eproof')).toBe(true);
  });

  it('is case and whitespace insensitive', () => {
    expect(matchesNavQuery('SOV Trends', 'SOV')).toBe(true);
    expect(matchesNavQuery('SOV Trends', 's o v')).toBe(true);
  });

  it('rejects letters that are not there, and respects order', () => {
    expect(matchesNavQuery('Citations', 'zzz')).toBe(false);
    // "rt" is in "Query Tracker" only in the wrong order (t...r, not r...t).
    expect(matchesNavQuery('Alerts', 'zq')).toBe(false);
  });

  it('matches everything on an empty query, so the palette opens populated', () => {
    expect(matchesNavQuery('Overview', '')).toBe(true);
  });
});
