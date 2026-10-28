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
  /** The provider stopped at the output budget - the reply may be cut off. */
  truncated?: boolean;
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
      if (text) return { text, platform, model, truncated: result.truncated };
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
 * The first complete JSON object embedded in `text`, or null.
 *
 * A depth counter that understands strings: braces inside string values do
 * not count, and escapes inside strings do not end them. This replaces the
 * old first-`{`-to-last-`}` slice, which broke on the two realest shapes of
 * model output: prose AFTER the JSON that happens to contain a `}` (the
 * slice grabs too much) and a reply cut off by the output budget (the slice
 * grabs an unclosed object and the parse error blames "formatting").
 *
 * Prose can also contain a stray `{` before the JSON - which can even
 * balance against a later brace and swallow the real object - so each `{`
 * is tried as a start, and a balanced slice only wins if it actually
 * parses. Capped to keep the worst case cheap.
 */
export function extractJsonObject(text: string): string | null {
  let from = 0;
  for (let attempt = 0; attempt < 8; attempt++) {
    const start = text.indexOf('{', from);
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        const slice = text.slice(start, i + 1);
        try { JSON.parse(slice); return slice; } catch { break; /* not JSON - next start */ }
      }
    }
    from = start + 1; // this start never produced valid JSON - try the next
  }
  return null;
}

/**
 * Output-budget floor for JSON generations.
 *
 * max_tokens is a CEILING, not a spend: providers bill the tokens actually
 * produced, so a small cap saves nothing - what it does is cut a reasoning
 * model off mid-object once its thinking has eaten the budget, which turns
 * 100% of the call's cost into garbage. The default Claude model is a
 * reasoning model, and modules passing caps in the hundreds made every
 * generation on such a deployment fail with "did not return valid JSON".
 * Module maxTokens still expresses the expected CONTENT size; this floor
 * adds the reasoning headroom on top.
 */
export const JSON_MIN_BUDGET = 3000;

/**
 * Generation that expects a JSON object back.
 *
 * Parsing is repair-first: fences stripped, then the first balanced object
 * extracted (see extractJsonObject). When that still fails, ONE retry with
 * an explicit only-JSON reminder and a doubled output budget - the doubling
 * matters because a reasoning-heavy model can overrun even the floored
 * budget, and no formatting reminder fixes a reply that was never allowed
 * to finish. A parse failure used to fail the fix outright, burning the
 * user's credit over one malformed reply.
 */
export async function generateJson<T = Record<string, unknown>>(
  args: GenerateArgs,
): Promise<{ data: T; platform: string; model: string }> {
  const parse = (raw: string): T | null => {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const candidate = extractJsonObject(cleaned) ?? cleaned;
    try { return JSON.parse(candidate) as T; } catch { return null; }
  };

  const budget = Math.max(args.maxTokens ?? 1500, JSON_MIN_BUDGET);
  let out = await generateContent({ ...args, maxTokens: budget });
  let data = parse(out.text);
  if (data === null) {
    logger.warn('fix_engine.generate.bad_json_retry', {
      platform: out.platform, model: out.model,
      truncated: out.truncated ?? null,
      brandId: args.ctx.brand.id,
      head: out.text.slice(0, 300),
    });
    out = await generateContent({
      ...args,
      user: `${args.user}\n\nIMPORTANT: Reply with ONLY the JSON object. No prose before or after it, no code fences, and make sure the object is complete.`,
      maxTokens: budget * 2,
    });
    data = parse(out.text);
  }
  if (data === null) {
    throw new Error(`Model did not return valid JSON (${out.platform}/${out.model})${out.truncated ? ' - the reply was cut off at the output limit' : ''}. Try Retry, or Regenerate with simpler guidance.`);
  }
  return { data, platform: out.platform, model: out.model };
}
