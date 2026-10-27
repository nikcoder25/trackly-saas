import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('@/lib/db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));
vi.mock('../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import { perplexityRequestFeeUsd, GEMINI_GROUNDING_CALL_USD } from '../cost-tracker';
import { geminiGroundingWithinBudget, groundedGeminiCap } from '../gemini-grounding-budget';

describe('Perplexity request fee', () => {
  it('adds the low-context fee per Sonar model', () => {
    expect(perplexityRequestFeeUsd('sonar')).toBe(0.005);
    expect(perplexityRequestFeeUsd('sonar-pro')).toBe(0.006);
    expect(perplexityRequestFeeUsd('sonar-reasoning-pro')).toBe(0.006);
    expect(perplexityRequestFeeUsd('sonar-deep-research')).toBe(0);
    expect(perplexityRequestFeeUsd('')).toBe(0);
  });
});

describe('grounded Gemini monthly cap', () => {
  beforeEach(() => query.mockReset());

  it('gives no grounding to plans below Pro', () => {
    for (const p of ['free', 'trial', 'starter', undefined]) expect(groundedGeminiCap(p)).toBe(0);
    expect(groundedGeminiCap('pro')).toBe(400);
    expect(groundedGeminiCap('agency')).toBe(1200);
  });

  it('allows grounding until the month\'s grounded calls reach the cap', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: 399 }] });
    expect(await geminiGroundingWithinBudget('t1', 'pro')).toBe(true);
    expect(query.mock.calls[0][1][1]).toBe(GEMINI_GROUNDING_CALL_USD);
    query.mockResolvedValueOnce({ rows: [{ n: 400 }] });
    expect(await geminiGroundingWithinBudget('t1', 'pro')).toBe(false);
  });

  it('never grounds below Pro and does not query for it', async () => {
    expect(await geminiGroundingWithinBudget('t1', 'starter')).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('fails closed to ungrounded when the ledger cannot be read', async () => {
    query.mockRejectedValueOnce(new Error('db down'));
    expect(await geminiGroundingWithinBudget('t1', 'agency')).toBe(false);
  });

  it('does not cap the owner plan', async () => {
    expect(await geminiGroundingWithinBudget('t1', 'owner')).toBe(true);
    expect(query).not.toHaveBeenCalled();
  });
});
