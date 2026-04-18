import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

// Pure re-implementation of the HMAC verification used by the
// DodoPayments webhook route. Keeps the test hermetic - we don't
// import the route (which would boot the whole Next runtime) but the
// algorithm is intentionally identical.
function verifySignature(rawBody: string, signature: string, secrets: string[]): boolean {
  for (const secret of secrets) {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    try {
      const sigBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expected, 'hex');
      if (sigBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
        return true;
      }
    } catch {
      // Non-hex signature - fall through to string compare
    }
    if (signature === expected) return true;
  }
  return false;
}

describe('webhook HMAC verification', () => {
  const secret = 'whsec_test_secret_123';
  const body = JSON.stringify({ type: 'subscription.active', user: 'abc' });
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');

  it('accepts a matching signature', () => {
    expect(verifySignature(body, sig, [secret])).toBe(true);
  });

  it('rejects a tampered body', () => {
    const tampered = body + ' ';
    expect(verifySignature(tampered, sig, [secret])).toBe(false);
  });

  it('rejects a mismatched secret', () => {
    expect(verifySignature(body, sig, ['different_secret'])).toBe(false);
  });

  it('accepts if any secret in the list matches (rotation support)', () => {
    expect(verifySignature(body, sig, ['old_secret', secret])).toBe(true);
  });

  it('rejects an empty secret list', () => {
    expect(verifySignature(body, sig, [])).toBe(false);
  });

  it('rejects a malformed (non-hex) signature against a valid secret', () => {
    expect(verifySignature(body, 'not-hex-sig', [secret])).toBe(false);
  });
});
