import { describe, expect, it } from 'vitest';
import {
  SIGNUP_SOURCES,
  classifyAttribution,
  hasClickEvidence,
  isAiSource,
  isValidSource,
  isAiReferrerDomain,
  normaliseAttribution,
  sourceLabel,
} from '@/lib/attribution';

/**
 * The feature exists to measure one thing: people who say an AI assistant
 * sent them while click tracking recorded nothing. `ai_invisible` is that
 * cohort, and most of these cases pin its boundaries - what counts as
 * evidence, and what must NOT be quietly folded into it.
 */

const base = { source: 'chatgpt', referrer_domain: null, utm_source: null, gclid: null };

describe('classifyAttribution', () => {
  it('flags an AI answer with no click data at all as the dark funnel', () => {
    expect(classifyAttribution(base)).toBe('ai_invisible');
  });

  it('treats an AI referrer as corroboration', () => {
    expect(classifyAttribution({ ...base, referrer_domain: 'chatgpt.com' })).toBe('ai_corroborated');
    expect(classifyAttribution({ ...base, referrer_domain: 'perplexity.ai' })).toBe('ai_corroborated');
  });

  it('separates an AI answer whose click data points elsewhere', () => {
    // Remembering ChatGPT while arriving on a paid click is a real pattern,
    // and folding it into either bucket would overstate that bucket.
    expect(classifyAttribution({ ...base, gclid: 'abc123' })).toBe('ai_conflicting');
    expect(classifyAttribution({ ...base, referrer_domain: 'reddit.com' })).toBe('ai_conflicting');
    expect(classifyAttribution({ ...base, utm_source: 'newsletter' })).toBe('ai_conflicting');
  });

  it('does not count non-AI answers as AI, however they arrived', () => {
    expect(classifyAttribution({ ...base, source: 'reddit' })).toBe('untracked');
    expect(classifyAttribution({ ...base, source: 'reddit', referrer_domain: 'reddit.com' })).toBe('tracked');
  });

  it('keeps a declined answer out of every counted bucket', () => {
    expect(classifyAttribution({ ...base, source: 'prefer_not_to_say' })).toBe('unknown');
    expect(classifyAttribution({ ...base, source: '' })).toBe('unknown');
  });
});

describe('hasClickEvidence', () => {
  it('is false only when every tracked signal is absent', () => {
    expect(hasClickEvidence(base)).toBe(false);
    expect(hasClickEvidence({ ...base, referrer_domain: 'x.com' })).toBe(true);
    expect(hasClickEvidence({ ...base, utm_source: 'li' })).toBe(true);
    expect(hasClickEvidence({ ...base, gclid: 'z' })).toBe(true);
  });
});

describe('referrer matching', () => {
  it('recognises assistant hostnames including subdomains', () => {
    expect(isAiReferrerDomain('chatgpt.com')).toBe(true);
    expect(isAiReferrerDomain('gemini.google.com')).toBe(true);
    expect(isAiReferrerDomain('claude.ai')).toBe(true);
  });

  it('does not match ordinary referrers', () => {
    expect(isAiReferrerDomain('news.ycombinator.com')).toBe(false);
    expect(isAiReferrerDomain(null)).toBe(false);
  });
});

describe('source list', () => {
  it('has unique values and a label for each', () => {
    const values = SIGNUP_SOURCES.map((s) => s.value);
    expect(new Set(values).size).toBe(values.length);
    for (const s of SIGNUP_SOURCES) expect(sourceLabel(s.value)).toBe(s.label);
  });

  it('marks every assistant option as AI and nothing else', () => {
    expect(SIGNUP_SOURCES.filter((s) => s.ai).map((s) => s.value)).toEqual([
      'chatgpt', 'claude', 'perplexity', 'gemini', 'grok', 'copilot', 'other_ai',
    ]);
    expect(isAiSource('google_search')).toBe(false);
  });
});

describe('normaliseAttribution', () => {
  it('accepts a well-formed payload and derives the referrer domain', () => {
    const a = normaliseAttribution({
      source: 'chatgpt',
      referrer: 'https://www.chatgpt.com/c/abc',
      landingPath: '/pricing?utm_source=x',
      utmSource: 'x',
      promoCode: 'AGENT10',
    });
    expect(a.source).toBe('chatgpt');
    expect(a.referrerDomain).toBe('chatgpt.com'); // www. stripped
    expect(a.utmSource).toBe('x');
    expect(a.promoCode).toBe('AGENT10');
  });

  it('rejects an unknown source rather than storing it free-form', () => {
    // The payload is unauthenticated, so `source` must be a closed set -
    // otherwise the admin panel groups by attacker-supplied strings.
    expect(normaliseAttribution({ source: 'chatgpt; DROP TABLE users' }).source).toBe('unknown');
    expect(normaliseAttribution({ source: 42 }).source).toBe('unknown');
    expect(isValidSource('chatgpt')).toBe(true);
  });

  it('survives a missing payload entirely', () => {
    const a = normaliseAttribution(undefined);
    expect(a.source).toBe('unknown');
    expect(a.referrer).toBeNull();
    expect(a.referrerDomain).toBeNull();
  });

  it('caps free text and collapses blanks to null', () => {
    const a = normaliseAttribution({ source: 'other', sourceDetail: 'x'.repeat(500), utmSource: '   ' });
    expect(a.sourceDetail).toHaveLength(200);
    expect(a.utmSource).toBeNull();
  });

  it('does not invent a referrer domain from a malformed referrer', () => {
    expect(normaliseAttribution({ source: 'other', referrer: 'not a url' }).referrerDomain).toBeNull();
  });
});
