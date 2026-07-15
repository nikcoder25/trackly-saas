/**
 * Fix Engine - edge Worker script builder + the related-links nav block it
 * injects. `relatedLinksNav` is the single source of truth: it is both tested
 * directly here AND serialized into the Worker script, so proving it here
 * proves what the edge injects.
 */

import { describe, expect, it } from 'vitest';
import { buildEdgeWorkerScript, relatedLinksNav, MAX_EDGE_LINKS, EDGE_MARKER_HEADER } from '@/lib/fix-engine/edge-worker';

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

  it('appends the nav before the end of the first article/main/articleBody via onEndTag', () => {
    expect(script).toContain('Array.isArray(o.links)');
    expect(script).toContain('onEndTag');
    expect(script).toContain("rw.on('article', appendNav).on('main', appendNav).on('[itemprop=\"articleBody\"]', appendNav)");
    // First-container guard so exactly one nav is injected.
    expect(script).toContain('let injected = false');
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
