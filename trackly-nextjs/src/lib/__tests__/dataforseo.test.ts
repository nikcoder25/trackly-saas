/**
 * Tests for src/lib/dataforseo.ts.
 *
 * The rule this file exists to defend: DataForSEO's AI search volume
 * dataset does NOT cover local queries. Probing the live API confirmed it
 * - "how much does a heat pump cost" returns 2,685/mo, while "best hvac
 * company in auburn wa" and "emergency ac repair near me" return nothing
 * at all.
 *
 * For a product whose customers are local service businesses, that makes
 * "no volume" the single most dangerous value in the system: treated as
 * zero demand it would delete exactly the prompts worth tracking and keep
 * the national head terms a local HVAC company can never rank for. So
 * absent data must stay absent (null), never become 0.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const safeFetchMock = vi.fn();

vi.mock('../safe-fetch', () => ({ safeFetch: safeFetchMock }));
vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const {
  classifyTrend,
  deLocalize,
  getAiSearchVolume,
  getSearchIntent,
  isBuyingIntent,
  isDataForSeoConfigured,
} = await import('../dataforseo');

const ORIGINAL_ENV = { ...process.env };

/** DataForSEO wraps payloads twice; helper builds the real envelope. */
function envelope(items: unknown[], over: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      status_code: 20000,
      tasks: [{ status_code: 20000, result: [{ items }] }],
      ...over,
    }),
  };
}

beforeEach(() => {
  safeFetchMock.mockReset();
  process.env.DATAFORSEO_LOGIN = 'user';
  process.env.DATAFORSEO_PASSWORD = 'pass';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('isDataForSeoConfigured', () => {
  it('requires both halves of the credential', () => {
    expect(isDataForSeoConfigured()).toBe(true);
    delete process.env.DATAFORSEO_PASSWORD;
    expect(isDataForSeoConfigured()).toBe(false);
  });
});

describe('getAiSearchVolume', () => {
  it('does not call the API when unconfigured', async () => {
    delete process.env.DATAFORSEO_LOGIN;
    expect((await getAiSearchVolume(['a keyword'])).size).toBe(0);
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it('sends basic auth and an array-wrapped task body', async () => {
    safeFetchMock.mockResolvedValue(envelope([]));
    await getAiSearchVolume(['best hvac']);
    const [, init] = safeFetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization)
      .toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`);
    const body = JSON.parse(init.body as string);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].keywords).toEqual(['best hvac']);
  });

  it('parses volume out of the double-wrapped envelope', async () => {
    safeFetchMock.mockResolvedValue(envelope([
      { keyword: 'how much does a heat pump cost', ai_search_volume: 2685 },
    ]));
    const map = await getAiSearchVolume(['how much does a heat pump cost']);
    expect(map.get('how much does a heat pump cost')?.volume).toBe(2685);
  });

  it('reports a keyword with no volume field as null, never zero', async () => {
    // This is the local-query case as the live API actually returns it:
    // the keyword echoes back with no ai_search_volume at all.
    safeFetchMock.mockResolvedValue(envelope([
      { keyword: 'best hvac company in auburn wa' },
    ]));
    const map = await getAiSearchVolume(['best hvac company in auburn wa']);
    expect(map.get('best hvac company in auburn wa')?.volume).toBeNull();
  });

  it('returns an empty map when the task reports a non-OK status', async () => {
    safeFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status_code: 20000, tasks: [{ status_code: 40501, result: null }] }),
    });
    expect((await getAiSearchVolume(['x'])).size).toBe(0);
  });

  it('returns an empty map on an HTTP error rather than throwing', async () => {
    safeFetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    await expect(getAiSearchVolume(['x'])).resolves.toEqual(new Map());
  });

  it('returns an empty map when the request throws', async () => {
    safeFetchMock.mockRejectedValue(new Error('network down'));
    await expect(getAiSearchVolume(['x'])).resolves.toEqual(new Map());
  });

  it('treats result: null as "no data", not as a failure', async () => {
    safeFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status_code: 20000, tasks: [{ status_code: 20000, result: null }] }),
    });
    await expect(getAiSearchVolume(['x'])).resolves.toEqual(new Map());
  });
});

describe('classifyTrend', () => {
  it('needs at least six months before calling a direction', () => {
    expect(classifyTrend({ '2026-07': 100, '2026-06': 10 })).toBeNull();
    expect(classifyTrend(undefined)).toBeNull();
  });

  it('detects a real decline', () => {
    // The live shape for "how much does a heat pump cost": 4,207 in
    // December down to 2,685 in July.
    expect(classifyTrend({
      '2025-08': 3737, '2025-09': 3483, '2025-10': 3396, '2025-11': 3620,
      '2025-12': 4207, '2026-01': 4146, '2026-02': 3930, '2026-03': 3839,
      '2026-04': 3438, '2026-05': 3156, '2026-06': 2451, '2026-07': 2685,
    })).toBe('falling');
  });

  it('detects growth', () => {
    expect(classifyTrend({
      '2026-01': 10, '2026-02': 10, '2026-03': 10,
      '2026-05': 90, '2026-06': 100, '2026-07': 110,
    })).toBe('rising');
  });

  it('calls ordinary noise flat rather than a trend', () => {
    expect(classifyTrend({
      '2026-01': 100, '2026-02': 104, '2026-03': 98,
      '2026-05': 101, '2026-06': 99, '2026-07': 103,
    })).toBe('flat');
  });
});

describe('deLocalize', () => {
  it('strips the brand city', () => {
    expect(deLocalize('best hvac company in auburn', 'auburn')).toBe('best hvac company');
  });

  it('strips a city plus trailing state code', () => {
    expect(deLocalize('best hvac company in auburn wa', 'auburn')).toBe('best hvac company');
  });

  it('strips "near me" without needing a city', () => {
    expect(deLocalize('emergency ac repair near me')).toBe('emergency ac repair');
  });

  it('returns null when nothing was stripped', () => {
    // The caller uses null to avoid passing a prompt off as a proxy for
    // itself, which would double-count its own volume as a category
    // estimate.
    expect(deLocalize('how much does a heat pump cost')).toBeNull();
  });

  it('returns null when stripping would leave too little to search on', () => {
    expect(deLocalize('hvac near me')).toBeNull();
  });
});

describe('getSearchIntent + isBuyingIntent', () => {
  it('parses the intent envelope including secondary intents', async () => {
    safeFetchMock.mockResolvedValue(envelope([
      {
        keyword: 'emergency ac repair near me',
        keyword_intent: { label: 'transactional', probability: 0.485 },
        secondary_keyword_intents: [{ label: 'commercial', probability: 0.403 }],
      },
    ]));
    const map = await getSearchIntent(['emergency ac repair near me']);
    const hit = map.get('emergency ac repair near me');
    expect(hit?.label).toBe('transactional');
    expect(hit?.secondary).toEqual([{ label: 'commercial', probability: 0.403 }]);
  });

  it('drops items with an unrecognised intent label', async () => {
    safeFetchMock.mockResolvedValue(envelope([
      { keyword: 'x', keyword_intent: { label: 'vibes', probability: 1 } },
    ]));
    expect((await getSearchIntent(['x'])).size).toBe(0);
  });

  it('keeps commercial and transactional prompts', () => {
    expect(isBuyingIntent({ keyword: 'a', label: 'commercial', probability: 0.95, secondary: [] })).toBe(true);
    expect(isBuyingIntent({ keyword: 'b', label: 'transactional', probability: 0.49, secondary: [] })).toBe(true);
  });

  it('keeps a low-confidence prompt whose secondary read is commercial', () => {
    // "emergency ac repair near me" is transactional at only p=0.49 with
    // commercial close behind. A top-label-plus-confidence rule would bin
    // it, and it is one of the highest-converting prompts there is.
    expect(isBuyingIntent({
      keyword: 'emergency ac repair near me',
      label: 'informational',
      probability: 0.4,
      secondary: [{ label: 'commercial', probability: 0.39 }],
    })).toBe(true);
  });

  it('drops a purely informational prompt', () => {
    expect(isBuyingIntent({
      keyword: 'how does a heat pump work', label: 'informational', probability: 1, secondary: [],
    })).toBe(false);
  });

  it('keeps a prompt the classifier had no opinion on', () => {
    // Missing data is not evidence against a prompt.
    expect(isBuyingIntent(undefined)).toBe(true);
  });
});
