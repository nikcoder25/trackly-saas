import { describe, it, expect, afterEach } from 'vitest';
import { geminiGroundingAllowedForPlan } from '../src/lib/plan-config';
import { isSearchEnabled } from '../src/lib/response-cache';

const ORIGINAL_ENV = { ...process.env };
afterEach(() => { process.env = { ...ORIGINAL_ENV }; });

describe('geminiGroundingAllowedForPlan', () => {
  it('allows Pro and above', () => {
    for (const p of ['pro', 'agency', 'enterprise', 'owner', 'Pro', 'AGENCY']) {
      expect(geminiGroundingAllowedForPlan(p)).toBe(true);
    }
  });

  it('withholds grounding from Free, Trial and Starter', () => {
    for (const p of ['free', 'trial', 'starter', '', null, undefined]) {
      expect(geminiGroundingAllowedForPlan(p)).toBe(false);
    }
  });
});

describe('isSearchEnabled respects the Gemini plan gate', () => {
  it('treats an ungrounded Gemini call as non-search so it never shares a cache slot with a grounded one', () => {
    delete process.env.GEMINI_GROUNDING_DISABLED;
    expect(isSearchEnabled('Gemini', 'gemini-2.5-flash-lite')).toBe(true);
    expect(isSearchEnabled('Gemini', 'gemini-2.5-flash-lite', { geminiGrounding: true })).toBe(true);
    expect(isSearchEnabled('Gemini', 'gemini-2.5-flash-lite', { geminiGrounding: false })).toBe(false);
  });

  it('leaves other platforms alone', () => {
    expect(isSearchEnabled('Perplexity', 'sonar', { geminiGrounding: false })).toBe(true);
    expect(isSearchEnabled('ChatGPT', 'gpt-5.4-nano', { geminiGrounding: false })).toBe(false);
  });
});
