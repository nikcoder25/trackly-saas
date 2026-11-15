/**
 * SSRF-hardened fetch tests. Focus on the connection-pinning defence against
 * DNS-rebinding / TOCTOU: the IP validated by assertPublicUrl must be the exact
 * one the request dials, and the hostname must not be re-resolved a second time
 * where a rebind could swap in a private address.
 */
import http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertPublicUrl, isBlockedIP, parseIPv6, safeFetch, pinnedLookup, type LookupFn } from '@/lib/safe-fetch';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('assertPublicUrl', () => {
  it('rejects a hostname that resolves to a blocked (private) IP', async () => {
    const lookup: LookupFn = async () => ['10.0.0.5'];
    await expect(assertPublicUrl('http://rebind.example', ['http:', 'https:'], lookup))
      .rejects.toMatchObject({ code: 'IP_BLOCKED' });
  });

  it('returns the validated IPs for a public hostname', async () => {
    const lookup: LookupFn = async () => ['93.184.216.34'];
    const res = await assertPublicUrl('https://example.com', ['http:', 'https:'], lookup);
    expect(res.ips).toEqual(['93.184.216.34']);
    expect(res.hostname).toBe('example.com');
  });
});

describe('IPv6 SSRF bypasses', () => {
  const noLookup: LookupFn = async () => {
    throw new Error('literal IPs must not hit DNS');
  };

  it.each([
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:7f00:1]/',
    'http://[::ffff:169.254.169.254]/latest/meta-data/',
    'http://[::ffff:a9fe:a9fe]/',
    'http://[::ffff:0:127.0.0.1]/',
    'http://[64:ff9b::7f00:1]/',
    'http://[64:ff9b::169.254.169.254]/',
    'http://[2002:7f00:1::]/',
    'http://[2002:a9fe:a9fe::1]/',
    'http://[::127.0.0.1]/',
    'http://[::7f00:1]/',
    'http://[fec0::1]/',
    'http://[::1]/',
    'http://[::]/',
    'http://[fd00::1]/',
    'http://[fe80::1]/',
    'http://[ff02::1]/',
    'http://[0:0:0:0:0:ffff:7f00:1]/',
  ])('blocks %s', async (url) => {
    await expect(assertPublicUrl(url, ['http:', 'https:'], noLookup))
      .rejects.toMatchObject({ code: 'HOST_BLOCKED' });
  });

  it.each([
    'https://[2606:4700::1111]/',
    'https://8.8.8.8/',
    'https://[2001:4860:4860::8888]/',
    'https://[::ffff:8.8.8.8]/',
    'https://[2002:808:808::1]/',
    'https://[64:ff9b::808:808]/',
  ])('allows public %s', async (url) => {
    const res = await assertPublicUrl(url, ['http:', 'https:'], noLookup);
    expect(res.ips).toHaveLength(1);
  });

  it('rejects DNS answers that are IPv4-mapped private addresses', async () => {
    const lookup: LookupFn = async () => ['::ffff:7f00:1'];
    await expect(assertPublicUrl('http://rebind.example', ['http:', 'https:'], lookup))
      .rejects.toMatchObject({ code: 'IP_BLOCKED' });
    expect(isBlockedIP('64:ff9b::a00:1')).toBe(true);
    expect(isBlockedIP('2606:4700::1111')).toBe(false);
  });

  it('expands compressed and dotted forms', () => {
    expect(parseIPv6('::ffff:127.0.0.1')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(parseIPv6('2002:7f00:1::')).toEqual([0x2002, 0x7f00, 1, 0, 0, 0, 0, 0]);
    expect(parseIPv6('1::2::3')).toBeNull();
    expect(parseIPv6('1:2:3:4:5:6:7:8:9')).toBeNull();
  });
});

describe('safeFetch connection pinning (DNS-rebinding / TOCTOU)', () => {
  it('resolves the hostname exactly once and pins the request to a validated IP', async () => {
    // A rebinding resolver: the first answer is a public IP (passes the
    // validation), any later answer is a blocked private IP. With pinning
    // there is no second resolution in our code and the socket is bound to
    // the validated IP, so the blocked answer can never be dialed.
    let calls = 0;
    const lookup: LookupFn = async () => {
      calls += 1;
      return calls === 1 ? ['93.184.216.34'] : ['10.0.0.5'];
    };

    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      // A dispatcher (the pinned undici Agent) must be supplied so fetch does
      // not perform its own independent DNS resolution.
      expect((init as { dispatcher?: unknown })?.dispatcher).toBeTruthy();
      return new Response('ok', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await safeFetch('https://rebind.example', { lookup });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
    // Only the first (validated) resolution happened - no second lookup that a
    // rebind attack could have poisoned.
    expect(calls).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('pinnedLookup', () => {
  it('always resolves to the pinned IP and the socket dials it while preserving Host', async () => {
    const { Agent } = await import('undici');
    const server = http.createServer((req, res) => res.end(`host:${req.headers.host}`));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as import('net').AddressInfo).port;

    try {
      // Pin a hostname that would never resolve to loopback on its own; the
      // request must still land on 127.0.0.1 with the original Host header.
      const agent = new Agent({ connect: { lookup: pinnedLookup('127.0.0.1') } });
      const resp = await fetch(`http://pinned.example:${port}/`, {
        // @ts-expect-error dispatcher is an undici-only fetch option
        dispatcher: agent,
      });
      const body = await resp.text();
      expect(resp.status).toBe(200);
      expect(body).toBe(`host:pinned.example:${port}`);
      await agent.close();
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('reports the correct address family via the array callback form', () => {
    const fn = pinnedLookup('93.184.216.34');
    const cb = vi.fn();
    fn('anything', { all: true }, cb);
    expect(cb).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }]);

    const fn6 = pinnedLookup('2606:2800:220:1:248:1893:25c8:1946');
    const cb6 = vi.fn();
    fn6('anything', {}, cb6);
    expect(cb6).toHaveBeenCalledWith(null, '2606:2800:220:1:248:1893:25c8:1946', 6);
  });
});
