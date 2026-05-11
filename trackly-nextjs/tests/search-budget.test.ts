import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  tryConsumeSearchBudget,
  getSearchBudgetLimit,
  getSearchFallbackModel,
  resolveSearchModelWithBudget,
  __test__,
} from '../src/lib/search-budget';
import { _setLimiterRedisForTests, type RedisLikeClient } from '../src/lib/redis';

vi.mock('../src/lib/logger', () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

interface StringEntry { value: string; expireAt: number | null }
interface FakeRedisStore {
  strings: Map<string, StringEntry>;
}

function makeFakeRedis(store: FakeRedisStore): RedisLikeClient {
  function evictIfExpired(key: string): void {
    const entry = store.strings.get(key);
    if (entry?.expireAt != null && entry.expireAt <= Date.now()) {
      store.strings.delete(key);
    }
  }
  // Mirror of CONSUME_LUA in JS so the test exercises the same semantics
  // as the prod Lua script without spinning up a Redis daemon.
  function evalConsume(keys: string[], argv: string[]): [number, number, number] {
    const key = keys[0];
    const limit = Number(argv[0]);
    const ttlSeconds = Number(argv[1]);
    evictIfExpired(key);
    const current = Number(store.strings.get(key)?.value || '0');
    if (current >= limit) return [0, current, limit];
    const next = current + 1;
    const existing = store.strings.get(key);
    store.strings.set(key, {
      value: String(next),
      // EXPIRE is only set on first INSERT (newVal === 1), matching the script.
      expireAt: next === 1 ? Date.now() + ttlSeconds * 1000 : (existing?.expireAt ?? null),
    });
    return [1, next, limit];
  }

  return {
    on: () => {},
    off: () => {},
    eval: vi.fn(async (script: string, _numKeys: number, ...rest: string[]) => {
      // We split rest into keys/argv based on numKeys.
      const numKeys = Number(_numKeys);
      const keys = rest.slice(0, numKeys);
      const argv = rest.slice(numKeys);
      if (script.includes("redis.call('INCR', KEYS[1])")) {
        return evalConsume(keys, argv);
      }
      throw new Error('unexpected eval script in test fake');
    }),
    get: vi.fn(async (key: string) => {
      evictIfExpired(key);
      return store.strings.get(key)?.value ?? null;
    }),
  } as unknown as RedisLikeClient;
}

let store: FakeRedisStore;
let fake: RedisLikeClient;

beforeEach(() => {
  store = { strings: new Map() };
  fake = makeFakeRedis(store);
  _setLimiterRedisForTests(fake);
  // Budget is enabled by default since the May-11 incident; clear any
  // stray kill-switch from a prior test so each case starts from the
  // production default.
  delete process.env.AI_SEARCH_BUDGET_ENABLED;
  delete process.env.AI_SEARCH_BUDGET_DEFAULT;
  delete process.env.AI_SEARCH_BUDGET_CHATGPT;
  delete process.env.AI_SEARCH_BUDGET_PERPLEXITY;
});

afterEach(() => {
  _setLimiterRedisForTests(null);
  vi.clearAllMocks();
  delete process.env.AI_SEARCH_BUDGET_ENABLED;
});

describe('getSearchBudgetLimit', () => {
  it('falls back to AI_SEARCH_BUDGET_DEFAULT when no platform override is set', () => {
    process.env.AI_SEARCH_BUDGET_DEFAULT = '500';
    expect(getSearchBudgetLimit('ChatGPT')).toBe(500);
    expect(getSearchBudgetLimit('Perplexity')).toBe(500);
  });

  it('per-platform override takes precedence over the default', () => {
    process.env.AI_SEARCH_BUDGET_DEFAULT = '500';
    process.env.AI_SEARCH_BUDGET_CHATGPT = '100';
    expect(getSearchBudgetLimit('ChatGPT')).toBe(100);
    expect(getSearchBudgetLimit('Perplexity')).toBe(500);
  });

  it('returns the ChatGPT default cap of 600 when no env vars are set', () => {
    // 600 calls/day = $15/day ceiling at $25/1k web_search invocations.
    expect(getSearchBudgetLimit('ChatGPT')).toBe(600);
  });

  it('has no default cap for non-ChatGPT platforms', () => {
    expect(getSearchBudgetLimit('Perplexity')).toBe(0);
    expect(getSearchBudgetLimit('Claude')).toBe(0);
    expect(getSearchBudgetLimit('Gemini')).toBe(0);
    expect(getSearchBudgetLimit('Grok')).toBe(0);
  });

  it('AI_SEARCH_BUDGET_DEFAULT overrides the ChatGPT platform default', () => {
    process.env.AI_SEARCH_BUDGET_DEFAULT = '100';
    expect(getSearchBudgetLimit('ChatGPT')).toBe(100);
    expect(getSearchBudgetLimit('Perplexity')).toBe(100);
  });

  it('AI_SEARCH_BUDGET_CHATGPT=0 opts ChatGPT out without affecting others', () => {
    process.env.AI_SEARCH_BUDGET_CHATGPT = '0';
    expect(getSearchBudgetLimit('ChatGPT')).toBe(0);
    expect(getSearchBudgetLimit('Perplexity')).toBe(0);
  });

  it('treats negative or non-numeric ChatGPT overrides as unset (falls back to default cap)', () => {
    process.env.AI_SEARCH_BUDGET_CHATGPT = '-5';
    expect(getSearchBudgetLimit('ChatGPT')).toBe(600);
    process.env.AI_SEARCH_BUDGET_CHATGPT = 'banana';
    expect(getSearchBudgetLimit('ChatGPT')).toBe(600);
  });
});

describe('getSearchFallbackModel', () => {
  it('returns gpt-4o for ChatGPT search-preview models', () => {
    expect(getSearchFallbackModel('ChatGPT', 'gpt-4o-mini-search-preview')).toBe('gpt-4o');
    expect(getSearchFallbackModel('ChatGPT', 'gpt-5-search-api')).toBe('gpt-4o');
  });

  it('returns null for ChatGPT non-search models', () => {
    expect(getSearchFallbackModel('ChatGPT', 'gpt-4o')).toBeNull();
  });

  it('returns null for Perplexity (search-native, no fallback)', () => {
    expect(getSearchFallbackModel('Perplexity', 'sonar-pro')).toBeNull();
  });

  it('returns null for non-search-capable platforms', () => {
    expect(getSearchFallbackModel('Claude', 'claude-3-5-sonnet')).toBeNull();
    expect(getSearchFallbackModel('Gemini', 'gemini-2.5-pro')).toBeNull();
  });
});

describe('tryConsumeSearchBudget', () => {
  it('engages the budget by default when AI_SEARCH_BUDGET_ENABLED is unset', async () => {
    // Post-incident default: enabled. ChatGPT's 600-call cap means the
    // very first call lands at used=1, not at the no-op disabled path.
    const result = await tryConsumeSearchBudget('ChatGPT');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('consumed');
    expect(result.used).toBe(1);
    expect(result.limit).toBe(600);
    expect((fake.eval as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it('is a no-op pass when AI_SEARCH_BUDGET_ENABLED=false (kill switch)', async () => {
    process.env.AI_SEARCH_BUDGET_ENABLED = 'false';
    process.env.AI_SEARCH_BUDGET_CHATGPT = '5';
    const result = await tryConsumeSearchBudget('ChatGPT');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('disabled');
    expect((fake.eval as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('is a no-op pass when the platform limit is explicitly 0', async () => {
    process.env.AI_SEARCH_BUDGET_CHATGPT = '0';
    const result = await tryConsumeSearchBudget('ChatGPT');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('disabled');
    expect((fake.eval as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('is a no-op pass for platforms without a default cap (e.g. Perplexity)', async () => {
    const result = await tryConsumeSearchBudget('Perplexity');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('disabled');
    expect((fake.eval as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('allows the first call and increments the daily counter', async () => {
    process.env.AI_SEARCH_BUDGET_CHATGPT = '3';
    const result = await tryConsumeSearchBudget('ChatGPT');
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(1);
    expect(result.limit).toBe(3);
    expect(result.remaining).toBe(2);
    expect(result.reason).toBe('consumed');
  });

  it('denies the call once the daily limit is exhausted', async () => {
    process.env.AI_SEARCH_BUDGET_CHATGPT = '2';
    const a = await tryConsumeSearchBudget('ChatGPT');
    const b = await tryConsumeSearchBudget('ChatGPT');
    const c = await tryConsumeSearchBudget('ChatGPT');
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    expect(c.allowed).toBe(false);
    expect(c.reason).toBe('over-limit');
    expect(c.used).toBe(2);
    expect(c.remaining).toBe(0);
  });

  it('keeps separate counters per platform', async () => {
    process.env.AI_SEARCH_BUDGET_DEFAULT = '1';
    const cg = await tryConsumeSearchBudget('ChatGPT');
    const px = await tryConsumeSearchBudget('Perplexity');
    expect(cg.allowed).toBe(true);
    expect(px.allowed).toBe(true);
    // Both used their first slot independently.
    const cg2 = await tryConsumeSearchBudget('ChatGPT');
    const px2 = await tryConsumeSearchBudget('Perplexity');
    expect(cg2.allowed).toBe(false);
    expect(px2.allowed).toBe(false);
  });

  it('fails open (allowed=true) when no Redis client is available', async () => {
    _setLimiterRedisForTests(null);
    process.env.AI_SEARCH_BUDGET_CHATGPT = '1';
    const result = await tryConsumeSearchBudget('ChatGPT');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('no-redis');
    expect(result.limit).toBe(1);
    expect(result.remaining).toBe(1);
  });

  it('fails open when the Redis EVAL throws', async () => {
    process.env.AI_SEARCH_BUDGET_CHATGPT = '1';
    (fake.eval as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('redis down'));
    const result = await tryConsumeSearchBudget('ChatGPT');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('redis-error');
  });

  it('dryRun peeks without incrementing the counter', async () => {
    process.env.AI_SEARCH_BUDGET_CHATGPT = '5';
    await tryConsumeSearchBudget('ChatGPT'); // used = 1
    const peek1 = await tryConsumeSearchBudget('ChatGPT', { dryRun: true });
    const peek2 = await tryConsumeSearchBudget('ChatGPT', { dryRun: true });
    expect(peek1.used).toBe(1);
    expect(peek2.used).toBe(1);
    expect(peek1.remaining).toBe(4);
  });

  it('writes under a date-stamped key per UTC day', async () => {
    process.env.AI_SEARCH_BUDGET_CHATGPT = '5';
    await tryConsumeSearchBudget('ChatGPT');
    const today = __test__.todayUtc();
    expect(store.strings.has(__test__.budgetKey('ChatGPT', today))).toBe(true);
  });

  it('sets a TTL on first write so the counter auto-evicts overnight', async () => {
    process.env.AI_SEARCH_BUDGET_CHATGPT = '5';
    await tryConsumeSearchBudget('ChatGPT');
    const today = __test__.todayUtc();
    const entry = store.strings.get(__test__.budgetKey('ChatGPT', today));
    expect(entry?.expireAt).not.toBeNull();
    // Window must be at least 24h to outlast the day.
    expect((entry!.expireAt! - Date.now()) >= 24 * 60 * 60 * 1000).toBe(true);
  });
});

describe('resolveSearchModelWithBudget', () => {
  it('passes through unchanged when the call is not search-enabled', async () => {
    process.env.AI_SEARCH_BUDGET_CHATGPT = '0';
    const result = await resolveSearchModelWithBudget({
      platform: 'ChatGPT', model: 'gpt-4o', isSearch: false,
    });
    expect(result.model).toBe('gpt-4o');
    expect(result.searchEnabled).toBe(false);
    expect(result.downgraded).toBe(false);
  });

  it('passes through when the budget is not yet exhausted', async () => {
    process.env.AI_SEARCH_BUDGET_CHATGPT = '5';
    const result = await resolveSearchModelWithBudget({
      platform: 'ChatGPT', model: 'gpt-4o-mini-search-preview', isSearch: true,
    });
    expect(result.model).toBe('gpt-4o-mini-search-preview');
    expect(result.searchEnabled).toBe(true);
    expect(result.downgraded).toBe(false);
    expect(result.budget.allowed).toBe(true);
  });

  it('downgrades ChatGPT search-preview to gpt-4o when the budget is exhausted', async () => {
    process.env.AI_SEARCH_BUDGET_CHATGPT = '1';
    await resolveSearchModelWithBudget({
      platform: 'ChatGPT', model: 'gpt-4o-mini-search-preview', isSearch: true,
    });
    const next = await resolveSearchModelWithBudget({
      platform: 'ChatGPT', model: 'gpt-4o-mini-search-preview', isSearch: true,
    });
    expect(next.downgraded).toBe(true);
    expect(next.model).toBe('gpt-4o');
    expect(next.searchEnabled).toBe(false);
  });

  it('keeps Perplexity on its search model when the budget is exhausted (no fallback exists)', async () => {
    process.env.AI_SEARCH_BUDGET_PERPLEXITY = '1';
    await resolveSearchModelWithBudget({
      platform: 'Perplexity', model: 'sonar-pro', isSearch: true,
    });
    const next = await resolveSearchModelWithBudget({
      platform: 'Perplexity', model: 'sonar-pro', isSearch: true,
    });
    // Fail-open: no useful fallback, so we let the call through with a warning.
    expect(next.downgraded).toBe(false);
    expect(next.model).toBe('sonar-pro');
    expect(next.searchEnabled).toBe(true);
    expect(next.budget.allowed).toBe(false);
  });
});
