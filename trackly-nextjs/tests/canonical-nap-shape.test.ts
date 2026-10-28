import { describe, expect, it } from 'vitest';

/**
 * Schema-level lock for the expanded NAP canonical shape: the Pull
 * from Google flow now persists region/country/website so audits
 * capture the full picture the operator saw. The verifier ignores the
 * new fields (they're informational) so existing audits stay valid.
 */
import { parseCanonicalNap, type CanonicalNap } from '../src/lib/nap-verify';

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

describe('parseCanonicalNap (request-body parser shared by the audit routes)', () => {
  it('preserves the full expanded field set - region/country/website included', () => {
    const parsed = parseCanonicalNap({
      name: '  Wolfsbane K9 ',
      phone: '+1 423-555-0100',
      street: '12 Main St',
      suite: 'Suite 4',
      city: 'Surgoinsville',
      region: 'TN',
      postcode: '37873',
      country: 'us',
      website: 'https://wolfsbanek9.com',
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe('Wolfsbane K9');
    expect(parsed!.region).toBe('TN');
    expect(parsed!.country).toBe('US'); // uppercased
    expect(parsed!.website).toBe('https://wolfsbanek9.com');
    expect(parsed!.suite).toBe('Suite 4');
  });

  it('rejects a missing/blank/oversized name', () => {
    expect(parseCanonicalNap(null)).toBeNull();
    expect(parseCanonicalNap('str')).toBeNull();
    expect(parseCanonicalNap({ name: '   ' })).toBeNull();
    expect(parseCanonicalNap({ name: 'x'.repeat(201) })).toBeNull();
  });

  it('clamps field lengths and drops non-string/blank optionals', () => {
    const parsed = parseCanonicalNap({
      name: 'Acme',
      phone: 42,
      street: '  ',
      region: 'r'.repeat(300),
      country: 'GBRX',
      website: 'https://example.com/' + 'a'.repeat(600),
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.phone).toBeUndefined();
    expect(parsed!.street).toBeUndefined();
    expect(parsed!.region).toHaveLength(100);
    expect(parsed!.country).toBe('GBR');
    expect(parsed!.website).toHaveLength(500);
  });
});
