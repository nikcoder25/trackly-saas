import { describe, it, expect } from 'vitest';
import { hashToken } from '../src/lib/auth';

describe('hashToken', () => {
  it('returns a 64-character hex sha256 digest', () => {
    const out = hashToken('hello');
    expect(out).toMatch(/^[a-f0-9]{64}$/);
    // Well-known sha256("hello")
    expect(out).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('is deterministic for the same input', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  it('diverges for different inputs', () => {
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });

  it('coerces non-string input instead of throwing', () => {
    // Callers sometimes pass opaque tokens that aren't formally typed.
    // Accidentally passing a number must not crash.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => hashToken(42 as any)).not.toThrow();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(hashToken(42 as any)).toBe(hashToken('42'));
  });
});
