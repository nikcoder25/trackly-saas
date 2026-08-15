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

export type DetectedBuilder =
  | 'elementor' | 'divi' | 'wpbakery' | 'beaver' | 'bricks' | 'oxygen' | 'gutenberg';

export interface CmsDetection {
  cms: DetectedCms;
  /** 'high' when a definitive signal matched, 'low' for a weak hint. */
  confidence: 'high' | 'low' | 'none';
  signals: string[];
  /** True when we ship a write adapter for the detected CMS. */
  hasAdapter: boolean;
  /** WordPress only: the page builder rendering the front end, if any. */
  builder?: DetectedBuilder;
  builderLabel?: string;
  /**
   * True when editing this site over the REST API would write to
   * post_content that the front end does not actually render — i.e. the
   * Connector plugin is required, not merely preferable.
   */
  needsConnector?: boolean;
}

const WITH_ADAPTER = new Set<DetectedCms>(['wordpress', 'shopify', 'ghost', 'webflow']);

/**
 * Front-end fingerprints for the builders the Connector plugin supports.
 *
 * This exists to stop the connect wizard giving bad advice. The Application
 * Password route writes through the REST API, which means it writes to
 * post_content — and on Elementor, Beaver Builder, Bricks or Oxygen the front
 * end never reads that field, so the edit lands nowhere visible. Steering a
 * builder site down that path produces fixes that report success and change
 * nothing, which is the single worst outcome the Fix Engine can produce.
 *
 * Ordered most-specific first: Divi and Elementor sites often carry generic
 * block-editor markup too, so `gutenberg` has to be the last thing checked.
 */
const BUILDER_SIGNATURES: Array<{
  builder: DetectedBuilder;
  label: string;
  /** post_content is not what the front end renders. */
  needsConnector: boolean;
  pattern: RegExp;
}> = [
  { builder: 'elementor', label: 'Elementor', needsConnector: true,
    pattern: /elementor-(?:frontend|page-\d+|kit-\d+)|\/plugins\/elementor\/|class="[^"]*\belementor\b/i },
  { builder: 'divi', label: 'Divi', needsConnector: false,
    pattern: /\bet_pb_section\b|\bet_pb_row\b|id="et-boc"|\/themes\/Divi\//i },
  { builder: 'wpbakery', label: 'WPBakery', needsConnector: false,
    pattern: /js_composer|\bvc_row\b|\bwpb_wrapper\b/i },
  { builder: 'beaver', label: 'Beaver Builder', needsConnector: true,
    pattern: /\bfl-builder-content\b|\/plugins\/bb-plugin\/|\bfl-node-\w/i },
  { builder: 'bricks', label: 'Bricks', needsConnector: true,
    pattern: /\bbrxe-\w|\/plugins\/bricks\/|id="brx-content"/i },
  { builder: 'oxygen', label: 'Oxygen', needsConnector: true,
    pattern: /\bct-section\b|\bct_section\b|\/plugins\/oxygen\/|oxy-(?:header|stock-content)/i },
  { builder: 'gutenberg', label: 'Block editor', needsConnector: false,
    pattern: /\bwp-block-\w/i },
];

/** Identify the page builder rendering a WordPress front end, if any. */
export function detectBuilder(html: string): {
  builder?: DetectedBuilder; builderLabel?: string; needsConnector: boolean;
} {
  for (const sig of BUILDER_SIGNATURES) {
    if (sig.pattern.test(html)) {
      return { builder: sig.builder, builderLabel: sig.label, needsConnector: sig.needsConnector };
    }
  }
  return { needsConnector: false };
}

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

  // 1) WordPress REST namespace — definitive. The homepage is still fetched
  //    afterwards, because knowing it is WordPress is not enough: which page
  //    builder renders the front end decides whether the REST route can edit
  //    this site at all.
  const wpJson = await getText(`${base}/wp-json/`);
  if (wpJson && wpJson.status === 200 && /"namespaces?"|wp\/v2/.test(wpJson.body)) {
    const home = await getText(`${base}/`);
    const b = detectBuilder(home?.body ?? '');
    return {
      cms: 'wordpress',
      confidence: 'high',
      signals: b.builder ? ['wp-json', `builder:${b.builder}`] : ['wp-json'],
      hasAdapter: true,
      ...b,
    };
  }

  // 2) Homepage HTML + headers.
  const home = await getText(`${base}/`);
  const html = home?.body ?? '';
  const hdr = (k: string) => home?.headers.get(k)?.toLowerCase() ?? '';
  // Grab the generator <meta> tag first, then its content — order-independent
  // (some sites emit content=… before name="generator").
  const genTag = html.match(/<meta[^>]*\bname=["']generator["'][^>]*>/i)?.[0] || '';
  const generator = (genTag.match(/content=["']([^"']+)["']/i)?.[1] || '').toLowerCase();

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

  const builder = cms === 'wordpress' ? detectBuilder(html) : { needsConnector: false };
  if (builder.builder) signals.push(`builder:${builder.builder}`);

  return { cms, confidence, signals, hasAdapter: WITH_ADAPTER.has(cms), ...builder };
}
