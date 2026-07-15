/**
 * Module: robots.txt AI-crawler access (Channel B - Connector).
 *
 * Detect: fetch /robots.txt; flag when the major AI crawlers (GPTBot,
 *   ClaudeBot, PerplexityBot, Google-Extended, …) aren't explicitly
 *   allowed (missing robots.txt, or no Allow rules for them).
 * Generate: deterministic — the Allow directives block (no LLM).
 * Ship: queue a Connector `patch_robots` instruction.
 * Recheck: fetch /robots.txt and confirm the directives are live.
 */

import { safeFetch } from '@/lib/safe-fetch';
import { queueConnectorInstruction } from './_shared';
import type {
  DetectedIssue, FixContext, FixModule, GeneratedDraft, PreviewBlock, RecheckVerdict, ShipResult,
} from '../types';

// The AI crawlers we want explicitly allowed (train + answer + live-fetch).
const AI_AGENTS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
  'ClaudeBot', 'Claude-Web',
  'PerplexityBot', 'Perplexity-User',
  'Google-Extended',
];

const MARKER = '# AI crawler access (added by Livesov)';

function buildDirectives(): string {
  const blocks = AI_AGENTS.map((a) => `User-agent: ${a}\nAllow: /`).join('\n\n');
  return `${MARKER}\n${blocks}`;
}

function originOf(website: string | undefined): string | null {
  if (!website) return null;
  try { return new URL(website.startsWith('http') ? website : `https://${website}`).origin; } catch { return null; }
}

async function fetchRobots(origin: string): Promise<{ status: number; text: string }> {
  try {
    const res = await safeFetch(`${origin}/robots.txt`, { timeoutMs: 8000, maxBytes: 512 * 1024 });
    return { status: res.status, text: res.ok ? await res.text() : '' };
  } catch {
    return { status: 0, text: '' };
  }
}

/** True when every AI agent already has an explicit Allow (case-insensitive). */
function allAgentsAllowed(robots: string): boolean {
  const lower = robots.toLowerCase();
  return AI_AGENTS.every((a) => lower.includes(`user-agent: ${a.toLowerCase()}`));
}

export const robotsAiAccessModule: FixModule = {
  key: 'robots-ai-access',
  title: 'robots.txt AI-crawler access',
  description: 'Explicitly allow GPTBot, ClaudeBot, PerplexityBot, Google-Extended, and more.',
  channel: 'B',
  trigger: 'crawl',
  minPlan: 'starter',
  phase: 3,

  async detect(ctx: FixContext): Promise<DetectedIssue[]> {
    const origin = originOf(ctx.brand.website);
    if (!origin) return [];
    const robots = await fetchRobots(origin);
    if (robots.status === 200 && allAgentsAllowed(robots.text)) return [];
    return [{
      key: origin,
      targetUrl: `${origin}/robots.txt`,
      severity: 'medium',
      summary: robots.status === 200 ? 'AI crawlers not explicitly allowed in robots.txt' : 'No robots.txt found',
      detected: { origin, currentStatus: robots.status },
      before: { robots: robots.text.slice(0, 2000) },
    }];
  },

  // Deterministic: the directives are fixed, no model call.
  async generate(): Promise<GeneratedDraft> {
    return { generated: { directives: buildDirectives() }, creditsUsed: 0 };
  },

  preview(issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock {
    const current = ((issue.before as { robots?: string })?.robots ?? '').trim();
    return {
      kind: 'code-block',
      label: 'robots.txt additions',
      language: 'text',
      before: current || undefined,
      addNote: current ? undefined : 'No robots.txt on your site today — these rules create it.',
      after: String(draft.generated.directives ?? ''),
    };
  },

  async ship(issue: DetectedIssue, draft: GeneratedDraft, ctx: FixContext): Promise<ShipResult> {
    return queueConnectorInstruction(ctx, issue.key, {
      op: 'patch_robots',
      payload: { content: String(draft.generated.directives) },
    });
  },

  async recheck(issue: DetectedIssue, _draft: GeneratedDraft): Promise<RecheckVerdict> {
    const origin = (issue.detected as { origin: string }).origin;
    const robots = await fetchRobots(origin);
    const ok = robots.status === 200 && robots.text.includes(MARKER);
    return { verified: ok, scoreAfter: ok ? 100 : 0, note: ok ? 'AI crawler directives are live' : 'Not live yet (Connector pending)' };
  },
};
