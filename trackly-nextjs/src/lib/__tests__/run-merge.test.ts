import { describe, it, expect } from 'vitest';
import { mergeRetryIntoRun } from '../run-merge';

describe('mergeRetryIntoRun', () => {
  const base = () => [{
    id: 'run1', sov: 0, activePlatforms: ['ChatGPT', 'Grok'],
    allResults: [
      { platform: 'ChatGPT', query: 'best builders', mentioned: true },
      { platform: 'Grok', query: 'best builders', error: true, mentioned: false },
      { platform: 'Grok', query: 'Who builds homes', error: true, mentioned: false },
    ],
  }];

  it('replaces failed rows, keeps the rest, recomputes stats', () => {
    const runs = base();
    const out = mergeRetryIntoRun(runs, 'run1', [
      { platform: 'Grok', query: 'best builders', mentioned: true, citations: ['https://www.example.com/a'] },
    ]);
    expect(out).not.toBeNull();
    const rows = runs[0].allResults;
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ platform: 'ChatGPT', mentioned: true });
    expect(rows[1]).toMatchObject({ platform: 'Grok', mentioned: true });
    expect(rows[1].error).toBeUndefined();
    expect(out!.errorCount).toBe(1);
    expect(out!.totalM).toBe(2);
    expect(out!.sov).toBe(100);
    expect((out!.platforms as Record<string, { errors: number }>).Grok.errors).toBe(1);
    expect(out!.citations).toEqual({ 'example.com': 1 });
  });

  it('matches queries case-insensitively and appends unknown rows', () => {
    const runs = base();
    mergeRetryIntoRun(runs, 'run1', [
      { platform: 'Grok', query: 'who builds homes', mentioned: false },
      { platform: 'Claude', query: 'best builders', mentioned: true },
    ]);
    expect(runs[0].allResults).toHaveLength(4);
    expect(runs[0].activePlatforms).toContain('Claude');
  });

  it('returns null when the target run is missing', () => {
    expect(mergeRetryIntoRun(base(), 'nope', [])).toBeNull();
  });
});
