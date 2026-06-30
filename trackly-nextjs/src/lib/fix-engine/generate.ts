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
  // Ground every generation in the shared SEO brain, then the module's
  // own system prompt. The brain establishes the playbook; the module
  // prompt specifies the task + output format.
  const system = `${getSeoBrain()}\n\n---\n\n${args.system}`;
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
      const text = (result.text || '').trim();
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
