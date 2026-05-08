import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

import { shouldAttachChatGPTWebSearch, resolveChatGPTModel } from '../ai-platforms';

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
