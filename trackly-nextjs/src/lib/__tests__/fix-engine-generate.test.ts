/**
 * Fix Engine - generateJson robustness.
 *
 * The JSON path used to be one naive slice (first `{` to last `}`) with no
 * retry, so a single malformed or budget-truncated reply failed the fix
 * outright - surfacing to users as "Model did not return valid JSON" with a
 * credit already spent. These tests pin the repair-first behaviour: fence
 * stripping, string-aware balanced extraction, and exactly one retry with a
 * doubled output budget when the first reply doesn't parse.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const ai = vi.hoisted(() => ({
  replies: [] as Array<{ text: string; truncated?: boolean }>,
  calls: [] as Array<{ query: string; maxTokens?: number }>,
}));

vi.mock('@/lib/ai-platforms', () => ({
  queryAI: vi.fn(async (_platform: string, query: string, _key: string, _model: string, _brand: unknown, options?: { maxTokens?: number }) => {
    ai.calls.push({ query, maxTokens: options?.maxTokens });
    const next = ai.replies.shift() ?? { text: '' };
    return { text: next.text, model: 'claude-fable-5', tokensIn: 10, tokensOut: 10, citations: [], truncated: next.truncated };
  }),
  getDefaultModel: () => 'claude-fable-5',
  pickBestKey: () => 'key',
  acquirePlatformSlot: async () => () => {},
}));
vi.mock('@/lib/tenant-keys', () => ({
  resolveKeysForTenant: vi.fn(async () => ({ source: 'user', key: 'key' })),
}));
vi.mock('@/lib/server-keys', () => ({ getServerKeys: () => ({}) }));
vi.mock('@/lib/fix-engine/seo-brain', () => ({ getSeoBrain: async () => 'brain' }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { extractJsonObject, generateJson, JSON_MIN_BUDGET } from '@/lib/fix-engine/generate';
import type { FixContext } from '@/lib/fix-engine/types';

const ctx = {
  brand: { id: 'b1', userId: 'u1', name: 'Acme' },
  tenantId: 'u1', userKeysLegacy: {},
} as unknown as FixContext;

beforeEach(() => {
  ai.replies = [];
  ai.calls = [];
  vi.clearAllMocks();
});

describe('extractJsonObject', () => {
  it('finds a bare object', () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  it('ignores prose before and after, even when the trailing prose has a brace', () => {
    // The old last-`}` slice grabbed through the trailing `}` and failed.
    const text = 'Here you go:\n{"a":{"b":2}}\nHope that helps! (see {docs})';
    expect(extractJsonObject(text)).toBe('{"a":{"b":2}}');
  });

  it('does not count braces inside string values', () => {
    const text = '{"tpl":"use {curly} braces","n":1}';
    expect(extractJsonObject(text)).toBe(text);
  });

  it('survives escaped quotes inside strings', () => {
    const text = '{"q":"she said \\"hi {there}\\" today"}';
    expect(extractJsonObject(text)).toBe(text);
  });

  it('returns null for an object that never closes (truncated reply)', () => {
    expect(extractJsonObject('{"title":"cut off mid-')).toBeNull();
  });

  it('skips a stray opening brace in leading prose', () => {
    expect(extractJsonObject('weird { prose with no close\n')).toBeNull();
    // The stray `{` balances against the trailing `}` and swallows the real
    // object - that slice isn't JSON, so the scan moves to the next start
    // and returns the object that actually parses.
    expect(extractJsonObject('note { unclosed\n{"a":1} }')).toBe('{"a":1}');
  });
});

describe('generateJson', () => {
  it('parses a fenced reply first try, with no retry call', async () => {
    ai.replies = [{ text: '```json\n{"title":"A"}\n```' }];
    const { data } = await generateJson<{ title: string }>({ ctx, system: 's', user: 'u', platform: 'Claude' });
    expect(data.title).toBe('A');
    expect(ai.calls).toHaveLength(1);
  });

  it('floors a tiny module budget - a ceiling is not a spend, but hitting it wastes the whole call', async () => {
    ai.replies = [{ text: '{"title":"A"}' }];
    await generateJson<{ title: string }>({ ctx, system: 's', user: 'u', maxTokens: 500, platform: 'Claude' });
    expect(ai.calls[0].maxTokens).toBe(JSON_MIN_BUDGET);
  });

  it('respects a module budget already above the floor', async () => {
    ai.replies = [{ text: '{"title":"A"}' }];
    await generateJson<{ title: string }>({ ctx, system: 's', user: 'u', maxTokens: 5000, platform: 'Claude' });
    expect(ai.calls[0].maxTokens).toBe(5000);
  });

  it('retries ONCE with a doubled budget and an only-JSON reminder when the first reply is cut off', async () => {
    // A reasoning-heavy model can spend most of the budget before the
    // JSON; the retry has to raise the ceiling, not just scold the format.
    ai.replies = [
      { text: 'Thinking about it... {"title":"never clo', truncated: true },
      { text: '{"title":"B"}' },
    ];
    const { data } = await generateJson<{ title: string }>({ ctx, system: 's', user: 'u', maxTokens: 500, platform: 'Claude' });
    expect(data.title).toBe('B');
    expect(ai.calls).toHaveLength(2);
    expect(ai.calls[1].maxTokens).toBe(JSON_MIN_BUDGET * 2);
    expect(ai.calls[1].query).toMatch(/ONLY the JSON object/);
  });

  it('names the truncation in the error when both attempts are cut off', async () => {
    ai.replies = [
      { text: '{"a":"cut', truncated: true },
      { text: '{"a":"cut again', truncated: true },
    ];
    await expect(generateJson({ ctx, system: 's', user: 'u', platform: 'Claude' }))
      .rejects.toThrow(/cut off at the output limit/);
    expect(ai.calls).toHaveLength(2);
  });

  it('fails with the model named after one retry on plain bad JSON', async () => {
    ai.replies = [{ text: 'not json at all' }, { text: 'still not json' }];
    await expect(generateJson({ ctx, system: 's', user: 'u', platform: 'Claude' }))
      .rejects.toThrow(/Claude\/claude-fable-5/);
    expect(ai.calls).toHaveLength(2);
  });
});
