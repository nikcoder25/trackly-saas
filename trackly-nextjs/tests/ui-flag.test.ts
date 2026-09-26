import { describe, it, expect } from 'vitest';
import { parseUiVersion, resolveUiVersion, uiFlagCookie, readUiCookie } from '@/lib/ui-flag';

describe('ui flag', () => {
  it('defaults to the classic UI', () => {
    expect(resolveUiVersion({})).toBe('classic');
    expect(resolveUiVersion({ param: null, cookie: null, stored: null })).toBe('classic');
    expect(resolveUiVersion({ cookie: 'garbage' })).toBe('classic');
  });

  it('URL param beats cookie beats localStorage', () => {
    expect(resolveUiVersion({ param: 'v3', cookie: 'classic', stored: 'classic' })).toBe('v3');
    expect(resolveUiVersion({ param: 'classic', cookie: 'v3' })).toBe('classic');
    expect(resolveUiVersion({ cookie: 'v3', stored: 'classic' })).toBe('v3');
    expect(resolveUiVersion({ stored: 'v3' })).toBe('v3');
  });

  it('ignores unknown param values instead of resetting the choice', () => {
    expect(resolveUiVersion({ param: 'banana', cookie: 'v3' })).toBe('v3');
  });

  it('normalises aliases', () => {
    expect(parseUiVersion(' V3 ')).toBe('v3');
    expect(parseUiVersion('off')).toBe('classic');
    expect(parseUiVersion(3)).toBeNull();
  });

  it('round-trips through the cookie string', () => {
    const c = uiFlagCookie('v3');
    expect(c).toContain('lvx_ui=v3');
    expect(c).toContain('Path=/');
    expect(uiFlagCookie('v3', true)).toContain('Secure');
    expect(readUiCookie('a=1; lvx_ui=v3; b=2')).toBe('v3');
    expect(readUiCookie('a=1')).toBeNull();
    expect(readUiCookie(undefined)).toBeNull();
  });
});
