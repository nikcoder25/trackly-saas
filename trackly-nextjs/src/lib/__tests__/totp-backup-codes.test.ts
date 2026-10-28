/**
 * Backup-code matching tests. A legacy plaintext (un-hashed) stored code
 * decodes to a different-length buffer; timingSafeEqual throws RangeError on
 * a length mismatch, which must not crash login with a 500.
 */
import { describe, expect, it } from 'vitest';
import { findBackupCodeIndex, hashBackupCode } from '@/lib/totp';

describe('findBackupCodeIndex', () => {
  it('does not throw when a stored code has a mismatched length (legacy plaintext)', () => {
    const stored = ['abcdef123456', hashBackupCode('deadbeefcafe')]; // first is legacy plaintext
    expect(() => findBackupCodeIndex('somecode0000', stored)).not.toThrow();
    expect(findBackupCodeIndex('somecode0000', stored)).toBe(-1);
  });

  it('still matches a correctly hashed backup code at its index', () => {
    const codes = ['aaaaaaaaaaaa', 'bbbbbbbbbbbb', 'cccccccccccc'];
    const stored = codes.map(hashBackupCode);
    expect(findBackupCodeIndex('bbbbbbbbbbbb', stored)).toBe(1);
    expect(findBackupCodeIndex('zzzzzzzzzzzz', stored)).toBe(-1);
  });

  it('skips a legacy plaintext entry but still finds a valid hashed match after it', () => {
    const stored = ['legacyplain', hashBackupCode('112233445566')];
    expect(findBackupCodeIndex('112233445566', stored)).toBe(1);
  });
});
