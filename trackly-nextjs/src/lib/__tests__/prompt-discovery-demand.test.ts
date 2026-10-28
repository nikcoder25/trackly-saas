/**
 * Tests for the demand ranking in src/lib/prompt-discovery.ts.
 *
 * `rankByDemand` sorts; it must never filter. The temptation with volume
 * data is to drop the zero-volume prompts, and for this product that
 * would be precisely wrong: DataForSEO has no AI search volume for local
 * or "near me" queries, so the prompts a local HVAC company most needs to
 * track are exactly the ones with no number beside them. Dropping them
 * would leave the customer tracking national head terms they cannot rank
 * for while ignoring the searches that bring them work.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({ pool: { query: vi.fn().mockResolvedValue({ rows: [] }) } }));
vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../ai-platforms', () => ({ queryAI: vi.fn(), getDefaultModel: vi.fn() }));
vi.mock('../generator-key', () => ({ resolveGeneratorKey: vi.fn() }));
vi.mock('../prompt-map', () => ({ classifyPrompts: vi.fn(), selectImportantPages: vi.fn() }));
vi.mock('../prompt-meta', () => ({ upsertPromptMeta: vi.fn() }));

const volumeMock = vi.fn();
vi.mock('../dataforseo', async () => {
  const actual = await vi.importActual<typeof import('../dataforseo')>('../dataforseo');
  return { ...actual, getAiSearchVolume: volumeMock, isDataForSeoConfigured: () => true };
});

import type { PromptDemand } from '../prompt-discovery';

const { rankByDemand, measureDemand, MIN_KEPT_PROMPTS } =
  await import('../prompt-discovery');

const d = (over: Partial<PromptDemand> = {}): PromptDemand =>
  ({ volume: null, trend: null, proxy: false, ...over });

// Call counts are asserted below, so the mock must not carry them over
// between tests.
beforeEach(() => {
  volumeMock.mockReset();
  volumeMock.mockResolvedValue(new Map());
});

describe('rankByDemand', () => {
  it('returns every prompt it was given', () => {
    const prompts = ['a', 'b', 'c'];
    const demand = new Map([['a', d({ volume: 100 })]]);
    expect(rankByDemand(prompts, demand).sort()).toEqual(prompts.sort());
  });

  it('sorts by volume, highest first', () => {
    const demand = new Map([
      ['low', d({ volume: 10 })],
      ['high', d({ volume: 5000 })],
      ['mid', d({ volume: 300 })],
    ]);
    expect(rankByDemand(['low', 'high', 'mid'], demand)).toEqual(['high', 'mid', 'low']);
  });

  it('keeps zero-volume local prompts instead of dropping them', () => {
    const demand = new Map([
      ['how much does a heat pump cost', d({ volume: 2685 })],
      ['best hvac company in auburn wa', d()],
      ['emergency ac repair near me', d()],
    ]);
    const ranked = rankByDemand(
      ['best hvac company in auburn wa', 'how much does a heat pump cost', 'emergency ac repair near me'],
      demand,
    );
    expect(ranked).toHaveLength(3);
    expect(ranked).toContain('best hvac company in auburn wa');
    expect(ranked).toContain('emergency ac repair near me');
  });

  it('prefers a directly measured figure over a borrowed head-term one', () => {
    const demand = new Map([
      ['direct', d({ volume: 500 })],
      ['borrowed', d({ volume: 500, proxy: true, proxyFor: 'head term' })],
    ]);
    expect(rankByDemand(['borrowed', 'direct'], demand)).toEqual(['direct', 'borrowed']);
  });

  it('leaves prompts with no data in their original relative order', () => {
    // Stable, so the generator's own ordering survives rather than being
    // scrambled by an unstable comparator.
    const demand = new Map<string, PromptDemand>();
    expect(rankByDemand(['first', 'second', 'third'], demand))
      .toEqual(['first', 'second', 'third']);
  });

  it('handles an empty demand map without losing prompts', () => {
    expect(rankByDemand(['a', 'b'], new Map())).toEqual(['a', 'b']);
  });
});

describe('measureDemand', () => {
  it('falls back to the de-localized head term and labels it a proxy', async () => {
    volumeMock
      // First batch: the prompts as written - the local one has no volume.
      .mockResolvedValueOnce(new Map([
        ['best hvac company in auburn wa', { keyword: 'x', volume: null, trend: null }],
      ]))
      // Second batch: the head term does.
      .mockResolvedValueOnce(new Map([
        ['best hvac company', { keyword: 'best hvac company', volume: 1200, trend: 'flat' }],
      ]));

    const out = await measureDemand(['best hvac company in auburn wa'], 'auburn');
    const hit = out.get('best hvac company in auburn wa')!;
    expect(hit.volume).toBe(1200);
    expect(hit.proxy).toBe(true);
    expect(hit.proxyFor).toBe('best hvac company');
  });

  it('does not mark a directly measured prompt as a proxy', async () => {
    volumeMock.mockResolvedValueOnce(new Map([
      ['how much does a heat pump cost', { keyword: 'k', volume: 2685, trend: 'falling' }],
    ]));
    const out = await measureDemand(['how much does a heat pump cost']);
    expect(out.get('how much does a heat pump cost')).toEqual({
      volume: 2685, trend: 'falling', proxy: false,
    });
  });

  it('records null rather than a proxy when the head term is also unknown', async () => {
    volumeMock
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(new Map());
    const out = await measureDemand(['emergency ac repair near me']);
    expect(out.get('emergency ac repair near me')).toEqual({
      volume: null, trend: null, proxy: false, proxyFor: undefined,
    });
  });

  it('makes no second call when nothing needs a proxy', async () => {
    volumeMock.mockResolvedValueOnce(new Map([
      ['national prompt here', { keyword: 'k', volume: 10, trend: null }],
    ]));
    await measureDemand(['national prompt here']);
    expect(volumeMock).toHaveBeenCalledTimes(1);
  });
});

describe('MIN_KEPT_PROMPTS', () => {
  it('is a floor above zero so a misfiring classifier cannot empty the set', () => {
    expect(MIN_KEPT_PROMPTS).toBeGreaterThan(0);
  });
});
