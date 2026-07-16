/**
 * Fix Engine - edge Worker script builder + the related-links nav block it
 * injects. `relatedLinksNav` is the single source of truth: it is both tested
 * directly here AND serialized into the Worker script, so proving it here
 * proves what the edge injects.
 */

import { describe, expect, it } from 'vitest';
import { buildEdgeWorkerScript, relatedLinksNav, citationsNav, citableSection, faqSection, freshnessSection, makeNavAppender, edgePathKey, MAX_EDGE_LINKS, MAX_EDGE_CITATIONS, MAX_EDGE_CITABLE_PASSAGES, MAX_EDGE_FAQS, MAX_EDGE_FRESHNESS_CHARS, EDGE_MARKER_HEADER } from '@/lib/fix-engine/edge-worker';

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
    expect(script).toContain("rw.on('article', appendNav).on('main', appendNav).on('[itemprop=\"articleBody\"]', appendNav).on('footer', appendNav.beforeElement).on('body', appendNav)");
  });

  it('registers a footer fallback so blocks sit ABOVE the footer, not below it', () => {
    // On a page with a <footer> but no semantic container (e.g. a custom-coded
    // site), the block must inject before the footer's START, not before
    // </body> (which is after the footer). makeNavAppender exposes beforeElement
    // for that, sharing the same once-only guard as the end-tag appender.
    expect(script).toContain('beforeElement');
    expect(script).toContain("on('footer', appendNav.beforeElement)");
  });

  it('makeNavAppender.beforeElement injects once, before the element start', () => {
    const ap = makeNavAppender('<b>X</b>');
    let beforeCalls = 0; let endCalls = 0;
    // Simulate the footer handler firing first (document order): it should inject.
    ap.beforeElement.element({
      before: () => { beforeCalls++; },
      onEndTag: () => { /* not used on this path */ },
    } as never);
    // Then the body end-tag handler fires: the shared guard must suppress it.
    ap.element({
      before: () => { /* n/a */ },
      onEndTag: (cb: (end: { before: () => void }) => void) => cb({ before: () => { endCalls++; } }),
    } as never);
    expect(beforeCalls).toBe(1);
    expect(endCalls).toBe(0);
  });

  it('supports an optional inline mode that wraps anchors in the body text', () => {
    expect(script).toContain("o.linkMode === 'inline'");
    expect(script).toContain('indexOf(l.anchor)');
    expect(script).toContain("rw.on('article', wrap).on('main', wrap).on('[itemprop=\"articleBody\"]', wrap)");
  });

  it('caps the injected link list at MAX_EDGE_LINKS', () => {
    expect(script).toContain(`o.links.slice(0, ${MAX_EDGE_LINKS})`);
  });

  it('injects a separate citations block via its own appender with the body fallback', () => {
    expect(script).toContain('Array.isArray(o.citations)');
    expect(script).toContain('const citationsNav =');
    expect(script).toContain('const appendCite = makeNavAppender(citeHtml)');
    expect(script).toContain("rw.on('article', appendCite).on('main', appendCite).on('[itemprop=\"articleBody\"]', appendCite).on('footer', appendCite.beforeElement).on('body', appendCite)");
    expect(script).toContain(`o.citations.slice(0, ${MAX_EDGE_CITATIONS})`);
    // Citations marker survives serialization (quote-insensitive).
    expect(script).toMatch(/class=\\?["']livesov-citations\\?["']/);
    expect(script).toMatch(/data-livesov=\\?["']citations\\?["']/);
  });

  it('injects a separate citable block via its own appender with the body fallback', () => {
    expect(script).toContain('o.citable');
    expect(script).toContain('const citableSection =');
    expect(script).toContain('const citableHtml = citableSection(o.citable, esc)');
    expect(script).toContain('const appendCitable = makeNavAppender(citableHtml)');
    expect(script).toContain("rw.on('article', appendCitable).on('main', appendCitable).on('[itemprop=\"articleBody\"]', appendCitable).on('footer', appendCitable.beforeElement).on('body', appendCitable)");
    // Citable marker survives serialization (quote-insensitive).
    expect(script).toMatch(/class=\\?["']livesov-citable\\?["']/);
    expect(script).toMatch(/data-livesov=\\?["']citable\\?["']/);
  });

  it('injects a separate FAQ block via its own appender with the body fallback', () => {
    expect(script).toContain('o.faq');
    expect(script).toContain('const faqSection =');
    expect(script).toContain('const faqHtml = faqSection(o.faq, esc)');
    expect(script).toContain('const appendFaq = makeNavAppender(faqHtml)');
    expect(script).toContain("rw.on('article', appendFaq).on('main', appendFaq).on('[itemprop=\"articleBody\"]', appendFaq).on('footer', appendFaq.beforeElement).on('body', appendFaq)");
    // FAQ marker survives serialization (quote-insensitive).
    expect(script).toMatch(/class=\\?["']livesov-faq\\?["']/);
    expect(script).toMatch(/data-livesov=\\?["']faq\\?["']/);
  });

  it('injects a separate freshness block via its own appender with the body fallback', () => {
    expect(script).toContain('o.freshness');
    expect(script).toContain('const freshnessSection =');
    expect(script).toContain('const freshHtml = freshnessSection(o.freshness, esc)');
    expect(script).toContain('const appendFresh = makeNavAppender(freshHtml)');
    expect(script).toContain("rw.on('article', appendFresh).on('main', appendFresh).on('[itemprop=\"articleBody\"]', appendFresh).on('footer', appendFresh.beforeElement).on('body', appendFresh)");
    // Freshness marker survives serialization (quote-insensitive).
    expect(script).toMatch(/class=\\?["']lvx-fresh\\?["']/);
    expect(script).toMatch(/data-livesov=\\?["']freshness\\?["']/);
  });
});

describe('citationsNav', () => {
  it('renders a Sources nav with rel="noopener" (not nofollow) and the source label', () => {
    const html = citationsNav([{ anchor: 'FDA label', href: 'https://fda.gov/x', source: 'FDA' }], esc);
    expect(html).toBe(
      '<nav class="livesov-citations" data-livesov="citations"><ul>'
      + '<li><a href="https://fda.gov/x" rel="noopener" target="_blank">FDA label</a> — FDA</li></ul></nav>',
    );
    expect(html).not.toContain('nofollow');
  });

  it('html-escapes anchor, href, and source', () => {
    const html = citationsNav([{ anchor: 'A <b>', href: 'https://x/?a=1&"b"', source: 'S&<' }], esc);
    expect(html).toContain('href="https://x/?a=1&amp;&quot;b&quot;"');
    expect(html).toContain('>A &lt;b&gt;</a> — S&amp;&lt;');
    expect(html).not.toContain('<b>');
  });

  it('omits the source label when absent, caps at MAX_EDGE_CITATIONS, empty for none', () => {
    expect(citationsNav([{ anchor: 'X', href: 'https://x/y' }], esc)).toContain('>X</a></li>');
    const many = Array.from({ length: MAX_EDGE_CITATIONS + 3 }, (_, i) => ({ anchor: `S${i}`, href: `https://s${i}.org/x` }));
    expect((citationsNav(many, esc).match(/<li>/g) || []).length).toBe(MAX_EDGE_CITATIONS);
    expect(citationsNav([], esc)).toBe('');
  });
});

describe('citableSection', () => {
  it('renders a Key facts section with a TL;DR lead and a <ul> of passages', () => {
    const html = citableSection(
      { tldr: 'Cagrilintide is a long-acting amylin analogue.', passages: ['Half-life ~7 days.', 'Given weekly.'] },
      esc,
    );
    expect(html).toBe(
      '<section class="livesov-citable" data-livesov="citable"><h2>Key facts</h2>'
      + '<p><strong>TL;DR:</strong> Cagrilintide is a long-acting amylin analogue.</p>'
      + '<ul><li>Half-life ~7 days.</li><li>Given weekly.</li></ul></section>',
    );
  });

  it('html-escapes the TL;DR and every passage (no markup breakout)', () => {
    const html = citableSection(
      { tldr: 'A & B <x>', passages: ['1 < 2 & "q"', '<script>alert(1)</script>'] },
      esc,
    );
    expect(html).toContain('<strong>TL;DR:</strong> A &amp; B &lt;x&gt;</p>');
    expect(html).toContain('<li>1 &lt; 2 &amp; &quot;q&quot;</li>');
    expect(html).toContain('<li>&lt;script&gt;alert(1)&lt;/script&gt;</li>');
    expect(html).not.toContain('<x>');
    expect(html).not.toContain('<script>');
  });

  it('caps passages at MAX_EDGE_CITABLE_PASSAGES', () => {
    const passages = Array.from({ length: MAX_EDGE_CITABLE_PASSAGES + 4 }, (_, i) => `Fact ${i}`);
    const html = citableSection({ tldr: 'T', passages }, esc);
    expect((html.match(/<li>/g) || []).length).toBe(MAX_EDGE_CITABLE_PASSAGES);
  });

  it('renders TL;DR-only and passages-only variants, empty when neither present', () => {
    expect(citableSection({ tldr: 'Just a summary.' }, esc)).toBe(
      '<section class="livesov-citable" data-livesov="citable"><h2>Key facts</h2>'
      + '<p><strong>TL;DR:</strong> Just a summary.</p></section>',
    );
    expect(citableSection({ passages: ['Only a bullet.'] }, esc)).toBe(
      '<section class="livesov-citable" data-livesov="citable"><h2>Key facts</h2>'
      + '<ul><li>Only a bullet.</li></ul></section>',
    );
    expect(citableSection({ tldr: '   ', passages: ['', '   '] }, esc)).toBe('');
    expect(citableSection({}, esc)).toBe('');
  });
});

describe('faqSection', () => {
  it('renders a visible Q/A list plus a FAQPage JSON-LD script', () => {
    const html = faqSection({ faqs: [{ question: 'Is it safe?', answer: 'Yes, when dosed correctly.' }] }, esc);
    expect(html).toContain('<section class="livesov-faq" data-livesov="faq"><h2>Frequently asked questions</h2>');
    expect(html).toContain('<div class="faq-item"><h3>Is it safe?</h3><p>Yes, when dosed correctly.</p></div>');
    expect(html).toContain('<script type="application/ld+json">');
    // The JSON-LD carries the FAQPage schema built from the same pairs.
    const json = html.slice(html.indexOf('{'), html.lastIndexOf('}') + 1);
    const parsed = JSON.parse(json);
    expect(parsed['@type']).toBe('FAQPage');
    expect(parsed.mainEntity[0]).toEqual({ '@type': 'Question', name: 'Is it safe?', acceptedAnswer: { '@type': 'Answer', text: 'Yes, when dosed correctly.' } });
  });

  it('html-escapes the visible question and answer (no markup breakout)', () => {
    const html = faqSection({ faqs: [{ question: 'A & <b>?', answer: '1 < 2 & "q"' }] }, esc);
    // The VISIBLE block (before the JSON-LD script) is html-escaped. The JSON-LD
    // carries the raw text JSON-encoded — that's the schema.org contract, and
    // the only breakout risk there ("</script>") is escaped (tested below).
    const visible = html.slice(0, html.indexOf('<script'));
    expect(visible).toContain('<h3>A &amp; &lt;b&gt;?</h3>');
    expect(visible).toContain('<p>1 &lt; 2 &amp; &quot;q&quot;</p>');
    expect(visible).not.toContain('<b>?');
  });

  it('escapes </ inside the JSON-LD so an answer cannot break out of the script', () => {
    const html = faqSection({ faqs: [{ question: 'Q', answer: 'text </script><img> more' }] }, esc);
    // The JSON-LD payload (between its braces) must carry the escaped form, so
    // an answer containing "</script>" can't terminate the script early.
    const jsonLd = html.slice(html.indexOf('{'), html.lastIndexOf('}') + 1);
    expect(jsonLd).not.toContain('</script>');
    expect(jsonLd).toContain('<\\/script>');
    expect(JSON.parse(jsonLd).mainEntity[0].acceptedAnswer.text).toBe('text </script><img> more');
  });

  it('caps at MAX_EDGE_FAQS, drops blank pairs, empty for none', () => {
    const many = Array.from({ length: MAX_EDGE_FAQS + 3 }, (_, i) => ({ question: `Q${i}`, answer: `A${i}` }));
    const html = faqSection({ faqs: many }, esc);
    expect((html.match(/faq-item/g) || []).length).toBe(MAX_EDGE_FAQS);
    expect(faqSection({ faqs: [{ question: '  ', answer: 'x' }, { question: 'y', answer: '  ' }] }, esc)).toBe('');
    expect(faqSection({}, esc)).toBe('');
  });
});

describe('freshnessSection', () => {
  it('renders a dated freshness div with the lvx-fresh + livesov markers', () => {
    const html = freshnessSection({ update: 'Reviewed against the latest 2026 guidance.', label: 'Updated July 2026:' }, esc);
    expect(html).toBe(
      '<div class="lvx-fresh" data-livesov="freshness"><strong>Updated July 2026:</strong> '
      + 'Reviewed against the latest 2026 guidance.</div>',
    );
  });

  it('falls back to a plain "Updated:" label when none is carried', () => {
    const html = freshnessSection({ update: 'Still current.' }, esc);
    expect(html).toContain('<strong>Updated:</strong> Still current.');
  });

  it('html-escapes the label and the update text (no markup breakout)', () => {
    const html = freshnessSection({ update: '1 < 2 & "q" <img>', label: 'Updated <b>:' }, esc);
    expect(html).toContain('<strong>Updated &lt;b&gt;:</strong>');
    expect(html).toContain('1 &lt; 2 &amp; &quot;q&quot; &lt;img&gt;');
    expect(html).not.toContain('<img>');
    expect(html).not.toContain('<b>:');
  });

  it('caps the update text at MAX_EDGE_FRESHNESS_CHARS, empty for none', () => {
    // 'Z' as a sentinel — it appears nowhere in the label or the markup, so the
    // match count is exactly the rendered run of update text.
    const long = 'Z'.repeat(MAX_EDGE_FRESHNESS_CHARS + 200);
    const html = freshnessSection({ update: long, label: 'Updated:' }, esc);
    expect((html.match(/Z/g) || []).length).toBe(MAX_EDGE_FRESHNESS_CHARS);
    expect(freshnessSection({ update: '   ' }, esc)).toBe('');
    expect(freshnessSection({}, esc)).toBe('');
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

  it('two independent appenders (internal links + citations) each inject once, no collision', () => {
    // The Worker registers a separate appender per block over the same
    // selectors; each keeps its own guard, so both blocks land in the first
    // container and neither double-injects.
    const links = '<nav class="livesov-related"></nav>';
    const cites = '<nav class="livesov-citations"></nav>';
    const appenders = [makeNavAppender(links), makeNavAppender(cites)];
    const perContainer = new Map<string, Array<(end: { before(html: string, opts: { html: boolean }): void }) => void>>();
    for (const name of ['main', 'body']) {
      const cbs: Array<(end: { before(html: string, opts: { html: boolean }): void }) => void> = [];
      for (const ap of appenders) {
        let stored: ((end: { before(html: string, opts: { html: boolean }): void }) => void) | null = null;
        ap.element({ onEndTag: (cb) => { stored = cb; } });
        cbs.push(stored!);
      }
      perContainer.set(name, cbs);
    }
    const inserts: Array<{ at: string; html: string }> = [];
    for (const name of ['main', 'body']) {
      for (const cb of perContainer.get(name)!) cb({ before: (html) => inserts.push({ at: name, html }) });
    }
    expect(inserts).toEqual([
      { at: 'main', html: links },
      { at: 'main', html: cites },
    ]);
  });

  it('three independent appenders (links + citations + citable) each inject once, body fallback', () => {
    // The Worker registers a separate appender per block. On a page with no
    // semantic container all three fall through to <body> and each injects
    // exactly once, in registration order, with no collision.
    const links = '<nav class="livesov-related"></nav>';
    const cites = '<nav class="livesov-citations"></nav>';
    const citable = '<section class="livesov-citable"></section>';
    const appenders = [makeNavAppender(links), makeNavAppender(cites), makeNavAppender(citable)];
    const cbs: Array<(end: { before(html: string, opts: { html: boolean }): void }) => void> = [];
    for (const ap of appenders) {
      let stored: ((end: { before(html: string, opts: { html: boolean }): void }) => void) | null = null;
      ap.element({ onEndTag: (cb) => { stored = cb; } });
      cbs.push(stored!);
    }
    const inserts: Array<{ at: string; html: string }> = [];
    for (const cb of cbs) cb({ before: (html) => inserts.push({ at: 'body', html }) });
    expect(inserts).toEqual([
      { at: 'body', html: links },
      { at: 'body', html: cites },
      { at: 'body', html: citable },
    ]);
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
