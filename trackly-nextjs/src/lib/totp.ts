/**
 * TOTP implementation - ported from Express app's lib/totp.js
 */
import crypto from 'crypto';
import { TOTP_CONFIG } from './constants';

const TOTP_PERIOD = TOTP_CONFIG.period;
const TOTP_DIGITS = TOTP_CONFIG.digits;

function base32Encode(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
  }
  let result = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.substring(i, i + 5).padEnd(5, '0');
    result += alphabet[parseInt(chunk, 2)];
  }
  return result;
}

function base32Decode(encoded: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = encoded.replace(/[= ]/g, '').toUpperCase();
  let bits = '';
  for (const char of clean) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) throw new Error('Invalid base32 character');
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateSecret(length = 20): string {
  const bytes = crypto.randomBytes(length);
  return base32Encode(bytes);
}

function generateTOTP(secret: string, time?: number): string {
  const counter = Math.floor((time !== undefined && time !== null ? time : Date.now() / 1000) / TOTP_PERIOD);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(0, 0);
  counterBuffer.writeUInt32BE(counter, 4);

  const key = base32Decode(secret);
  const hmac = crypto.createHmac('sha1', key);
  hmac.update(counterBuffer);
  const hash = hmac.digest();

  const offset = hash[hash.length - 1] & 0xf;
  const code =
    (((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff)) %
    Math.pow(10, TOTP_DIGITS);

  return code.toString().padStart(TOTP_DIGITS, '0');
}

export function verifyTOTP(secret: string, token: string, window = 1): boolean {
  const now = Date.now() / 1000;
  for (let i = -window; i <= window; i++) {
    const time = now + i * TOTP_PERIOD;
    if (generateTOTP(secret, time) === token) {
      return true;
    }
  }
  return false;
}

export function getOTPAuthURL(secret: string, email: string, issuer = 'Livesov'): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

export function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(crypto.randomBytes(4).toString('hex'));
  }
  return codes;
}
