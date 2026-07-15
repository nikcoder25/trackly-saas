/**
 * Fix Engine - edge Worker script template (single source of truth).
 *
 * Both surfaces use this builder so the script is always identical:
 *   - the dashboard's copy-paste snippet (Connections → Pair), and
 *   - the one-click Cloudflare API deploy (connections/cloudflare/deploy).
 *
 * Pure string builder — no imports — so it is safe to use from client
 * components and server routes alike.
 */

/** Response header the Worker stamps on every response; the edge adapter
 *  and connect flow probe for it to confirm the Worker is routed. */
export const EDGE_MARKER_HEADER = 'x-livesov-edge';

/** Hard cap on internal links injected into a single page (both the override
 *  builder and the Worker enforce this). Keep in sync with the literal `8`
 *  inside {@link relatedLinksNav} — that function is serialized into the
 *  Worker, so it can't reference this constant at runtime. */
export const MAX_EDGE_LINKS = 8;

/**
 * Canonical per-path override key: strip trailing slashes (the root stays
 * '/'). The single source of truth for path normalization — the override
 * builder keys the map with it and the Worker looks up with it, so a page
 * served at /peptides/cagrilintide/ resolves to a fix stored for
 * /peptides/cagrilintide (and vice-versa). Pure and self-contained so it can
 * be serialized into the Worker.
 */
export function edgePathKey(pathname: string): string {
  const p = String(pathname || '/').replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

/**
 * Build the "Related" internal-links nav block from a per-path override's
 * `links`. Pure, dependency-free, and self-contained: it is BOTH unit-tested
 * directly and serialized (via `.toString()`) into the Worker script below,
 * so the block the tests see is byte-for-byte the block the edge injects.
 *
 * `esc` is the Worker's html-escaper (passed in so the function closes over
 * nothing). Every anchor, href, and rel is escaped; a links list that yields
 * no valid items returns '' so the caller injects nothing.
 */
export function relatedLinksNav(
  links: Array<{ anchor: string; href: string; rel?: string }>,
  esc: (s: string) => string,
): string {
  const items = links
    .slice(0, 8)
    .filter((l) => l && l.anchor && l.href)
    .map((l) => '<li><a href="' + esc(l.href) + '"' + (l.rel ? ' rel="' + esc(l.rel) + '"' : '') + '>' + esc(l.anchor) + '</a></li>')
    .join('');
  return items ? '<nav class="livesov-related" data-livesov="internal-links"><ul>' + items + '</ul></nav>' : '';
}

/** Minimal shapes of the HTMLRewriter element/end-tag the appender touches. */
interface EdgeEndTag { before(content: string, opts: { html: boolean }): void }
interface EdgeElement { onEndTag(cb: (end: EdgeEndTag) => void): void }

/**
 * Build the HTMLRewriter element handler that appends `navHtml` before the END
 * tag of whatever container it is registered on. A single call's closure is
 * shared across every selector it is attached to, and it injects at most once —
 * so registering it on `article`, `main`, `[itemprop="articleBody"]`, and
 * finally `body` makes `body` a true fallback: its end tag closes after any
 * semantic container, so if one existed it already injected and body is
 * skipped; if none did, body catches it. Pure and self-contained (no closure
 * over module scope) so it is serialized verbatim into the Worker.
 */
export function makeNavAppender(navHtml: string): { element(e: EdgeElement): void } {
  let injected = false;
  return {
    element(e) {
      e.onEndTag((end) => {
        if (injected) return;
        injected = true;
        end.before(navHtml, { html: true });
      });
    },
  };
}

/**
 * Build the Cloudflare Worker script (module syntax) for a brand.
 * `token` is the brand's raw Connector token; `edgeBase` is the absolute
 * /api/edge/serve URL of this Livesov deployment.
 */
export function buildEdgeWorkerScript(token: string, edgeBase: string): string {
  return `// Cloudflare Worker — Livesov edge publishing. Nothing installed on your site.\n`
    + `// Works for ANY stack (WordPress, custom-coded, ...): serves /llms.txt, appends\n`
    + `// AI rules to /robots.txt, and applies your shipped SEO fixes (title, meta\n`
    + `// description, canonical, JSON-LD schema, OG/Twitter cards, noindex removal,\n`
    + `// and contextual internal links) to every page as it is served.\n`
    + `const T = ${JSON.stringify(token)};\n`
    + `const BASE = ${JSON.stringify(edgeBase)};\n`
    + `const H = { headers: { Authorization: 'Bearer ' + T } };\n`
    + `const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');\n`
    + `const relatedLinksNav = ${relatedLinksNav.toString()};\n`
    + `const edgePathKey = ${edgePathKey.toString()};\n`
    + `const makeNavAppender = ${makeNavAppender.toString()};\n`
    + `export default {\n`
    + `  async fetch(req) {\n`
    + `    const p = new URL(req.url).pathname;\n`
    + `    if (p === '/llms.txt') return fetch(BASE + '?file=llms.txt', H);\n`
    + `    if (p === '/robots.txt') {\n`
    + `      const [base, add] = await Promise.all([\n`
    + `        fetch(req).then(r => r.text()).catch(() => ''),\n`
    + `        fetch(BASE + '?file=robots.txt', H).then(r => r.ok ? r.text() : '').catch(() => ''),\n`
    + `      ]);\n`
    + `      return new Response((base + '\\n' + add).trim() + '\\n', { headers: { 'content-type': 'text/plain' } });\n`
    + `    }\n`
    + `    const res = await fetch(req);\n`
    + `    const out = new Response(res.body, res);\n`
    + `    out.headers.set('${EDGE_MARKER_HEADER}', 'v1'); // lets Livesov verify the Worker is live\n`
    + `    if (req.method !== 'GET' || !(res.headers.get('content-type') || '').includes('text/html')) return out;\n`
    + `    let o = null;\n`
    + `    try { // per-path SEO overrides from your shipped fixes (5-min edge cache)\n`
    + `      const r = await fetch(BASE + '?file=seo.json', { ...H, cf: { cacheTtl: 300, cacheEverything: true } });\n`
    + `      if (r.ok) { const d = await r.json(); const ov = d.overrides || {}; const k = edgePathKey(p); o = ov[k] || ov[k + '/'] || null; }\n`
    + `    } catch {}\n`
    + `    if (!o) return out;\n`
    + `    if (o.indexable) out.headers.delete('x-robots-tag'); // noindex removal (header side)\n`
    + `    let sawT = false, sawD = false, sawC = false;\n`
    + `    let rw = new HTMLRewriter();\n`
    + `    if (o.title) rw = rw.on('title', { element(e) { sawT = true; e.setInnerContent(o.title); } });\n`
    + `    if (o.description) rw = rw.on('meta[name="description"]', { element(e) { sawD = true; e.setAttribute('content', o.description); } });\n`
    + `    if (o.canonical) rw = rw.on('link[rel="canonical"]', { element(e) { sawC = true; e.setAttribute('href', o.canonical); } });\n`
    + `    if (o.indexable) rw = rw.on('meta[name="robots"]', { element(e) { e.setAttribute('content', 'index, follow'); } });\n`
    + `    rw = rw.on('head', { element(e) { e.onEndTag((end) => { // inject tags the page lacks\n`
    + `      if (o.title && !sawT) end.before('<title>' + esc(o.title) + '</title>', { html: true });\n`
    + `      if (o.description && !sawD) end.before('<meta name="description" content="' + esc(o.description) + '">', { html: true });\n`
    + `      if (o.canonical && !sawC) end.before('<link rel="canonical" href="' + esc(o.canonical) + '">', { html: true });\n`
    + `      if (o.jsonLd) end.before('<script type="application/ld+json">' + o.jsonLd + '</scr' + 'ipt>', { html: true });\n`
    + `      if (o.head) end.before(o.head, { html: true }); // OG/Twitter card block\n`
    + `    }); } });\n`
    + `    if (Array.isArray(o.links) && o.links.length) { // shipped Internal-linking fixes\n`
    + `      const L = o.links.slice(0, ${MAX_EDGE_LINKS});\n`
    + `      if (o.linkMode === 'inline') { // wrap the first plaintext hit of each anchor in the article body\n`
    + `        const used = {};\n`
    + `        const wrap = { text(t) {\n`
    + `          if (Object.keys(used).length >= L.length) return;\n`
    + `          const s = t.text;\n`
    + `          for (const l of L) {\n`
    + `            if (used[l.href] || !l.anchor || !l.href) continue;\n`
    + `            const at = s.indexOf(l.anchor);\n`
    + `            if (at < 0) continue;\n`
    + `            used[l.href] = 1;\n`
    + `            const rel = l.rel ? ' rel="' + esc(l.rel) + '"' : '';\n`
    + `            t.replace(esc(s.slice(0, at)) + '<a href="' + esc(l.href) + '"' + rel + '>' + esc(l.anchor) + '</a>' + esc(s.slice(at + l.anchor.length)), { html: true });\n`
    + `            return; // one wrap per text chunk keeps the rewrite non-overlapping\n`
    + `          }\n`
    + `        } };\n`
    + `        rw = rw.on('article', wrap).on('main', wrap).on('[itemprop="articleBody"]', wrap);\n`
    + `      } else { // default: append a Related-links nav before the end of the first article/main/articleBody,\n`
    + `        const navHtml = relatedLinksNav(L, esc); // or <body> as a fallback for pages with no semantic container\n`
    + `        if (navHtml) {\n`
    + `          // Shared appender: injects once at the first container to close.\n`
    + `          // body closes last, so it only fires when no semantic container did.\n`
    + `          const appendNav = makeNavAppender(navHtml);\n`
    + `          rw = rw.on('article', appendNav).on('main', appendNav).on('[itemprop="articleBody"]', appendNav).on('body', appendNav);\n`
    + `        }\n`
    + `      }\n`
    + `    }\n`
    + `    return rw.transform(out);\n`
    + `  }\n`
    + `};\n`;
}
