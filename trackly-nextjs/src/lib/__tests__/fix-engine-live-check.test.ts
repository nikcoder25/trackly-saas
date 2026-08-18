/**
 * Fix Engine - live page verification.
 *
 * The feature exists because "SHIPPED" was not evidence: a fix whose CMS
 * write silently didn't reach the page looked identical to one that
 * worked, and the two modules most likely to hit that (ctr-rescue,
 * striking-distance) only ever rechecked GSC metrics, which cannot answer
 * the question at all.
 *
 * These tests pin the two things that make the answer trustworthy: the
 * right strings are looked for (from what SHIPPED, not what was drafted),
 * and a check only passes when the value is genuinely on the page.
 */

import { describe, expect, it } from 'vitest';
import {
  describeLiveChecks, runCheck, distinctiveSlice, textOf,
  type LiveCheck,
} from '@/lib/fix-engine/live-check';

const fix = (over: Partial<Parameters<typeof describeLiveChecks>[0]>) => ({
  moduleKey: 'title-rewrite', targetUrl: 'https://acme.test/p',
  generated: null, afterSnapshot: null, ...over,
});

describe('describeLiveChecks — what to look for', () => {
  it('checks BOTH the title and meta description for ctr-rescue', () => {
    // The module writes both, and used to verify neither: its recheck only
    // asked GSC whether CTR moved.
    const checks = describeLiveChecks(fix({
      moduleKey: 'ctr-rescue',
      generated: { title: 'New Title', description: 'New meta' },
      afterSnapshot: { title: 'New Title', description: 'New meta' },
    }));
    expect(checks.map((c) => c.kind)).toEqual(['title', 'meta-description']);
    expect(checks[0].expected).toBe('New Title');
    expect(checks[1].expected).toBe('New meta');
  });

  it('prefers the SHIPPED value over the drafted one', () => {
    // A draft edited between generate and ship must be verified against
    // what actually went out, or an edit reads as a failed publish.
    const checks = describeLiveChecks(fix({
      moduleKey: 'title-rewrite',
      generated: { title: 'Drafted' },
      afterSnapshot: { title: 'Edited before shipping' },
    }));
    expect(checks[0].expected).toBe('Edited before shipping');
  });

  it('falls back to the draft when ship recorded no snapshot', () => {
    const checks = describeLiveChecks(fix({ moduleKey: 'title-rewrite', generated: { title: 'Drafted' } }));
    expect(checks[0].expected).toBe('Drafted');
  });

  it('checks the title and the appended section for striking-distance', () => {
    const checks = describeLiveChecks(fix({
      moduleKey: 'striking-distance',
      generated: { title: 'T', sectionHeading: 'How much does a survey cost in Boise' },
      afterSnapshot: { title: 'T' },
    }));
    expect(checks.map((c) => c.kind)).toEqual(['title', 'body-contains']);
    expect(checks[1].expected).toContain('How much does a survey cost');
  });

  it('points file checks at the site root, not the fix target page', () => {
    const checks = describeLiveChecks(fix({ moduleKey: 'robots-ai-access', targetUrl: 'https://acme.test/deep/page' }));
    expect(checks[0].url).toBe('https://acme.test/robots.txt');
    expect(checks[0].expected).toBe('GPTBot');
  });

  it('returns nothing for a module whose output is not on the page', () => {
    // Reported as 'unsupported' rather than invented - a check that passes
    // or fails for the wrong reason is worse than no check.
    expect(describeLiveChecks(fix({ moduleKey: 'search-decay', generated: { primaryCause: 'stale_content' } }))).toEqual([]);
  });

  it('skips a body check when there is no distinctive text to look for', () => {
    expect(describeLiveChecks(fix({ moduleKey: 'passage-rewrite', afterSnapshot: { rewritten: 'too short' } }))).toEqual([]);
  });
});

describe('runCheck — reading the live page', () => {
  const check = (over: Partial<LiveCheck>): LiveCheck =>
    ({ label: 'l', kind: 'title', expected: 'x', ...over }) as LiveCheck;

  it('confirms a title that matches, ignoring whitespace and case', () => {
    const r = runCheck(check({ kind: 'title', expected: 'My New Title' }), '<html><head><title>  my new   title </title></head></html>');
    expect(r.found).toBe(true);
  });

  it('reports the title actually on the page when it does not match', () => {
    const r = runCheck(check({ kind: 'title', expected: 'My New Title' }), '<title>The Old Title</title>');
    expect(r.found).toBe(false);
    expect(r.actual).toBe('The Old Title');
  });

  it('does not pass a title check on a page with no title at all', () => {
    const r = runCheck(check({ kind: 'title', expected: 'My New Title' }), '<html><body>hi</body></html>');
    expect(r.found).toBe(false);
    expect(r.actual).toBeNull();
  });

  it('reads a meta description in either attribute order', () => {
    expect(runCheck(check({ kind: 'meta-description', expected: 'Desc here' }), '<meta name="description" content="Desc here">').found).toBe(true);
    expect(runCheck(check({ kind: 'meta-description', expected: 'Desc here' }), '<meta content="Desc here" name="description">').found).toBe(true);
  });

  it('treats a canonical as matching regardless of a trailing slash', () => {
    const r = runCheck(check({ kind: 'canonical', expected: 'https://acme.test/p' }), '<link rel="canonical" href="https://acme.test/p/">');
    expect(r.found).toBe(true);
  });

  it('finds appended body content through the CMS wrapping it in its own markup', () => {
    const r = runCheck(
      check({ kind: 'body-contains', expected: 'How much does a survey cost' }),
      '<div class="wp-block"><h2 id="x">How much   does a <em>survey</em> cost</h2></div>',
    );
    expect(r.found).toBe(true);
  });

  it('finds a link href that never appears in visible text', () => {
    const r = runCheck(check({ kind: 'body-contains', expected: 'https://acme.test/pricing' }), '<a href="https://acme.test/pricing">see pricing</a>');
    expect(r.found).toBe(true);
  });

  it('does not claim body content that is absent', () => {
    const r = runCheck(check({ kind: 'body-contains', expected: 'How much does a survey cost' }), '<p>Something else entirely</p>');
    expect(r.found).toBe(false);
  });

  it('detects schema by type, including inside an @graph', () => {
    const html = '<script type="application/ld+json">{"@graph":[{"@type":"FAQPage"}]}</script>';
    expect(runCheck(check({ kind: 'jsonld-type', expected: 'FAQPage' }), html).found).toBe(true);
    expect(runCheck(check({ kind: 'jsonld-type', expected: 'Product' }), html).found).toBe(false);
  });

  it('survives a malformed JSON-LD block instead of throwing', () => {
    const html = '<script type="application/ld+json">{ oops </script><script type="application/ld+json">{"@type":"FAQPage"}</script>';
    expect(runCheck(check({ kind: 'jsonld-type', expected: 'FAQPage' }), html).found).toBe(true);
  });

  it('treats a page as indexable only when noindex is gone', () => {
    expect(runCheck(check({ kind: 'indexable', expected: '' }), '<html><head></head></html>').found).toBe(true);
    expect(runCheck(check({ kind: 'indexable', expected: '' }), '<meta name="robots" content="noindex,follow">').found).toBe(false);
  });

  it('requires BOTH og:title and twitter:card for the OG check', () => {
    expect(runCheck(check({ kind: 'og-tags', expected: '' }), '<meta property="og:title" content="T">').found).toBe(false);
    expect(runCheck(check({ kind: 'og-tags', expected: '' }), '<meta property="og:title" content="T"><meta name="twitter:card" content="summary">').found).toBe(true);
  });
});

describe('text helpers', () => {
  it('strips script and style content, not just tags', () => {
    expect(textOf('<style>.a{color:red}</style><script>var x={}</script><p>Real text</p>')).toBe('Real text');
  });

  it('decodes the entities a CMS escapes on save', () => {
    expect(textOf('<p>Tom &amp; Jerry&#39;s &quot;guide&quot;</p>')).toBe('Tom & Jerry\'s "guide"');
  });

  it('cuts a distinctive slice at a word boundary, never mid-word', () => {
    // The user is told to Ctrl+F this exact string, so a half-word would
    // send them looking for something the page does not contain.
    const slice = distinctiveSlice('<h2>How much does a professional land survey cost in Boise Idaho this year</h2>', 40);
    expect(slice.length).toBeLessThanOrEqual(40);
    expect(slice).toBe('How much does a professional land');
    expect(slice.endsWith(' ')).toBe(false);
  });

  it('produces a slice the page actually contains', () => {
    const html = '<h2>How much does a professional land survey cost in Boise</h2>';
    const slice = distinctiveSlice(html, 40);
    expect(runCheck({ label: 'l', kind: 'body-contains', expected: slice }, html).found).toBe(true);
  });

  it('keeps a short value whole rather than trimming it to nothing', () => {
    expect(distinctiveSlice('<p>Short one</p>', 40)).toBe('Short one');
  });
});
