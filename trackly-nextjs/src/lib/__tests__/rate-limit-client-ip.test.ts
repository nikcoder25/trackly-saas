/**
 * getClientIp precedence tests. The helper must prefer trusted platform
 * headers over the client-spoofable x-forwarded-for, matching the edge
 * middleware so route-level limiters can't be bypassed by forging XFF.
 */
import { describe, expect, it } from 'vitest';
import { getClientIp } from '@/lib/rate-limit';

function req(headers: Record<string, string>): Request {
  return new Request('https://livesov.com/api/x', { headers });
}

describe('getClientIp', () => {
  it('prefers do-connecting-ip over a spoofed x-forwarded-for', () => {
    const r = req({
      'do-connecting-ip': '203.0.113.7',
      'x-forwarded-for': '1.2.3.4, 5.6.7.8',
      'x-real-ip': '9.9.9.9',
    });
    expect(getClientIp(r)).toBe('203.0.113.7');
  });

  it('falls back to cf-connecting-ip, then x-real-ip, then x-forwarded-for', () => {
    expect(getClientIp(req({ 'cf-connecting-ip': '198.51.100.2', 'x-forwarded-for': '1.2.3.4' })))
      .toBe('198.51.100.2');
    expect(getClientIp(req({ 'x-real-ip': '198.51.100.3', 'x-forwarded-for': '1.2.3.4' })))
      .toBe('198.51.100.3');
    expect(getClientIp(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
  });

  it('returns "unknown" when no IP headers are present', () => {
    expect(getClientIp(req({}))).toBe('unknown');
  });
});
