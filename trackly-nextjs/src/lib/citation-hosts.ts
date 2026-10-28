/**
 * Citation host helpers. No dependencies so it is safe on client and server.
 *
 * Gemini grounding returns Google redirect URLs (vertexaisearch.cloud.google.com
 * /grounding-api-redirect/...) instead of the publisher URL. Those hosts are
 * not real sources and must never show up as a cited site or a competitor.
 */

function hostOf(domainOrUrl: string): string {
  let s = String(domainOrUrl || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  return s;
}

/** True for Google grounding / redirect hosts that hide the real source. */
export function isRedirectCitationHost(domainOrUrl: string): boolean {
  const s = hostOf(domainOrUrl);
  if (!s) return false;
  const host = s.split(/[/?#]/)[0].replace(/^www\./, '');
  if (host === 'vertexaisearch.cloud.google.com' || host.endsWith('.vertexaisearch.cloud.google.com')) return true;
  if (s.includes('grounding-api-redirect')) return true;
  if (/^(www\.)?google\.[a-z.]+\/url(\?|$|\/)/.test(s)) return true;
  return false;
}

/** True when a string looks like a bare domain name ("example.com"). */
export function looksLikeDomain(s: string): boolean {
  const v = String(s || '').trim().toLowerCase();
  if (!v || v.length > 253 || /\s/.test(v)) return false;
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(v);
}

/** Copy of a domain -> count map without redirect hosts. */
export function cleanCitationCounts(map: Record<string, number> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!map || typeof map !== 'object') return out;
  for (const [k, v] of Object.entries(map)) {
    if (isRedirectCitationHost(k)) continue;
    out[k] = v;
  }
  return out;
}
