import { afterEach, describe, expect, it } from 'vitest';
import { dataForSeoAuthHeader } from '../dataforseo-auth';
import { isDfsAuthError } from '../rank-tracking/providers/dataforseo';

const saved = { l: process.env.DATAFORSEO_LOGIN, p: process.env.DATAFORSEO_PASSWORD };
afterEach(() => { process.env.DATAFORSEO_LOGIN = saved.l; process.env.DATAFORSEO_PASSWORD = saved.p; });

describe('dataForSeoAuthHeader', () => {
  it('trims whitespace, newlines and wrapping quotes', () => {
    process.env.DATAFORSEO_LOGIN = ' "me@x.com"\n';
    process.env.DATAFORSEO_PASSWORD = "'secret' ";
    expect(dataForSeoAuthHeader()).toBe(`Basic ${Buffer.from('me@x.com:secret').toString('base64')}`);
  });
  it('is null when a value is blank', () => {
    process.env.DATAFORSEO_LOGIN = '  ';
    process.env.DATAFORSEO_PASSWORD = 'x';
    expect(dataForSeoAuthHeader()).toBeNull();
  });
});

describe('isDfsAuthError', () => {
  it('matches 401/402/403 only', () => {
    expect(isDfsAuthError('dataforseo: HTTP 401')).toBe(true);
    expect(isDfsAuthError('dataforseo: HTTP 402')).toBe(true);
    expect(isDfsAuthError('dataforseo: HTTP 429')).toBe(false);
    expect(isDfsAuthError('dataforseo: HTTP 500')).toBe(false);
  });
});
