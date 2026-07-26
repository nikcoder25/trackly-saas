import { describe, expect, it } from 'vitest';
import { alternatives } from '@/data/alternatives';
import {
  COMPETITOR_ROSTER,
  LIVESOV_PROFILE,
  buildShortlist,
} from '@/data/competitor-roster';

// Titles on the "[tool] alternative" pages follow the pattern that wins
// listicle SERPs: a leading number, the year, and a qualifier. This file
// pins that format AND the invariant that makes it honest - a page whose
// title promises seven alternatives must actually contain seven.

const TITLE_RE = /^7 Best .+ Alternatives in 2026 \(Tested\) \| Livesov$/;

describe('alternative page titles', () => {
  it('covers all fifteen competitor pages', () => {
    expect(alternatives).toHaveLength(15);
  });

  for (const alt of alternatives) {
    describe(alt.slug, () => {
      it('uses the number + year + qualifier title format', () => {
        expect(alt.metaTitle).toMatch(TITLE_RE);
      });

      it('names the competitor in the title', () => {
        expect(alt.metaTitle).toContain(alt.name);
      });

      it('keeps the title short enough to avoid SERP truncation', () => {
        // ~60 chars is the usual pixel-width cutoff. The " | Livesov"
        // suffix is the first thing Google drops, so measure without it.
        const withoutBrand = alt.metaTitle.replace(' | Livesov', '');
        expect(withoutBrand.length).toBeLessThanOrEqual(60);
      });
    });
  }

  it('every title is unique', () => {
    const titles = alternatives.map((a) => a.metaTitle);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe('buildShortlist - the list the title promises', () => {
  for (const alt of alternatives) {
    describe(alt.slug, () => {
      const list = buildShortlist(alt.name, 7);

      it('returns exactly seven tools', () => {
        expect(list).toHaveLength(7);
      });

      it('ranks Livesov first', () => {
        expect(list[0].name).toBe(LIVESOV_PROFILE.name);
      });

      it('excludes the page subject - a tool is not its own alternative', () => {
        expect(list.map((t) => t.name)).not.toContain(alt.name);
      });

      it('contains no duplicates', () => {
        const names = list.map((t) => t.name);
        expect(new Set(names).size).toBe(names.length);
      });

      it('gives every tool a blurb and an honest "best for" line', () => {
        for (const tool of list) {
          expect(tool.blurb.length).toBeGreaterThan(30);
          expect(tool.bestFor.length).toBeGreaterThan(20);
        }
      });
    });
  }

  it('is deterministic across calls (stable static build output)', () => {
    for (const alt of alternatives) {
      expect(buildShortlist(alt.name, 7)).toEqual(buildShortlist(alt.name, 7));
    }
  });

  it('does not publish the same six rivals on every page', () => {
    // Nine identical lists would read as templated boilerplate. Each page
    // must surface a distinct set of competitors.
    const signatures = alternatives.map((a) =>
      buildShortlist(a.name, 7).map((t) => t.name).join('|'),
    );
    expect(new Set(signatures).size).toBe(alternatives.length);
  });
});

describe('competitor roster hygiene', () => {
  it('never lists Livesov as its own competitor', () => {
    expect(COMPETITOR_ROSTER.map((c) => c.name)).not.toContain('Livesov');
  });

  it('has unique names and domains', () => {
    const names = COMPETITOR_ROSTER.map((c) => c.name);
    const domains = COMPETITOR_ROSTER.map((c) => c.domain);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(domains).size).toBe(domains.length);
  });

  it('holds enough tools to build a seven-item list for any subject', () => {
    expect(COMPETITOR_ROSTER.length).toBeGreaterThanOrEqual(7);
  });

  it('points every alternativeSlug at a real alternative page', () => {
    const slugs = new Set(alternatives.map((a) => a.slug));
    for (const c of COMPETITOR_ROSTER) {
      if (c.alternativeSlug) expect(slugs).toContain(c.alternativeSlug);
    }
  });

  it('gives every alternative page a roster entry so shortlists can cross-link', () => {
    const rosterNames = new Set(COMPETITOR_ROSTER.map((c) => c.name));
    for (const alt of alternatives) {
      expect(rosterNames).toContain(alt.name);
    }
  });
});
