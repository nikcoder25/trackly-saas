/**
 * Fix Engine - Git connector: SEO manifest.
 *
 * The durable ("owned") delivery model. Instead of rewriting a page in transit
 * (edge Worker) or injecting in the browser (snippet), the Git connector commits
 * the brand's shipped SEO overrides into the customer's own repository as a
 * single JSON manifest, delivered by a pull request. The customer's build reads
 * this manifest and bakes the values into the generated HTML — so the changes
 * live in their source and SURVIVE removal of any livesov snippet or Worker.
 *
 * The manifest is exactly the per-path {@link EdgeSeoOverride} feed the edge
 * Worker serves, so a brand can switch delivery (edge ⇄ git) with no change to
 * what gets applied. Serialization is deterministic (recursively key-sorted) so
 * an unchanged fix set re-serializes byte-for-byte and produces no-op commits.
 */

import type { EdgeSeoOverride } from '../schema';

export const SEO_MANIFEST_VERSION = 1;

/** Default in-repo path for the committed manifest. */
export const DEFAULT_MANIFEST_PATH = 'livesov/seo-overrides.json';

export interface SeoManifest {
  version: number;
  generator: 'livesov';
  brandId: string;
  /**
   * ISO timestamp, or null. Passed in by the caller (never generated here) so
   * this module stays pure and its output is deterministic for a given input.
   */
  generatedAt: string | null;
  /** Per-path overrides. Keys are the same path keys as the edge serve feed. */
  paths: Record<string, EdgeSeoOverride>;
}

/**
 * Deterministic JSON.stringify: object keys are emitted in sorted order at every
 * depth; array order is preserved (it is already meaningful and stable from the
 * override builder). Guarantees byte-identical output for equal inputs so the
 * Git sync can skip no-op commits.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const parts = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${parts.join(',')}}`;
}

/**
 * Build the manifest file body (a pretty-printed, trailing-newline JSON string)
 * from a brand's per-path SEO overrides. Deterministic for a given input.
 */
export function buildSeoManifest(args: {
  brandId: string;
  overrides: Record<string, EdgeSeoOverride>;
  generatedAt?: string | null;
}): string {
  const paths: Record<string, EdgeSeoOverride> = {};
  for (const key of Object.keys(args.overrides).sort()) {
    paths[key] = args.overrides[key];
  }
  const manifest: SeoManifest = {
    version: SEO_MANIFEST_VERSION,
    generator: 'livesov',
    brandId: args.brandId,
    generatedAt: args.generatedAt ?? null,
    paths,
  };
  // Re-parse the stable (key-sorted) form so JSON.stringify pretty-prints it in
  // that canonical order — readable diff in the PR, deterministic bytes.
  const canonical = JSON.parse(stableStringify(manifest));
  return `${JSON.stringify(canonical, null, 2)}\n`;
}
