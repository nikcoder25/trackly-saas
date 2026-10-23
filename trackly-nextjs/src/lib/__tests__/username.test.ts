import { describe, it, expect } from 'vitest';
import { usernameBase, sanitizeUsernameInput, transliterate } from '@/lib/username';

describe('username helpers', () => {
  it('uses only the part of an email before the @', () => {
    expect(usernameBase('vikramdeora.seo@gmail.com')).toBe('vikramdeora.seo');
    expect(sanitizeUsernameInput('vikramdeora.seo@gmail.com')).toBe('vikramdeora.seo');
  });

  it('transliterates accented letters instead of dropping them', () => {
    expect(transliterate('ņ')).toBe('n');
    expect(usernameBase('antra.kalniņa')).toBe('antra.kalnina');
    expect(usernameBase('Antra Kalniņa')).toBe('antra.kalnina');
    expect(sanitizeUsernameInput('José Müller')).toBe('jose.muller');
  });

  it('ignores a leading @ typed as part of the handle', () => {
    expect(sanitizeUsernameInput('@antra')).toBe('antra');
  });

  it('keeps a trailing dot while typing but trims it in a generated base', () => {
    expect(sanitizeUsernameInput('antra.')).toBe('antra.');
    expect(usernameBase('..antra..kal..')).toBe('antra.kal');
  });

  it('pads short and trims long bases', () => {
    expect(usernameBase('al')).toBe('useral');
    expect(usernameBase('a'.repeat(40)).length).toBe(25);
  });
});
