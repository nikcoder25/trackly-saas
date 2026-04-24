import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { assertPublicUrl, isBlockedIP, safeFetch, SSRFError } from '../src/lib/safe-fetch';

describe('isBlockedIP', () => {
  it('blocks private, loopback, link-local, CGNAT, multicast, reserved IPv4', () => {
    const blocked = [
      '0.0.0.0', '10.0.0.1', '10.255.255.254', '100.64.1.1', '127.0.0.1',
      '127.1.1.1', '169.254.169.254', '172.16.0.1', '172.20.0.1',
      '172.31.255.254', '192.168.1.1', '198.18.0.1', '224.0.0.1',
      '240.0.0.1', '255.255.255.255',
    ];
    for (const ip of blocked) expect(isBlockedIP(ip), ip).toBe(true);
  });

  it('blocks loopback, ULA, link-local, multicast, and IPv4-mapped IPv6', () => {
    const blocked = ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1'];
    for (const ip of blocked) expect(isBlockedIP(ip), ip).toBe(true);
  });

  it('allows public IPv4 and IPv6', () => {
    for (const ip of ['1.1.1.1', '8.8.8.8', '142.250.80.46', '2606:4700:4700::1111']) {
      expect(isBlockedIP(ip), ip).toBe(false);
    }
  });
});

describe('assertPublicUrl', () => {
  it('blocks non-http(s) protocols', async () => {
    for (const u of ['file:///etc/passwd', 'gopher://example.com/', 'data:text/plain,hi', 'javascript:alert(1)']) {
      await expect(assertPublicUrl(u)).rejects.toMatchObject({ code: 'PROTOCOL_BLOCKED' });
    }
  });

  it('blocks loopback, RFC1918, and link-local / IMDS literals', async () => {
    const hosts = [
      'http://127.0.0.1/', 'http://[::1]/',
      'http://10.0.0.1/', 'http://192.168.1.1/', 'http://172.20.0.1/',
      'http://169.254.169.254/latest/meta-data/', 'http://metadata.google.internal/',
    ];
    for (const u of hosts) {
      await expect(assertPublicUrl(u)).rejects.toMatchObject({ code: 'HOST_BLOCKED' });
    }
  });

  it('blocks obfuscated IP encodings (decimal int, hex, octal)', async () => {
    for (const u of ['http://2130706433/', 'http://0x7f000001/', 'http://0177.0.0.1/']) {
      await expect(assertPublicUrl(u)).rejects.toMatchObject({ code: 'HOST_BLOCKED' });
    }
  });

  it('blocks .local, .internal, localhost', async () => {
    for (const u of ['https://server.local/', 'https://kube.internal/', 'https://localhost/']) {
      await expect(assertPublicUrl(u)).rejects.toMatchObject({ code: 'HOST_BLOCKED' });
    }
  });

  it('rejects hostnames that resolve to private IPs (DNS rebinding defense)', async () => {
    await expect(
      assertPublicUrl('https://sneaky.example.com/', undefined, async () => ['10.0.0.7']),
    ).rejects.toMatchObject({ code: 'IP_BLOCKED' });
  });

  it('accepts normal public URLs', async () => {
    await expect(
      assertPublicUrl('https://cloudflare.example/', undefined, async () => ['1.1.1.1']),
    ).resolves.toMatchObject({ hostname: 'cloudflare.example', ips: ['1.1.1.1'] });
  });
});

describe('safeFetch redirect handling', () => {
  const publicLookup = async () => ['1.1.1.1'];
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch'); });
  afterEach(() => { fetchSpy.mockRestore(); });

  it('rejects a redirect that points at a private IP', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:6379/' } }),
    );
    await expect(
      safeFetch('https://public.example/', { maxRedirects: 3, lookup: publicLookup }),
    ).rejects.toBeInstanceOf(SSRFError);
  });

  it('rejects a redirect that points at IMDS', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, { status: 301, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }),
    );
    await expect(
      safeFetch('https://public.example/', { maxRedirects: 3, lookup: publicLookup }),
    ).rejects.toMatchObject({ code: 'HOST_BLOCKED' });
  });

  it('enforces max redirect hops', async () => {
    fetchSpy.mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'https://other.example/' } }),
    );
    await expect(
      safeFetch('https://public.example/', { maxRedirects: 1, lookup: publicLookup }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REDIRECTS' });
  });
});
