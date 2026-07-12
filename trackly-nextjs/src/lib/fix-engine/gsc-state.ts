/**
 * Signed OAuth state for the GSC connect flow.
 *
 * The state round-trips brandId + userId through Google's consent screen
 * and is HMAC-signed (JWT_SECRET) so the callback can trust it wasn't
 * tampered with. Short TTL guards against stale/replayed links.
 */

import crypto from 'crypto';

interface StatePayload { brandId: string; userId: string; ts: number }

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is required to sign OAuth state');
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export function signState(brandId: string, userId: string): string {
  const payload: StatePayload = { brandId, userId, ts: Date.now() };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(crypto.createHmac('sha256', secret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyState(state: string, maxAgeMs = 10 * 60_000): StatePayload | null {
  const [body, sig] = (state || '').split('.');
  if (!body || !sig) return null;
  const expected = b64url(crypto.createHmac('sha256', secret()).update(body).digest());
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString('utf8')) as StatePayload;
    if (!payload.brandId || !payload.userId) return null;
    if (Date.now() - payload.ts > maxAgeMs) return null;
    return payload;
  } catch {
    return null;
  }
}
