/**
 * Fix Engine - brand rules (generation guardrails).
 *
 * Structural, deterministic policies enforced on every LLM draft AFTER
 * generation, so autopilot can be trusted: title suffix branding, hard
 * length caps, banned phrases. Complements the SEO Brain (which shapes
 * tone/strategy but can't guarantee structure).
 *
 * Applied centrally in generateFix() to the high-visibility fields
 * (`title`, `description`) — never to long-form HTML, where mechanical
 * edits could mangle prose.
 */

export interface BrandRules {
  /** Appended to titles when absent, e.g. " | Acme". */
  titleSuffix?: string;
  /** Hard cap for titles (chars). Default: none. */
  titleMaxLen?: number;
  /** Hard cap for meta descriptions (chars). Default: none. */
  metaMaxLen?: number;
  /** Phrases stripped (case-insensitive) from titles/descriptions. */
  bannedPhrases?: string[];
}

export interface RulesResult {
  generated: Record<string, unknown>;
  /** Human-readable notes about what the guardrails changed. */
  applied: string[];
}

function stripPhrases(text: string, phrases: string[], applied: string[], field: string): string {
  let out = text;
  for (const p of phrases) {
    const phrase = p.trim();
    if (!phrase) continue;
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    if (re.test(out)) {
      out = out.replace(re, '').replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
      applied.push(`removed banned phrase "${phrase}" from ${field}`);
    }
  }
  return out;
}

/** Truncate at a word boundary, never mid-word. */
function capLength(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : text.slice(0, max)).trim();
}

/**
 * Enforce the brand's rules on a generated draft. Pure — returns a new
 * object plus notes; never throws on content.
 */
export function applyBrandRules(generated: Record<string, unknown>, rules: BrandRules | null | undefined): RulesResult {
  if (!rules) return { generated, applied: [] };
  const out = { ...generated };
  const applied: string[] = [];
  const banned = rules.bannedPhrases?.filter((p) => p.trim()) ?? [];

  if (typeof out.title === 'string' && out.title) {
    let title = out.title.trim();
    if (banned.length) title = stripPhrases(title, banned, applied, 'title');
    const suffix = rules.titleSuffix?.trim();
    if (suffix && !title.toLowerCase().includes(suffix.toLowerCase())) {
      // Make room for the suffix inside the cap when both rules are set.
      const cap = rules.titleMaxLen && rules.titleMaxLen > suffix.length + 4
        ? rules.titleMaxLen - suffix.length - 1
        : undefined;
      if (cap) title = capLength(title, cap);
      title = `${title}${suffix.startsWith(' ') ? '' : ' '}${suffix}`.trim();
      applied.push('appended title suffix');
    }
    if (rules.titleMaxLen && title.length > rules.titleMaxLen) {
      title = capLength(title, rules.titleMaxLen);
      applied.push(`capped title at ${rules.titleMaxLen} chars`);
    }
    if (title !== out.title) out.title = title;
  }

  if (typeof out.description === 'string' && out.description) {
    let desc = out.description.trim();
    if (banned.length) desc = stripPhrases(desc, banned, applied, 'description');
    if (rules.metaMaxLen && desc.length > rules.metaMaxLen) {
      desc = capLength(desc, rules.metaMaxLen);
      applied.push(`capped description at ${rules.metaMaxLen} chars`);
    }
    if (desc !== out.description) out.description = desc;
  }

  return { generated: out, applied };
}
