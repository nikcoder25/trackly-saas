/**
 * Self-Serve Connect — client snippet render + bundle.
 *
 * @vitest-environment jsdom
 *
 * The render functions are the single source of truth: unit-tested here against
 * a real DOM AND serialized verbatim into /c.js. We prove they set the head
 * fields and append every block once (single-inject guard), reusing the SAME
 * edge renderers; and that buildConnectSnippet wires them to the serve +
 * heartbeat endpoints.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { applyOverride, esc, buildConnectSnippet, snippetTag } from '@/lib/connect/snippet';
import type { PublicOverride } from '@/lib/connect/overrides';

const override: PublicOverride = {
  title: 'New Title',
  metaDescription: 'New meta description',
  canonical: 'https://acme.test/p',
  jsonLd: '{"@type":"Organization","name":"Acme"}',
  links: [{ anchor: 'Guide', href: 'https://acme.test/guide' }],
  citations: [{ anchor: 'FDA', href: 'https://fda.gov/x', source: 'FDA' }],
  citable: { tldr: 'Acme makes peptides.', passages: ['Founded 2019.'] },
  faq: { faqs: [{ question: 'Is it safe?', answer: 'Yes.' }] },
  freshness: { update: 'Reviewed for 2026.', label: 'Updated July 2026:' },
};

beforeEach(() => {
  document.title = 'Original';
  document.head.innerHTML = '';
  document.body.innerHTML = '<main><p>Body</p></main>';
});

describe('applyOverride — head fields', () => {
  it('sets title, upserts meta description + canonical, injects JSON-LD', () => {
    applyOverride(document, override, esc);
    expect(document.title).toBe('New Title');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('New meta description');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://acme.test/p');
    const ld = document.querySelector('script[data-livesov="schema"]');
    expect(ld?.getAttribute('type')).toBe('application/ld+json');
    expect(ld?.textContent).toBe('{"@type":"Organization","name":"Acme"}');
  });

  it('updates an EXISTING meta description / canonical rather than duplicating', () => {
    document.head.innerHTML = '<meta name="description" content="old"><link rel="canonical" href="https://acme.test/old">';
    applyOverride(document, override, esc);
    expect(document.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('New meta description');
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://acme.test/p');
  });
});

describe('applyOverride — appended blocks', () => {
  it('appends all five blocks into the semantic container with their markers', () => {
    applyOverride(document, override, esc);
    const main = document.querySelector('main')!;
    for (const marker of ['internal-links', 'citations', 'citable', 'faq', 'freshness']) {
      const el = main.querySelector('[data-livesov="' + marker + '"]');
      expect(el, marker).toBeTruthy();
    }
    // Reuses the edge renderers → same markup (e.g. the Related-links nav class).
    expect(main.querySelector('nav.livesov-related')).toBeTruthy();
    expect(main.querySelector('section.livesov-faq')).toBeTruthy();
    expect(main.querySelector('div.lvx-fresh')).toBeTruthy();
  });

  it('single-inject guard: re-applying does not duplicate any block or the JSON-LD', () => {
    applyOverride(document, override, esc);
    applyOverride(document, override, esc);
    for (const marker of ['internal-links', 'citations', 'citable', 'faq', 'freshness']) {
      expect(document.querySelectorAll('[data-livesov="' + marker + '"]'), marker).toHaveLength(1);
    }
    expect(document.querySelectorAll('script[data-livesov="schema"]')).toHaveLength(1);
  });

  it('falls back to <body> when there is no semantic container', () => {
    document.body.innerHTML = '<div>no semantic wrapper</div>';
    applyOverride(document, { citable: { tldr: 'T', passages: ['f'] } }, esc);
    expect(document.body.querySelector('[data-livesov="citable"]')).toBeTruthy();
  });

  it('html-escapes injected values (no markup breakout)', () => {
    applyOverride(document, { citable: { tldr: 'A & <b>x</b>', passages: ['1 < 2'] } }, esc);
    const sec = document.querySelector('[data-livesov="citable"]')!;
    expect(sec.querySelector('b')).toBeNull(); // the <b> was escaped, not parsed
    expect(sec.textContent).toContain('A & <b>x</b>');
  });
});

describe('snippetTag', () => {
  it('builds the exact one-liner with the public key and absolute src', () => {
    expect(snippetTag('lvx_abc', 'https://livesov.com')).toBe(
      '<script async src="https://livesov.com/c.js" data-livesov="lvx_abc"></script>',
    );
  });
});

describe('buildConnectSnippet', () => {
  const js = buildConnectSnippet('https://livesov.com');

  it('reads its own data-livesov key and the current path', () => {
    expect(js).toContain("document.querySelector('script[data-livesov]')");
    expect(js).toContain("getAttribute('data-livesov')");
    expect(js).toContain('location.pathname');
  });

  it('embeds the shared renderers and the applyOverride pipeline', () => {
    expect(js).toContain('var relatedLinksNav =');
    expect(js).toContain('var citationsNav =');
    expect(js).toContain('var citableSection =');
    expect(js).toContain('var faqSection =');
    expect(js).toContain('var freshnessSection =');
    expect(js).toContain('var applyOverride =');
    expect(js).toContain('applyOverride(document, d.override, esc)');
  });

  it('fetches the serve route and pings the heartbeat with the absolute base', () => {
    expect(js).toContain("fetch(BASE + '/api/connect/serve?key='");
    expect(js).toContain("BASE + '/api/connect/' + encodeURIComponent(key) + '/heartbeat'");
    expect(js).toContain('navigator.sendBeacon');
    expect(js).toContain('var BASE = "https://livesov.com"');
  });
});
