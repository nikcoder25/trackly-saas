/**
 * Fix Engine - content generation helper.
 *
 * Thin wrapper over queryAI that modules use to turn detected issues into
 * new content. It reuses the exact key-resolution + slot-acquisition path
 * the geo-audits worker uses (resolveKeysForTenant → pickBestKey →
 * acquirePlatformSlot → queryAI) so tenant keys, server-key pools, cost
 * caps, and the fairness scheduler all apply identically.
 *
 * Generation prefers the most capable content model available given the
 * tenant's keys, falling back across platforms so a missing Claude key
 * doesn't block a fix when an OpenAI key exists.
 */

import {
  queryAI,
  getDefaultModel,
  pickBestKey,
  acquirePlatformSlot,
} from '@/lib/ai-platforms';
import { resolveKeysForTenant } from '@/lib/tenant-keys';
import { getServerKeys } from '@/lib/server-keys';
import { logger } from '@/lib/logger';
import { getSeoBrain } from './seo-brain';
import type { FixContext } from './types';

/**
 * Non-negotiable output rules appended to EVERY generation, after the SEO
 * brain (default, preset, or a brand's custom brain). Because it is added
 * unconditionally here — not inside the brain text — a custom brain can
 * never drop it. Keep this list short and about formatting only.
 */
export const GLOBAL_OUTPUT_RULES = `HARD FORMATTING RULES (override anything above that conflicts):
- NEVER use an em dash (—) or an en dash (–) anywhere in the output, including inside JSON string values. Use a normal hyphen "-", a comma, a colon, or split into two sentences instead. This applies to titles, meta descriptions, TL;DRs, passages, FAQ answers, freshness blurbs, anchor text, and every other field you produce.`;

/**
 * Belt-and-suspenders guarantee for the "no em dash" rule: even when a model
 * ignores GLOBAL_OUTPUT_RULES, strip every long dash from generated output
 * before it can reach a page. Em (—), en (–), horizontal bar (―), figure
 * dash (‒) and the minus sign (−) all collapse to a plain hyphen. Dashes are
 * not JSON-structural, so this is safe to run on raw JSON text pre-parse.
 * A dash flanked by spaces becomes " - "; a tight dash becomes "-".
 */
export function stripLongDashes(text: string): string {
  return text
    .replace(/\s*[‒–—―−]\s*/g, (m) =>
      /^\s|\s$/.test(m) ? ' - ' : '-',
    );
}

// Display name → key name, mirroring PLATFORM_KEY_MAP elsewhere in the repo.
const PLATFORM_KEY_MAP: Record<string, string> = {
  Claude: 'claude',
  ChatGPT: 'openai',
  Gemini: 'gemini',
  Perplexity: 'perplexity',
  Grok: 'grok',
};

// Order of preference for content generation. Claude first (strongest at
// long-form rewriting), then ChatGPT, then Gemini.
const GENERATION_PLATFORMS = ['Claude', 'ChatGPT', 'Gemini'] as const;

export interface GenerateArgs {
  ctx: FixContext;
  system: string;
  user: string;
  maxTokens?: number;
  /** Force a single platform (tests / deterministic modules). */
  platform?: string;
}

export interface GenerateOutput {
  text: string;
  platform: string;
  model: string;
}

/**
 * Run one generation call. Tries the preferred platforms in order until
 * one resolves a usable key and returns a response. Throws only when no
 * platform could produce output.
 */
export async function generateContent(args: GenerateArgs): Promise<GenerateOutput> {
  const { ctx, user, maxTokens = 1500 } = args;
  // Ground every generation in the brand's SEO brain (the user's saved
  // brain if set, else env/file/default), then the module's own system
  // prompt. The brain is the playbook; the module prompt is the task.
  const system = `${await getSeoBrain(ctx.brand.id)}\n\n---\n\n${args.system}\n\n---\n\n${GLOBAL_OUTPUT_RULES}`;
  const candidates = args.platform ? [args.platform] : [...GENERATION_PLATFORMS];
  const serverKeys = getServerKeys() as Record<string, string[]>;
  const errors: string[] = [];

  for (const platform of candidates) {
    const keyName = PLATFORM_KEY_MAP[platform];
    if (!keyName) continue;
    const resolved = await resolveKeysForTenant({
      tenantId: ctx.tenantId,
      platformKeyName: keyName,
      legacyUserKeys: ctx.userKeysLegacy,
      serverKeys: serverKeys[keyName] || [],
    });
    if (!resolved) { errors.push(`${platform}: no key`); continue; }
    const keyPool = resolved.source === 'server' ? resolved.pool : [resolved.key];
    const rawKey = pickBestKey(keyPool);
    if (!rawKey) { errors.push(`${platform}: no usable key`); continue; }

    const model = getDefaultModel(platform);
    const release = await acquirePlatformSlot(platform);
    try {
      const result = await queryAI(
        platform,
        user,
        rawKey,
        model,
        { id: ctx.brand.id, name: ctx.brand.name, city: ctx.brand.city, industry: ctx.brand.industry },
        {
          systemPrompt: system,
          maxTokens,
          tenantId: ctx.tenantId,
          brandId: ctx.brand.id,
          signal: ctx.signal,
          silent: true,
        },
      );
      const text = stripLongDashes((result.text || '').trim());
      if (text) return { text, platform, model };
      errors.push(`${platform}: empty response`);
    } catch (e) {
      errors.push(`${platform}: ${(e as Error).message}`);
      logger.warn('fix_engine.generate.platform_failed', {
        platform, brandId: ctx.brand.id, err: (e as Error).message,
      });
    } finally {
      try { release(); } catch { /* best-effort */ }
    }
  }

  throw new Error(`Generation failed on all platforms: ${errors.join('; ')}`);
}

/**
 * Generation that expects a JSON object back. Strips ```json fences and
 * parses; throws a clear error if the model didn't return valid JSON.
 */
export async function generateJson<T = Record<string, unknown>>(
  args: GenerateArgs,
): Promise<{ data: T; platform: string; model: string }> {
  const out = await generateContent(args);
  const cleaned = out.text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  // Some models wrap prose around the JSON; grab the first balanced object.
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  try {
    return { data: JSON.parse(slice) as T, platform: out.platform, model: out.model };
  } catch {
    throw new Error(`Model did not return valid JSON (${out.platform}/${out.model})`);
  }
}
