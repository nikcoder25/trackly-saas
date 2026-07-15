/**
 * Self-Serve Connect — public per-path override projection.
 *
 * The snippet on a customer's site is unauthenticated and cross-origin, so the
 * serve route must expose ONLY public-safe fields from the brand's shipped-fix
 * overrides (the SAME data the edge Worker serves via getEdgeSeoOverrides). This
 * module is the allowlist: it maps an internal {@link EdgeSeoOverride} to the
 * public shape and picks the entry for a given path. Head-only/edge-only fields
 * (og-cards `head`, `indexable`, `linkMode`) are intentionally NOT exposed — the
 * client snippet can't meaningfully apply them; they belong to Edge Pro.
 */

import type { EdgeSeoOverride } from '@/lib/fix-engine/schema';
import { edgePathKey } from '@/lib/fix-engine/edge-worker';

/** The public-safe subset of a per-path override the snippet applies. */
export interface PublicOverride {
  title?: string;
  metaDescription?: string;
  canonical?: string;
  jsonLd?: string;
  links?: EdgeSeoOverride['links'];
  citations?: EdgeSeoOverride['citations'];
  citable?: EdgeSeoOverride['citable'];
  faq?: EdgeSeoOverride['faq'];
  freshness?: EdgeSeoOverride['freshness'];
}

/** Project an internal override to the public allowlist. `description` is
 *  renamed `metaDescription`; `head`, `indexable`, and `linkMode` are dropped. */
export function toPublicOverride(o: EdgeSeoOverride): PublicOverride {
  const out: PublicOverride = {};
  if (o.title) out.title = o.title;
  if (o.description) out.metaDescription = o.description;
  if (o.canonical) out.canonical = o.canonical;
  if (o.jsonLd) out.jsonLd = o.jsonLd;
  if (o.links && o.links.length) out.links = o.links;
  if (o.citations && o.citations.length) out.citations = o.citations;
  if (o.citable) out.citable = o.citable;
  if (o.faq && o.faq.faqs && o.faq.faqs.length) out.faq = o.faq;
  if (o.freshness && o.freshness.update) out.freshness = o.freshness;
  return out;
}

/** Reduce an arbitrary path or URL to the pathname the override map is keyed on. */
function pathnameOf(path: string): string {
  try { return new URL(path, 'https://x.invalid').pathname; } catch { return path || '/'; }
}

/**
 * Select the public override for `path` from a brand's override map,
 * trailing-slash-safe (mirrors the Worker's `ov[k] || ov[k + '/']` lookup).
 * Returns null when the page has no shipped fixes or none survive the allowlist.
 */
export function publicOverrideForPath(
  overrides: Record<string, EdgeSeoOverride>,
  path: string,
): PublicOverride | null {
  const key = edgePathKey(pathnameOf(path));
  const o = overrides[key] ?? overrides[key + '/'] ?? null;
  if (!o) return null;
  const pub = toPublicOverride(o);
  return Object.keys(pub).length ? pub : null;
}
