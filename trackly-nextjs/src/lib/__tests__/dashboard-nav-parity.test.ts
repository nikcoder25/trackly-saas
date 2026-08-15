/**
 * Parity between the two navigation lists.
 *
 * The app has two: the hard-coded `NAV` in components/dashboard/LvxShell.tsx
 * renders the visible sidebar, and `navGroups` in lib/dashboard-nav.ts feeds
 * the command palette. Nothing linked them, so Fan-out Queries and AI
 * Volatility shipped in the palette list only and were reachable in the UI
 * exclusively by typing the URL - the pages existed, with no way to click to
 * them.
 *
 * This reads LvxShell's source rather than importing it, because the module
 * is a client component that pulls in contexts, CSS and Next navigation. The
 * goal is only to compare two lists of hrefs, and a regex over the source is
 * a far cheaper way to get that than standing up a React environment.
 *
 * If this fails, add the route to BOTH lists - and to LvxShell's
 * THEMED_ROUTES when the page renders its own `.lvx` layout.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { allNavItems } from '../dashboard-nav';

const SHELL = path.join(process.cwd(), 'src/components/dashboard/LvxShell.tsx');
const source = fs.readFileSync(SHELL, 'utf8');

/** Pull the href of every nav entry out of LvxShell's NAV literal. */
function shellNavHrefs(): string[] {
  const navBlock = source.slice(source.indexOf('const NAV'), source.indexOf('const ALL_ITEMS'));
  return [...navBlock.matchAll(/href:\s*'([^']+)'/g)].map(m => m[1]);
}

/** Routes LvxShell treats as owning their own `.lvx` padding. */
function themedRoutes(): string[] {
  const start = source.indexOf('const THEMED_ROUTES');
  const block = source.slice(start, source.indexOf(']);', start));
  return [...block.matchAll(/'([^']+)'/g)].map(m => m[1]);
}

describe('sidebar / command-palette parity', () => {
  it('finds both nav lists', () => {
    expect(shellNavHrefs().length).toBeGreaterThan(10);
    expect(allNavItems.length).toBeGreaterThan(10);
  });

  it('every sidebar destination is reachable from the command palette', () => {
    const palette = new Set(allNavItems.map(i => i.href));
    const missing = shellNavHrefs().filter(h => !palette.has(h));
    expect(missing, `in the sidebar but not the palette: ${missing.join(', ')}`).toEqual([]);
  });

  it('every command-palette destination is in the sidebar', () => {
    // The direction that actually bit us: a page in the palette but not the
    // sidebar looks shipped and is effectively unreachable.
    const shell = new Set(shellNavHrefs());
    const missing = allNavItems.map(i => i.href).filter(h => !shell.has(h));
    expect(missing, `in the palette but not the sidebar: ${missing.join(', ')}`).toEqual([]);
  });

  it('keeps the pages added for this work reachable', () => {
    const shell = new Set(shellNavHrefs());
    const palette = new Set(allNavItems.map(i => i.href));
    for (const href of ['/dashboard/fanout', '/dashboard/volatility']) {
      expect(shell.has(href), `${href} missing from the sidebar`).toBe(true);
      expect(palette.has(href), `${href} missing from the palette`).toBe(true);
    }
  });

  it('registers the new pages as themed so they are not double-padded', () => {
    const themed = new Set(themedRoutes());
    expect(themed.has('/dashboard/fanout')).toBe(true);
    expect(themed.has('/dashboard/volatility')).toBe(true);
  });
});
