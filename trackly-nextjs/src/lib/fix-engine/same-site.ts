/**
 * Fix Engine - same-site check shared by every place that decides whether a
 * URL belongs to a brand's own site (targeted-fix creation, sitemap crawl
 * targets, the WordPress adapter's credentialed API calls).
 *
 * Two URLs are the same site when their hostnames match after dropping a
 * leading `www.` and their explicit ports match. Paths are ignored, so any
 * subpath of the site is accepted. Only http(s) URLs qualify. A schemeless
 * value (e.g. "acme.com") is read as https.
 */

function parse(raw: string): URL | null {
  const s = (raw || '').trim();
  if (!s) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u;
  } catch {
    return null;
  }
}

function key(u: URL): string {
  const host = u.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  return u.port ? `${host}:${u.port}` : host;
}

export function isSameSite(siteUrl: string | null | undefined, url: string | null | undefined): boolean {
  const a = parse(siteUrl || '');
  const b = parse(url || '');
  if (!a || !b) return false;
  return key(a) === key(b);
}
