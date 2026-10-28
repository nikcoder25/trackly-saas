/**
 * Fix Engine - CMS auto-detection fingerprints.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/safe-fetch', () => ({ safeFetch: fetchMock }));

import { detectBuilder, detectCms } from '@/lib/fix-engine/cms/detect';

function res(status: number, body: string, headers: Record<string, string> = {}) {
  return { status, ok: status >= 200 && status < 300, text: async () => body, headers: new Headers(headers) } as unknown as Response;
}

beforeEach(() => fetchMock.mockReset());

describe('detectCms', () => {
  it('detects WordPress via the REST namespace (high confidence)', async () => {
    fetchMock.mockResolvedValueOnce(res(200, '{"namespaces":["wp/v2"]}')); // /wp-json/
    const d = await detectCms('https://acme.com');
    expect(d).toMatchObject({ cms: 'wordpress', confidence: 'high', hasAdapter: true });
  });

  it('detects Shopify from homepage assets', async () => {
    fetchMock.mockResolvedValueOnce(res(404, 'nope'));                       // /wp-json/
    fetchMock.mockResolvedValueOnce(res(200, '<script src="https://cdn.shopify.com/x.js"></script>')); // /
    const d = await detectCms('https://acme.com');
    expect(d.cms).toBe('shopify');
    expect(d.hasAdapter).toBe(true);
  });

  it('detects Ghost and Webflow from the generator meta', async () => {
    fetchMock.mockResolvedValueOnce(res(404, '')); // wp-json
    fetchMock.mockResolvedValueOnce(res(200, '<meta name="generator" content="Ghost 5.0">'));
    expect((await detectCms('https://blog.com')).cms).toBe('ghost');

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(res(404, ''));
    fetchMock.mockResolvedValueOnce(res(200, '<meta name="generator" content="Webflow">'));
    expect((await detectCms('https://site.com')).cms).toBe('webflow');
  });

  it('detects the generator regardless of attribute order', async () => {
    fetchMock.mockResolvedValueOnce(res(404, ''));
    fetchMock.mockResolvedValueOnce(res(200, '<meta content="Ghost 5.2" name="generator">')); // content before name
    expect((await detectCms('https://blog.com')).cms).toBe('ghost');
  });

  it('returns unknown when nothing matches', async () => {
    fetchMock.mockResolvedValueOnce(res(404, ''));
    fetchMock.mockResolvedValueOnce(res(200, '<html><body>hand-rolled</body></html>'));
    const d = await detectCms('https://custom.com');
    expect(d.cms).toBe('unknown');
    expect(d.hasAdapter).toBe(false);
  });

  it('handles an invalid URL', async () => {
    const d = await detectCms('not a url');
    expect(d.cms).toBe('unknown');
  });
});

/**
 * Which builder renders a WordPress front end decides whether the
 * Application-Password route can edit the site at all, so these fingerprints
 * are what keeps the connect wizard from recommending a path that writes
 * edits nowhere visible.
 */
describe('detectBuilder', () => {
  const cases: Array<[string, string, boolean]> = [
    ['<div class="elementor elementor-142"><section></section></div>', 'elementor', true],
    ['<div id="et-boc"><div class="et_pb_section et_pb_section_0">x</div></div>', 'divi', false],
    ['<div class="vc_row wpb_row"><div class="wpb_wrapper">x</div></div>', 'wpbakery', false],
    ['<div class="fl-builder-content fl-builder-content-12"><div class="fl-node-abc">x</div></div>', 'beaver', true],
    ['<div id="brx-content"><div class="brxe-heading">x</div></div>', 'bricks', true],
    ['<section class="ct-section"><div class="ct-section-inner-wrap">x</div></section>', 'oxygen', true],
    ['<p class="wp-block-paragraph">plain blocks</p>', 'gutenberg', false],
  ];

  for (const [html, builder, needsConnector] of cases) {
    it(`identifies ${builder}`, () => {
      const d = detectBuilder(html);
      expect(d.builder).toBe(builder);
      expect(d.needsConnector).toBe(needsConnector);
    });
  }

  it('reports no builder for a plain theme', () => {
    expect(detectBuilder('<div class="entry-content"><p>hello</p></div>').builder).toBeUndefined();
  });

  it('prefers the real builder over incidental block markup', () => {
    // Builder sites routinely emit wp-block-* classes too (a widget area, a
    // block-based header), so a generic Gutenberg hint must never outrank a
    // definitive builder signature.
    const html = '<div class="elementor elementor-9"><p class="wp-block-paragraph">x</p></div>';
    expect(detectBuilder(html).builder).toBe('elementor');
    expect(detectBuilder(html).needsConnector).toBe(true);
  });
});

describe('detectCms + builder', () => {
  it('flags an Elementor site as needing the Connector plugin', async () => {
    fetchMock.mockResolvedValueOnce(res(200, '{"namespaces":["wp/v2"]}'));            // /wp-json/
    fetchMock.mockResolvedValueOnce(res(200, '<div class="elementor elementor-7"></div>')); // homepage
    const d = await detectCms('https://hvac.com');
    expect(d.cms).toBe('wordpress');
    expect(d.builder).toBe('elementor');
    expect(d.needsConnector).toBe(true);
    expect(d.signals).toContain('builder:elementor');
  });

  it('leaves a plain WordPress site on the one-click path', async () => {
    fetchMock.mockResolvedValueOnce(res(200, '{"namespaces":["wp/v2"]}'));
    fetchMock.mockResolvedValueOnce(res(200, '<div class="entry-content"><p>hi</p></div>'));
    const d = await detectCms('https://plain.com');
    expect(d.cms).toBe('wordpress');
    expect(d.needsConnector).toBe(false);
  });

  it('still reports WordPress when the homepage cannot be fetched', async () => {
    fetchMock.mockResolvedValueOnce(res(200, '{"namespaces":["wp/v2"]}'));
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    const d = await detectCms('https://slow.com');
    expect(d.cms).toBe('wordpress');
    expect(d.hasAdapter).toBe(true);
    expect(d.builder).toBeUndefined();
  });

  it('does not look for a builder on non-WordPress platforms', async () => {
    fetchMock.mockResolvedValueOnce(res(404, ''));
    fetchMock.mockResolvedValueOnce(res(200, '<div class="ct-section">cdn.shopify.com</div>'));
    const d = await detectCms('https://shop.com');
    expect(d.cms).toBe('shopify');
    expect(d.builder).toBeUndefined();
  });
});
