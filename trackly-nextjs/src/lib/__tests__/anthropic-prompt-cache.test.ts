import { afterEach, describe, expect, it } from 'vitest';
import { buildAnthropicSystem, ANTHROPIC_CACHE_MIN_SYSTEM_CHARS } from '../ai-platforms';

/**
 * Anthropic prompt caching for long system prompts (Fix Engine SEO brain,
 * Regional Audit instructions). Anthropic told this account its cache hit
 * rate was low; the fix is to mark the repeated system block ephemeral.
 */
afterEach(() => {
  delete process.env.ANTHROPIC_PROMPT_CACHE_DISABLED;
});

describe('buildAnthropicSystem', () => {
  it('sends the short tracking prompt as a plain string', () => {
    const short = 'Recommendation assistant. List 3-6 specific businesses by name.';
    expect(buildAnthropicSystem(short)).toBe(short);
  });

  it('wraps a long system prompt in a cache_control block', () => {
    const long = 'x'.repeat(ANTHROPIC_CACHE_MIN_SYSTEM_CHARS);
    expect(buildAnthropicSystem(long)).toEqual([
      { type: 'text', text: long, cache_control: { type: 'ephemeral' } },
    ]);
  });

  it('honours ANTHROPIC_PROMPT_CACHE_DISABLED=true', () => {
    process.env.ANTHROPIC_PROMPT_CACHE_DISABLED = 'true';
    const long = 'x'.repeat(ANTHROPIC_CACHE_MIN_SYSTEM_CHARS + 1);
    expect(buildAnthropicSystem(long)).toBe(long);
  });

  it('passes an empty prompt through untouched', () => {
    expect(buildAnthropicSystem('')).toBe('');
  });
});
