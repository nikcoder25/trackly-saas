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
  delete process.env.WEB_SEARCH_DEFAULT_OFF;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// web_search is OFF by default. shouldAttachChatGPTWebSearch only flips
// ON when the query contains one of: news, latest, today, this week,
// 2026, price, pricing, cost. Every other brand-tracking query answers
// from training data without the $0.030/call surcharge.
describe('shouldAttachChatGPTWebSearch - off by default', () => {
  it('attaches web_search only for explicit freshness/price keywords', () => {
    expect(shouldAttachChatGPTWebSearch('news today')).toBe(true);
    expect(shouldAttachChatGPTWebSearch('latest iPhone reviews')).toBe(true);
    expect(shouldAttachChatGPTWebSearch('Stripe pricing')).toBe(true);
    expect(shouldAttachChatGPTWebSearch('best CRM in 2026')).toBe(true);
    expect(shouldAttachChatGPTWebSearch('events this week')).toBe(true);
    expect(shouldAttachChatGPTWebSearch('iPhone price')).toBe(true);
    expect(shouldAttachChatGPTWebSearch('cost of Salesforce')).toBe(true);
  });

  it('skips web_search for definitional queries', () => {
    expect(shouldAttachChatGPTWebSearch('What is HTTP?')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('Explain React hooks')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('how does TLS work')).toBe(false);
  });

  it('skips web_search for local/comparison/recommendation queries (training data is fine)', () => {
    expect(shouldAttachChatGPTWebSearch('top dentists near me')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('Stripe vs Adyen')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('Notion versus Coda')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('alternatives to Stripe')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('Salesforce competitors')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('recommend a CRM')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('product reviews')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('dentist in Austin')).toBe(false);
  });

  it('skips web_search for brand mentions and empty input', () => {
    expect(shouldAttachChatGPTWebSearch('Acme Corp customer support')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('   ')).toBe(false);
  });

  it('respects the kill switch (CHATGPT_WEB_SEARCH_GATING=false attaches everything)', () => {
    process.env.CHATGPT_WEB_SEARCH_GATING = 'false';
    expect(shouldAttachChatGPTWebSearch('What is HTTP?')).toBe(true);
    expect(shouldAttachChatGPTWebSearch('Acme Corp customer support')).toBe(true);
  });
});

// WEB_SEARCH_DEFAULT_OFF=true swaps the permissive legacy regex out for
// the strict freshness classifier (decideRequiresFreshness). The previous
// describe block exercises the legacy regex path; this one pins the
// strict path behind the flag. Flipping the flag false at runtime is the
// one-step rollback documented in the PR body.
describe('shouldAttachChatGPTWebSearch - WEB_SEARCH_DEFAULT_OFF=true (strict classifier)', () => {
  it('attaches web_search ONLY for strict freshness anchors', () => {
    process.env.WEB_SEARCH_DEFAULT_OFF = 'true';
    expect(shouldAttachChatGPTWebSearch('news today')).toBe(true);
    expect(shouldAttachChatGPTWebSearch('breaking news on Stripe')).toBe(true);
    expect(shouldAttachChatGPTWebSearch('Tesla stock price')).toBe(true);
    expect(shouldAttachChatGPTWebSearch('weather in Austin')).toBe(true);
  });

  it('drops "this <period>" and standalone present-tense queries (narrowed allowlist)', () => {
    process.env.WEB_SEARCH_DEFAULT_OFF = 'true';
    // `current_period` and `present_tense_anchor` were dropped from the
    // strict allowlist in the May cost-reduction pass - these no longer
    // attach web_search even under strict mode.
    expect(shouldAttachChatGPTWebSearch('events this week')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('launches this month')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('outages right now')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('what is currently trending')).toBe(false);
  });

  it('drops everything the legacy regex would have caught without a freshness anchor', () => {
    process.env.WEB_SEARCH_DEFAULT_OFF = 'true';
    // Legacy regex caught these via `pricing`, `price`, `cost`, `2026`,
    // `latest`. Strict classifier rejects them - no time anchor.
    expect(shouldAttachChatGPTWebSearch('Stripe pricing')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('iPhone price')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('cost of Salesforce')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('best CRM in 2026')).toBe(false);
    expect(shouldAttachChatGPTWebSearch('latest iPhone reviews')).toBe(false);
  });

  it('still attaches everything when CHATGPT_WEB_SEARCH_GATING=false (kill switch wins)', () => {
    process.env.WEB_SEARCH_DEFAULT_OFF = 'true';
    process.env.CHATGPT_WEB_SEARCH_GATING = 'false';
    expect(shouldAttachChatGPTWebSearch('What is HTTP?')).toBe(true);
    expect(shouldAttachChatGPTWebSearch('Stripe pricing')).toBe(true);
  });

  it('flipping WEB_SEARCH_DEFAULT_OFF=false (or unset) restores the legacy regex', () => {
    // Set to literal "false" - explicit rollback.
    process.env.WEB_SEARCH_DEFAULT_OFF = 'false';
    expect(shouldAttachChatGPTWebSearch('Stripe pricing')).toBe(true);
    // Unset - same as never-deployed.
    delete process.env.WEB_SEARCH_DEFAULT_OFF;
    expect(shouldAttachChatGPTWebSearch('Stripe pricing')).toBe(true);
  });
});

describe('resolveChatGPTModel (definitional → non-search fallback)', () => {
  it('routes definitional queries off search-preview models', () => {
    expect(resolveChatGPTModel('What is HTTP?', 'gpt-4o-mini-search-preview'))
      .toBe('gpt-4o');
  });

  it('leaves non-search admin model alone', () => {
    expect(resolveChatGPTModel('What is HTTP?', 'gpt-5.4-mini')).toBe('gpt-5.4-mini');
  });

  it('routes static-comparison queries off search-preview models', () => {
    expect(resolveChatGPTModel('Stripe alternatives', 'gpt-4o-mini-search-preview'))
      .toBe('gpt-4o');
    expect(resolveChatGPTModel('Salesforce competitors', 'gpt-4o-mini-search-preview'))
      .toBe('gpt-4o');
  });
});

// FRESHNESS_OR_LOCAL_RE was narrowed for the May 12 cost-reduction
// effort to: news | latest | today | this week | 2026 | price | pricing
// | cost. Anything else is assumed to be answerable from training data.
describe('isFreshnessOrLocalQuery - narrowed surface', () => {
  it('matches the kept freshness/price vocabulary', () => {
    expect(isFreshnessOrLocalQuery('news today')).toBe(true);
    expect(isFreshnessOrLocalQuery('latest iPhone')).toBe(true);
    expect(isFreshnessOrLocalQuery('events this week')).toBe(true);
    expect(isFreshnessOrLocalQuery('Tesla 2026 lineup')).toBe(true);
    expect(isFreshnessOrLocalQuery('Stripe pricing')).toBe(true);
    expect(isFreshnessOrLocalQuery('iPhone price')).toBe(true);
    expect(isFreshnessOrLocalQuery('cost of Salesforce')).toBe(true);
  });

  it('no longer matches local, comparison, recommendation, or review vocabulary', () => {
    expect(isFreshnessOrLocalQuery('plumbers near me')).toBe(false);
    expect(isFreshnessOrLocalQuery('dentist in Austin')).toBe(false);
    expect(isFreshnessOrLocalQuery('Notion vs Coda')).toBe(false);
    expect(isFreshnessOrLocalQuery('Stripe versus Adyen')).toBe(false);
    expect(isFreshnessOrLocalQuery('recommended CRM software')).toBe(false);
    expect(isFreshnessOrLocalQuery('product reviews')).toBe(false);
    expect(isFreshnessOrLocalQuery('compare Stripe and Adyen')).toBe(false);
  });

  it('does not match bare year references other than 2026', () => {
    expect(isFreshnessOrLocalQuery('iPhone 2025 features')).toBe(false);
    expect(isFreshnessOrLocalQuery('best CRM 2024')).toBe(false);
  });

  it('empty / whitespace-only input is not a freshness query', () => {
    expect(isFreshnessOrLocalQuery('')).toBe(false);
    expect(isFreshnessOrLocalQuery('   ')).toBe(false);
  });
});
