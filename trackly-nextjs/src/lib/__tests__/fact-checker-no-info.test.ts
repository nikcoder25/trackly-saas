import { describe, it, expect } from 'vitest';
import { buildFactCheckPrompt, downgradeNoInfoFindings } from '../fact-checker';

const base = { fact_key: 'phone_number', severity: 'high', explanation: '' };

describe('fact-checker: lack-of-info answers are not inaccuracies', () => {
  it('downgrades "I don\'t have a current phone number" to not_mentioned', () => {
    const [f] = downgradeNoInfoFindings([
      { ...base, status: 'inaccurate' as const, found: "I don't have a current phone number for Legend OZ Transportation." },
    ]);
    expect(f.status).toBe('not_mentioned');
  });

  it.each([
    'I do not have that information',
    'Phone number not available',
    "I couldn't find a website",
    'There is no public listing',
    "I'm not sure of the address",
  ])('downgrades "%s"', found => {
    expect(downgradeNoInfoFindings([{ ...base, status: 'inaccurate' as const, found }])[0].status).toBe('not_mentioned');
  });

  it('keeps real wrong claims inaccurate', () => {
    const [f] = downgradeNoInfoFindings([{ ...base, status: 'inaccurate' as const, found: '(555) 123-4567' }]);
    expect(f.status).toBe('inaccurate');
  });

  it('does not touch accurate findings', () => {
    const [f] = downgradeNoInfoFindings([{ ...base, status: 'accurate' as const, found: "don't have" }]);
    expect(f.status).toBe('accurate');
  });

  it('prompt tells the checker lack-of-info is not_mentioned', () => {
    const p = buildFactCheckPrompt([{ key: 'phone_number', value: '555', category: 'contact' } as never], 'text', 'claude', 'Legend OZ');
    expect(p).toMatch(/I don't have/);
    expect(p).toMatch(/NEVER "inaccurate"/);
  });
});
