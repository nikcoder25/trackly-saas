/**
 * Fix Engine - CMS auto-detection.
 *
 * Best-effort fingerprinting of a site's platform from its homepage HTML +
 * a couple of well-known endpoints, so the connect flow can steer the user
 * to the right adapter (or to the plugin-free edge path when we have no
 * write adapter). Read-only and SSRF-safe (uses safeFetch).
 */

import { safeFetch } from '@/lib/safe-fetch';

export type DetectedCms = 'wordpress' | 'shopify' | 'webflow' | 'ghost' | 'unknown';

export interface CmsDetection {
  cms: DetectedCms;
  /** 'high' when a definitive signal matched, 'low' for a weak hint. */
  confidence: 'high' | 'low' | 'none';
  signals: string[];
  /** True when we ship a write adapter for the detected CMS. */
  hasAdapter: boolean;
}

const WITH_ADAPTER = new Set<DetectedCms>(['wordpress', 'shopify', 'ghost', 'webflow']);

function origin(raw: string): string | null {
  try { return new URL(raw.startsWith('http') ? raw : `https://${raw}`).origin; }
  catch { return null; }
}

async function getText(url: string): Promise<{ status: number; body: string; headers: Headers } | null> {
  try {
    const res = await safeFetch(url, { timeoutMs: 8000, maxBytes: 600_000 });
    const body = await res.text().catch(() => '');
    return { status: res.status, body, headers: res.headers };
  } catch { return null; }
}

/**
 * Fingerprint the CMS at siteUrl. Definitive signals (REST namespace,
 * generator meta, vendor CDNs/headers) → high confidence.
 */
export async function detectCms(siteUrl: string): Promise<CmsDetection> {
  const base = origin(siteUrl);
  if (!base) return { cms: 'unknown', confidence: 'none', signals: ['invalid-url'], hasAdapter: false };

  const signals: string[] = [];
  let cms: DetectedCms = 'unknown';
  let confidence: CmsDetection['confidence'] = 'none';

  // 1) WordPress REST namespace — definitive.
  const wpJson = await getText(`${base}/wp-json/`);
  if (wpJson && wpJson.status === 200 && /"namespaces?"|wp\/v2/.test(wpJson.body)) {
    return { cms: 'wordpress', confidence: 'high', signals: ['wp-json'], hasAdapter: true };
  }

  // 2) Homepage HTML + headers.
  const home = await getText(`${base}/`);
  const html = home?.body ?? '';
  const hdr = (k: string) => home?.headers.get(k)?.toLowerCase() ?? '';
  const generator = (html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i)?.[1] || '').toLowerCase();

  if (/shopify/.test(hdr('x-shopify-stage') + hdr('x-sorting-hat-podid') + hdr('powered-by'))
      || /cdn\.shopify\.com|myshopify\.com|Shopify\.theme/i.test(html)) {
    cms = 'shopify'; confidence = 'high'; signals.push('shopify-asset');
  } else if (/ghost/.test(generator) || /content=["']Ghost/i.test(html) || /\/ghost\/api\//i.test(html)) {
    cms = 'ghost'; confidence = 'high'; signals.push('ghost-generator');
  } else if (/webflow/.test(generator) || /assets\.website-files\.com|assets-global\.website-files\.com|data-wf-(page|site)/i.test(html)) {
    cms = 'webflow'; confidence = 'high'; signals.push('webflow-asset');
  } else if (/wp-content|wp-includes/.test(html) || /wordpress/.test(generator)) {
    cms = 'wordpress'; confidence = 'low'; signals.push('wp-asset-hint');
  }

  if (cms === 'unknown' && home) signals.push(`no-match(status ${home.status})`);
  return { cms, confidence, signals, hasAdapter: WITH_ADAPTER.has(cms) };
}
