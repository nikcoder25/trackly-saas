import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

import { shouldAttachChatGPTWebSearch, resolveChatGPTModel, isFreshnessOrLocalQuery } from '../ai-platforms';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.CHATGPT_WEB_SEARCH_GATING;
  delete process.env.CHATGPT_SMART_MODEL_ROUTING;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('shouldAttachChatGPTWebSearch', () => {
  it('suppresses web_search_options for clearly definitional queries', () => {
    expect(shouldAttachChatGPTWebSearch('What is HTTP?')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('Explain React hooks')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('how does TLS work')).toBe(false);
  });

  it('keeps web_search_options for freshness/local/comparison queries', () => {
    expect(shouldAttachChatGPTWebSearch('best CRM in 2026')).toBe(true);
    expect(shouldAttachChatGPTWebSearch('top dentists near me')).toBe(true);
    expect(shouldAttachChatGPTWebSearch('Stripe vs Adyen pricing')).toBe(true);
    expect(shouldAttachChatGPTWebSearch('latest iPhone reviews')).toBe(true);
  });

  it('keeps web_search_options when intent is unclear', () => {
    expect(shouldAttachChatGPTWebSearch('Acme Corp customer support')).toBe(true);
    expect(shouldAttachChatGPTWebSearch('')).toBe(true);
  });

  it('keeps web_search_options when definitional + local qualifier overlaps', () => {
    expect(shouldAttachChatGPTWebSearch('What is the best dentist in Austin')).toBe(true);
  });

  it('respects the kill switch', () => {
    process.env.CHATGPT_WEB_SEARCH_GATING = 'false';
    expect(shouldAttachChatGPTWebSearch('What is HTTP?')).toBe(true);
  });
});

describe('resolveChatGPTModel (regression - shared heuristic)', () => {
  it('routes definitional queries off search-preview models', () => {
    expect(resolveChatGPTModel('What is HTTP?', 'gpt-4o-mini-search-preview'))
      .toBe('gpt-4o');
  });

  it('keeps search-preview model for freshness queries', () => {
    expect(resolveChatGPTModel('best CRM in 2026', 'gpt-4o-mini-search-preview'))
      .toBe('gpt-4o-mini-search-preview');
  });

  it('leaves non-search admin model alone', () => {
    expect(resolveChatGPTModel('What is HTTP?', 'gpt-4o')).toBe('gpt-4o');
  });
});

// Static-comparison nouns ("alternatives", "competitors", "similar") were
// added to NON_SEARCH_INTENT_RE so daily-cron landscape queries can answer
// from training data without burning web_search quota. These tests pin
// the new matches and the precedence with FRESHNESS_OR_LOCAL_RE.
describe('NON_SEARCH_INTENT_RE — static-comparison nouns', () => {
  it('suppresses web_search for alternatives/competitors/similar queries', () => {
    expect(shouldAttachChatGPTWebSearch('alternatives to Stripe')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('Stripe alternatives')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('Slack alternative')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('Salesforce competitor')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('Salesforce competitors')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('similar to Notion')).toBe(false);
  });

  it('routes static-comparison queries off search-preview models', () => {
    expect(resolveChatGPTModel('Stripe alternatives', 'gpt-4o-mini-search-preview'))
      .toBe('gpt-4o');
    expect(resolveChatGPTModel('Salesforce competitors', 'gpt-4o-mini-search-preview'))
      .toBe('gpt-4o');
  });

  it('keeps web_search when a freshness qualifier overrides the noun gate', () => {
    // "best alternatives" / "top competitors" — NON_SEARCH matches the
    // noun, but FRESHNESS_OR_LOCAL_RE matches "best"/"top" and wins.
    expect(shouldAttachChatGPTWebSearch('best alternatives to Stripe')).toBe(true);
    expect(shouldAttachChatGPTWebSearch('top competitors of Salesforce')).toBe(true);
  });

  it('vs/versus stays in the freshness gate: precedence keeps web_search ON', () => {
    // vs/versus is in BOTH regexes; FRESHNESS_OR_LOCAL_RE takes
    // precedence in isNonSearchIntentQuery, so these still hit web_search.
    expect(shouldAttachChatGPTWebSearch('Stripe vs Adyen')).toBe(true);
    expect(shouldAttachChatGPTWebSearch('Notion versus Coda')).toBe(true);
  });

  it('respects the kill switch for the new keywords too', () => {
    process.env.CHATGPT_WEB_SEARCH_GATING = 'false';
    expect(shouldAttachChatGPTWebSearch('Stripe alternatives')).toBe(true);
  });
});

// FRESHNESS_OR_LOCAL_RE was narrowed (May-11 web_search cost incident)
// by removing `best`, `top`, and bare year `20\d{2}` and by extending
// the temporal alternative to `this (week|year)`. These tests pin the
// new surface at the regex layer.
describe('isFreshnessOrLocalQuery — narrowed surface', () => {
  it('"best CRM 2026" no longer matches (best AND 2026 both removed)', () => {
    expect(isFreshnessOrLocalQuery('best CRM 2026')).toBe(false);
  });

  it('"top plumbers" no longer matches (top removed)', () => {
    expect(isFreshnessOrLocalQuery('top plumbers')).toBe(false);
  });

  it('"plumbers near me" still matches (local intent preserved)', () => {
    expect(isFreshnessOrLocalQuery('plumbers near me')).toBe(true);
  });

  it('"latest iPhone" still matches (recency intent preserved)', () => {
    expect(isFreshnessOrLocalQuery('latest iPhone')).toBe(true);
  });

  it('keeps the rest of the freshness/local vocabulary intact', () => {
    // Recency / time-relative
    expect(isFreshnessOrLocalQuery('news today')).toBe(true);
    expect(isFreshnessOrLocalQuery('events this week')).toBe(true);
    expect(isFreshnessOrLocalQuery("this year's hottest startups")).toBe(true);
    // Local
    expect(isFreshnessOrLocalQuery('dentist in Austin')).toBe(true);
    // Recommendation / comparison qualifiers
    expect(isFreshnessOrLocalQuery('recommended CRM software')).toBe(true);
    expect(isFreshnessOrLocalQuery('Stripe pricing')).toBe(true);
    expect(isFreshnessOrLocalQuery('Notion vs Coda')).toBe(true);
    expect(isFreshnessOrLocalQuery('product reviews')).toBe(true);
  });

  it('bare year mentions no longer force freshness', () => {
    // "2026" alone was a freshness signal under the old regex; brand
    // queries routinely reference the current year without needing
    // live web data on a daily cron.
    expect(isFreshnessOrLocalQuery('iPhone 2025 features')).toBe(false);
    expect(isFreshnessOrLocalQuery('Tesla 2026 lineup')).toBe(false);
  });

  it('empty / whitespace-only input is not a freshness query', () => {
    expect(isFreshnessOrLocalQuery('')).toBe(false);
    expect(isFreshnessOrLocalQuery('   ')).toBe(false);
  });
});

// Cascade behaviour: for queries that ALSO match NON_SEARCH_INTENT_RE,
// the freshness narrowing now lets more queries skip web_search.
// "What is the best plumber" used to be gated back to web_search by
// FRESHNESS matching "best"; with `best` removed, the
// definitional-intent path wins and web_search is suppressed.
describe('shouldAttachChatGPTWebSearch — flips after freshness narrowing', () => {
  it('"What is the best plumber" now skips web_search (best no longer gates)', () => {
    expect(shouldAttachChatGPTWebSearch('What is the best plumber')).toBe(false);
  });

  it('"What are the top CRM tools" now skips web_search (top no longer gates)', () => {
    expect(shouldAttachChatGPTWebSearch('What are the top CRM tools')).toBe(false);
  });

  it('"What is the best dentist in Austin" STILL attaches (local override holds)', () => {
    // FRESHNESS still matches `in Austin` via `in \w+`, so the
    // location signal carries the day.
    expect(shouldAttachChatGPTWebSearch('What is the best dentist in Austin')).toBe(true);
  });

  it('"What is HTTP" continues to skip web_search (pure definitional)', () => {
    expect(shouldAttachChatGPTWebSearch('What is HTTP?')).toBe(false);
  });

  it('"plumbers near me" continues to attach web_search (location-only)', () => {
    expect(shouldAttachChatGPTWebSearch('plumbers near me')).toBe(true);
  });
});
