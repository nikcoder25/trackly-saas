import { describe, expect, it } from 'vitest';

/**
 * Schema-level lock for the expanded NAP canonical shape: the Pull
 * from Google flow now persists region/country/website so audits
 * capture the full picture the operator saw. The verifier ignores the
 * new fields (they're informational) so existing audits stay valid.
 */
import type { CanonicalNap } from '../src/lib/nap-verify';

describe('CanonicalNap', () => {
  it('accepts the expanded set of optional fields', () => {
    const c: CanonicalNap = {
      name: 'Wolfsbane K9',
      phone: '+1 423-555-0100',
      street: '12 Main St',
      suite: 'Suite 4',
      city: 'Surgoinsville',
      region: 'TN',
      postcode: '37873',
      country: 'US',
      website: 'https://wolfsbanek9.com',
    };
    expect(c.name).toBe('Wolfsbane K9');
    expect(c.region).toBe('TN');
    expect(c.country).toBe('US');
    expect(c.website).toBe('https://wolfsbanek9.com');
  });

  it('stays valid with the legacy minimal shape', () => {
    const c: CanonicalNap = { name: 'Acme Dental' };
    expect(c.region).toBeUndefined();
    expect(c.website).toBeUndefined();
  });
});
