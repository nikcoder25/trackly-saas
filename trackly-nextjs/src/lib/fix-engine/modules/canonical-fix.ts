/**
 * Module: Canonical fix (GSC URL Inspection, Channel A).
 *
 * Detect: inspect crawl-target URLs; flag pages where Google chose a
 *   different canonical than the page declares (googleCanonical !=
 *   userCanonical), which can suppress the intended URL.
 * Generate: deterministic — the intended canonical is the page's declared
 *   canonical (or its own URL). No LLM call, no credit cost.
 * Ship: set the canonical SEO field via the CMS adapter.
 * Recheck: re-inspect and confirm Google's canonical now matches.
 */

import { resolveCrawlTargets } from '../crawl';
import { getValidAccessToken, inspectUrl, parseInspection } from '../gsc';
import { resolveCmsForBrand } from './_shared';
import type {
  ContentPatch, DetectedIssue, FixContext, FixModule, GeneratedDraft, PreviewBlock, RecheckVerdict, ShipResult,
} from '../types';

const MAX_INSPECT = 15;

export const canonicalFixModule: FixModule = {
  key: 'canonical-fix',
  title: 'Canonical fix',
  description: 'Google picked a different canonical than declared — reinforce the right one.',
  channel: 'A',
  trigger: 'gsc',
  minPlan: 'pro',
  phase: 3,

  async detect(ctx: FixContext): Promise<DetectedIssue[]> {
    const token = await getValidAccessToken(ctx.brand.id, ctx.tenantId);
    if (!token || !token.siteUrl) return [];
    const targets = await resolveCrawlTargets(ctx.brand.website, MAX_INSPECT);
    const issues: DetectedIssue[] = [];
    for (const url of targets) {
      let status;
      try {
        const raw = await inspectUrl({ accessToken: token.accessToken, siteUrl: token.siteUrl, inspectionUrl: url });
        status = parseInspection(raw);
      } catch { continue; }
      const google = status.googleCanonical;
      const user = status.userCanonical || url;
      // Mismatch: Google chose something other than what the page declares.
      if (!google || google === user) continue;
      issues.push({
        key: url,
        targetUrl: url,
        severity: 'medium',
        summary: `Canonical mismatch — Google: ${google}`,
        detected: { url, googleCanonical: google, intendedCanonical: user },
        before: { googleCanonical: google, userCanonical: user },
      });
    }
    return issues;
  },

  // Deterministic: no LLM. The intended canonical is what the page declares.
  async generate(issue: DetectedIssue): Promise<GeneratedDraft> {
    const d = issue.detected as { intendedCanonical: string };
    return { generated: { canonical: d.intendedCanonical }, creditsUsed: 0 };
  },

  preview(issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    const b = issue.detected as { googleCanonical?: string };
    return {
      kind: 'text-diff',
      label: 'Canonical URL',
      before: b.googleCanonical || '',
      after: String(draft.generated.canonical ?? ''),
    };
  },

  async ship(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<ShipResult> {
    const cms = await resolveCmsForBrand(ctx);
    if ('error' in cms) return cms.error;
    const result = await cms.adapter.updateCanonical(cms.creds, { url: issue.targetUrl! }, String(draft.generated.canonical));
    return { ok: result.ok, detail: result.detail ?? {}, after: { canonical: draft.generated.canonical }, error: result.ok ? undefined : 'CMS write failed' };
  },

  contentPatch(issue: DetectedIssue, draft: GeneratedDraft): ContentPatch | null {
    if (!issue.targetUrl) return null;
    return { url: issue.targetUrl, canonical: String(draft.generated.canonical) };
  },

  async recheck(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<RecheckVerdict> {
    const token = await getValidAccessToken(ctx.brand.id, ctx.tenantId);
    if (!token || !token.siteUrl) return { verified: false, scoreAfter: null, note: 'GSC not connected' };
    try {
      const raw = await inspectUrl({ accessToken: token.accessToken, siteUrl: token.siteUrl, inspectionUrl: issue.targetUrl! });
      const status = parseInspection(raw);
      const want = String(draft.generated.canonical);
      const ok = status.googleCanonical === want;
      return { verified: ok, scoreAfter: ok ? 100 : 0, note: `Google canonical: ${status.googleCanonical || 'unknown'} (re-evaluation can take days)` };
    } catch (e) {
      return { verified: false, scoreAfter: null, note: (e as Error).message };
    }
  },
};
