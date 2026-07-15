/**
 * Fix Engine - edge Worker script builder + the related-links nav block it
 * injects. `relatedLinksNav` is the single source of truth: it is both tested
 * directly here AND serialized into the Worker script, so proving it here
 * proves what the edge injects.
 */

import { describe, expect, it } from 'vitest';
import { buildEdgeWorkerScript, relatedLinksNav, makeNavAppender, edgePathKey, MAX_EDGE_LINKS, EDGE_MARKER_HEADER } from '@/lib/fix-engine/edge-worker';

// Same escaper the Worker defines inline (& < > ").
const esc = (s: string) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

describe('relatedLinksNav', () => {
  it('renders the Related-links nav block with the livesov marker attributes', () => {
    const html = relatedLinksNav([{ anchor: 'Pricing', href: 'https://a.com/pricing' }], esc);
    expect(html).toBe(
      '<nav class="livesov-related" data-livesov="internal-links">'
      + '<ul><li><a href="https://a.com/pricing">Pricing</a></li></ul></nav>',
    );
  });

  it('html-escapes anchor, href, and rel (no markup breakout)', () => {
    const html = relatedLinksNav(
      [{ anchor: 'A & B <x>', href: 'https://a.com/?q=1&"y"', rel: 'no"follow' }],
      esc,
    );
    expect(html).toContain('href="https://a.com/?q=1&amp;&quot;y&quot;"');
    expect(html).toContain('rel="no&quot;follow"');
    expect(html).toContain('>A &amp; B &lt;x&gt;<');
    expect(html).not.toContain('<x>');
  });

  it('caps at MAX_EDGE_LINKS and skips entries missing an anchor or href', () => {
    const many = Array.from({ length: MAX_EDGE_LINKS + 4 }, (_, i) => ({ anchor: `A${i}`, href: `https://a.com/p${i}` }));
    const html = relatedLinksNav([...many, { anchor: '', href: 'https://a.com/x' }], esc);
    expect((html.match(/<li>/g) || []).length).toBe(MAX_EDGE_LINKS);
  });

  it('returns empty string when there are no valid links (Worker injects nothing)', () => {
    expect(relatedLinksNav([], esc)).toBe('');
    expect(relatedLinksNav([{ anchor: 'x', href: '' }], esc)).toBe('');
  });
});

describe('buildEdgeWorkerScript body injection', () => {
  const script = buildEdgeWorkerScript('tok-123', 'https://livesov.com/api/edge/serve');

  it('still stamps the marker header and keeps the head-rewriting logic', () => {
    expect(script).toContain(EDGE_MARKER_HEADER);
    expect(script).toContain("rw.on('title'");
    expect(script).toContain("rw.on('link[rel=\"canonical\"]'");
    expect(script).toContain("rw.on('head'");
  });

  it('embeds the related-links nav builder as the single source of truth', () => {
    expect(script).toContain('const relatedLinksNav =');
    expect(script).toContain('relatedLinksNav(L, esc)');
    // The nav marker survives serialization (transpilers may escape the inner
    // quotes, so match quote-insensitively).
    expect(script).toMatch(/class=\\?["']livesov-related\\?["']/);
    expect(script).toMatch(/data-livesov=\\?["']internal-links\\?["']/);
  });

  it('appends the nav via onEndTag on article/main/articleBody, then body as a fallback', () => {
    expect(script).toContain('Array.isArray(o.links)');
    expect(script).toContain('onEndTag');
    expect(script).toContain('const makeNavAppender =');
    expect(script).toContain('const appendNav = makeNavAppender(navHtml)');
    // body is registered LAST so its end tag (which closes after any semantic
    // container) only fires the shared appender when none matched.
    expect(script).toContain("rw.on('article', appendNav).on('main', appendNav).on('[itemprop=\"articleBody\"]', appendNav).on('body', appendNav)");
  });

  it('supports an optional inline mode that wraps anchors in the body text', () => {
    expect(script).toContain("o.linkMode === 'inline'");
    expect(script).toContain('indexOf(l.anchor)');
    expect(script).toContain("rw.on('article', wrap).on('main', wrap).on('[itemprop=\"articleBody\"]', wrap)");
  });

  it('caps the injected link list at MAX_EDGE_LINKS', () => {
    expect(script).toContain(`o.links.slice(0, ${MAX_EDGE_LINKS})`);
  });
});

/**
 * Faithful, HTMLRewriter-free exercise of the nav appender. A single appender
 * is registered on every selector (shared closure); each matched container
 * registers an onEndTag callback, and callbacks fire in the order the end tags
 * CLOSE. body always closes last. `run` returns where the nav was injected.
 */
function run(appender: { element(e: { onEndTag(cb: (end: { before(html: string, opts: { html: boolean }): void }) => void): void }): void }, closeOrder: string[]) {
  const cbs = new Map<string, (end: { before(html: string, opts: { html: boolean }): void }) => void>();
  for (const name of closeOrder) {
    let stored: ((end: { before(html: string, opts: { html: boolean }): void }) => void) | null = null;
    appender.element({ onEndTag: (cb) => { stored = cb; } });
    cbs.set(name, stored!);
  }
  const inserts: Array<{ at: string; html: string }> = [];
  for (const name of closeOrder) {
    cbs.get(name)!({ before: (html) => inserts.push({ at: name, html }) });
  }
  return inserts;
}

describe('makeNavAppender (single-injection + body fallback)', () => {
  const NAV = '<nav class="livesov-related"></nav>';

  it('injects into <body> when no semantic container exists', () => {
    const inserts = run(makeNavAppender(NAV), ['body']);
    expect(inserts).toEqual([{ at: 'body', html: NAV }]);
  });

  it('injects exactly once, into the semantic container, when one exists (body is skipped)', () => {
    // <main><article>…</article></main><body> → article closes first, body last.
    const inserts = run(makeNavAppender(NAV), ['article', 'main', 'body']);
    expect(inserts).toEqual([{ at: 'article', html: NAV }]);
  });

  it('never double-injects across multiple matching containers', () => {
    const inserts = run(makeNavAppender(NAV), ['main', 'body']);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].at).toBe('main');
  });
});

describe('edgePathKey (trailing-slash normalization)', () => {
  it('strips trailing slashes so /p and /p/ share one key; root stays /', () => {
    expect(edgePathKey('/peptides/cagrilintide/')).toBe('/peptides/cagrilintide');
    expect(edgePathKey('/peptides/cagrilintide')).toBe('/peptides/cagrilintide');
    expect(edgePathKey('/')).toBe('/');
    expect(edgePathKey('//')).toBe('/');
    expect(edgePathKey('')).toBe('/');
  });
});
