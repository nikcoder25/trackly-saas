import { describe, it, expect } from 'vitest';

// Pure-function port of isWebhookUrlSafe for unit testing so we don't need
// to boot the whole route. Kept in sync with the real implementation in
// src/app/api/brands/[id]/webhook-url/route.ts - if that file changes this
// helper must be updated as well. The logic mirrors the Express version in
// routes/brands.js::isWebhookUrlSafe.
function isPrivateIPv4(hostname: string): boolean {
  const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const o = m.slice(1).map(Number);
  if (o.some(n => n < 0 || n > 255)) return true;
  if (o[0] === 0) return true;
  if (o[0] === 10) return true;
  if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true;
  if (o[0] === 127) return true;
  if (o[0] === 169 && o[1] === 254) return true;
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
  if (o[0] === 192 && o[1] === 0) return true;
  if (o[0] === 192 && o[1] === 88 && o[2] === 99) return true;
  if (o[0] === 192 && o[1] === 168) return true;
  if (o[0] === 198 && (o[1] === 18 || o[1] === 19)) return true;
  if (o[0] === 198 && o[1] === 51 && o[2] === 100) return true;
  if (o[0] === 203 && o[1] === 0 && o[2] === 113) return true;
  if (o[0] >= 224 && o[0] <= 239) return true;
  if (o[0] >= 240) return true;
  return false;
}

function isWebhookUrlSafe(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) return false;
    if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return false;
    if (isPrivateIPv4(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

describe('isWebhookUrlSafe', () => {
  const unsafe = [
    'http://example.com/hook', // plain http
    'https://localhost/hook',
    'https://server.local/hook',
    'https://server.internal/hook',
    'https://127.0.0.1/hook',
    'https://10.0.0.5/hook',
    'https://10.255.255.254/hook',
    'https://172.16.0.1/hook',
    'https://172.20.0.1/hook', // commonly missed Docker bridge
    'https://172.31.255.254/hook',
    'https://192.168.1.1/hook',
    'https://169.254.169.254/hook', // AWS / GCP metadata
    'https://100.64.1.1/hook', // CGNAT
    'https://224.0.0.1/hook', // multicast
    'https://240.0.0.1/hook', // reserved
    'https://0.0.0.0/hook',
    'https://255.255.255.255/hook',
    'not-a-url',
  ];
  for (const u of unsafe) {
    it(`rejects unsafe URL: ${u}`, () => {
      expect(isWebhookUrlSafe(u)).toBe(false);
    });
  }

  const safe = [
    'https://example.com/hook',
    'https://hooks.slack.com/services/AAA/BBB/CCC',
    'https://n8n.company.io/webhook/abc',
    'https://1.1.1.1/hook', // Cloudflare public IP
    'https://8.8.8.8/hook', // Google public IP
  ];
  for (const u of safe) {
    it(`accepts safe URL: ${u}`, () => {
      expect(isWebhookUrlSafe(u)).toBe(true);
    });
  }
});
