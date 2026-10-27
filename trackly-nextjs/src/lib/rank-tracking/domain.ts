/**
 * Domain matching for rank checks.
 *
 * Both sides are normalised the same way: protocol, credentials, port,
 * path, query and a leading "www." are dropped and the host is lower-cased.
 * A result counts for a tracked domain when its host IS that domain or a
 * subdomain of it (blog.example.com counts for example.com), never the
 * other way round and never a look-alike (notexample.com).
 */
import type { OrganicResult } from './providers/types';

export function normalizeDomain(input: string | null | undefined): string {
  let v = String(input || '').trim().toLowerCase();
  if (!v) return '';
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  v = v.replace(/^[^@/]*@/, '');
  v = v.split(/[/?#]/)[0];
  v = v.replace(/:\d+$/, '').replace(/\.+$/, '').replace(/^www\d*\./, '');
  return v;
}

/** True when `candidate` (a domain or URL) is `tracked` or one of its subdomains. */
export function matchesDomain(candidate: string | null | undefined, tracked: string | null | undefined): boolean {
  const c = normalizeDomain(candidate);
  const t = normalizeDomain(tracked);
  if (!c || !t) return false;
  return c === t || c.endsWith('.' + t);
}

/** The first organic result for the tracked domain, or null. */
export function findRank(organic: OrganicResult[], tracked: string): OrganicResult | null {
  for (const r of organic) {
    if (matchesDomain(r.domain || r.url, tracked)) return r;
  }
  return null;
}

/** A URL reduced to its path for display ("/ac-repair/"), or the input when it does not parse. */
export function urlPath(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    return (u.pathname || '/') + u.search;
  } catch {
    return String(url);
  }
}
