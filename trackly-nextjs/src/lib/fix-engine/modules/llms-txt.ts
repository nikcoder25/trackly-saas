/**
 * Module: llms.txt (Channel B - Connector plugin).
 *
 * Detect: check whether the site serves /llms.txt; if missing, flag it.
 * Generate: LLM produces an llms.txt (llmstxt.org format) from the
 *           discovered pages.
 * Ship: queue a Connector instruction to write /llms.txt at the site
 *       root (head/files access = Channel B). Until the Connector is
 *       live the content is persisted and offered as a manual download.
 * Recheck: fetch /llms.txt and confirm it's served.
 */

import { safeFetch } from '@/lib/safe-fetch';
import { crawlPage, resolveCrawlTargets } from '../crawl';
import { generateContent } from '../generate';
import { LLMS_TXT_SYSTEM, llmsTxtUserPrompt } from '../prompts';
import { queueConnectorInstruction } from './_shared';
import type {
  DetectedIssue,
  FixContext,
  FixModule,
  GeneratedDraft,
  PreviewBlock,
  RecheckVerdict,
  ShipResult,
} from '../types';

function originOf(website: string | undefined): string | null {
  if (!website) return null;
  try {
    return new URL(website.startsWith('http') ? website : `https://${website}`).origin;
  } catch {
    return null;
  }
}

async function llmsTxtExists(origin: string): Promise<boolean> {
  try {
    const res = await safeFetch(`${origin}/llms.txt`, { timeoutMs: 8000, maxBytes: 512 * 1024 });
    if (!res.ok) return false;
    const body = (await res.text()).trim();
    return body.length > 0 && !body.toLowerCase().startsWith('<!doctype');
  } catch {
    return false;
  }
}

export const llmsTxtModule: FixModule = {
  key: 'llms-txt',
  title: 'llms.txt',
  description: 'Generate and serve llms.txt so AI assistants understand your site.',
  channel: 'B',
  trigger: 'crawl',
  minPlan: 'starter',
  phase: 1,

  async detect(ctx: FixContext): Promise<DetectedIssue[]> {
    const origin = originOf(ctx.brand.website);
    if (!origin) return [];
    if (await llmsTxtExists(origin)) return [];
    return [{
      key: origin,
      targetUrl: `${origin}/llms.txt`,
      severity: 'medium',
      summary: 'Site has no llms.txt',
      detected: { origin },
      before: { exists: false },
    }];
  },

  async generate(issue: DetectedIssue, ctx: FixContext): Promise<GeneratedDraft> {
    const targets = await resolveCrawlTargets(ctx.brand.website, 25);
    const pages: { url: string; title: string | null }[] = [];
    for (const url of targets) {
      try {
        const page = await crawlPage(url, ctx.signal);
        pages.push({ url, title: page.title });
      } catch {
        pages.push({ url, title: null });
      }
    }
    const out = await generateContent({
      ctx,
      system: LLMS_TXT_SYSTEM,
      user: llmsTxtUserPrompt({ brand: ctx.brand, pages }),
      maxTokens: 1500,
    });
    return { generated: { content: out.text.trim(), pageCount: pages.length }, creditsUsed: 2 };
  },

  preview(_issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    return {
      kind: 'code-block',
      label: 'llms.txt (served at /llms.txt)',
      language: 'markdown',
      after: String(draft.generated.content ?? ''),
    };
  },

  async ship(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<ShipResult> {
    // Channel B: head/files access is the Connector's job.
    return queueConnectorInstruction(ctx, issue.key, {
      op: 'write_file',
      payload: { path: '/llms.txt', contentType: 'text/plain', content: String(draft.generated.content) },
    });
  },

  async recheck(issue: DetectedIssue, _draft: GeneratedDraft, ctx: FixContext): Promise<RecheckVerdict> {
    const origin = (issue.detected as { origin: string }).origin;
    const exists = await llmsTxtExists(origin);
    return {
      verified: exists,
      scoreAfter: exists ? 100 : 0,
      note: exists ? 'llms.txt is served' : 'llms.txt not live yet (Connector pending)',
    };
  },
};
