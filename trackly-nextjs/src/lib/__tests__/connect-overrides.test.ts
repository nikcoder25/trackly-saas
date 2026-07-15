/**
 * Self-Serve Connect — public override projection.
 *
 * The snippet is unauthenticated and cross-origin, so the serve route must
 * expose only public-safe fields. These tests pin the allowlist (what's mapped,
 * what's dropped) and the trailing-slash-safe per-path lookup.
 */

import { describe, expect, it } from 'vitest';
import { toPublicOverride, publicOverrideForPath } from '@/lib/connect/overrides';
import type { EdgeSeoOverride } from '@/lib/fix-engine/schema';

const full: EdgeSeoOverride = {
  title: 'T',
  description: 'D',
  canonical: 'https://acme.test/p',
  jsonLd: '{"@type":"Organization"}',
  head: '<meta property="og:title" content="T">', // must NOT be exposed
  indexable: true, // must NOT be exposed
  linkMode: 'inline', // must NOT be exposed
  links: [{ anchor: 'Guide', href: 'https://acme.test/guide' }],
  citations: [{ anchor: 'FDA', href: 'https://fda.gov/x', source: 'FDA' }],
  citable: { tldr: 'Summary', passages: ['A fact.'] },
  faq: { faqs: [{ question: 'Q?', answer: 'A.' }] },
  freshness: { update: 'Fresh.', label: 'Updated:' },
};

describe('toPublicOverride', () => {
  it('maps public fields and renames description → metaDescription', () => {
    const pub = toPublicOverride(full);
    expect(pub).toEqual({
      title: 'T',
      metaDescription: 'D',
      canonical: 'https://acme.test/p',
      jsonLd: '{"@type":"Organization"}',
      links: [{ anchor: 'Guide', href: 'https://acme.test/guide' }],
      citations: [{ anchor: 'FDA', href: 'https://fda.gov/x', source: 'FDA' }],
      citable: { tldr: 'Summary', passages: ['A fact.'] },
      faq: { faqs: [{ question: 'Q?', answer: 'A.' }] },
      freshness: { update: 'Fresh.', label: 'Updated:' },
    });
  });

  it('never leaks head, indexable, or linkMode', () => {
    const pub = toPublicOverride(full) as Record<string, unknown>;
    expect(pub.head).toBeUndefined();
    expect(pub.indexable).toBeUndefined();
    expect(pub.linkMode).toBeUndefined();
    expect(pub.description).toBeUndefined(); // renamed, not passed through
  });

  it('omits empty collections and absent fields', () => {
    expect(toPublicOverride({ title: 'Only title' })).toEqual({ title: 'Only title' });
    expect(toPublicOverride({ links: [], citations: [] })).toEqual({});
    expect(toPublicOverride({ indexable: true })).toEqual({}); // only non-public field → empty
  });
});

describe('publicOverrideForPath', () => {
  const overrides: Record<string, EdgeSeoOverride> = {
    '/about': { title: 'About', citations: [{ anchor: 'FDA', href: 'https://fda.gov/x' }] },
    '/pricing': { indexable: true }, // only a non-public field
  };

  it('returns the projected override for a matching path', () => {
    expect(publicOverrideForPath(overrides, '/about')).toEqual({
      title: 'About',
      citations: [{ anchor: 'FDA', href: 'https://fda.gov/x' }],
    });
  });

  it('is trailing-slash-safe and accepts a full URL as the path', () => {
    expect(publicOverrideForPath(overrides, '/about/')).toEqual(publicOverrideForPath(overrides, '/about'));
    expect(publicOverrideForPath(overrides, 'https://acme.test/about?q=1')).toEqual(publicOverrideForPath(overrides, '/about'));
  });

  it('returns null for an unknown path', () => {
    expect(publicOverrideForPath(overrides, '/nope')).toBeNull();
  });

  it('returns null when a path has only non-public fields', () => {
    // /pricing carries only `indexable`, which the allowlist drops.
    expect(publicOverrideForPath(overrides, '/pricing')).toBeNull();
  });
});
