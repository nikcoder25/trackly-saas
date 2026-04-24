import dns from 'node:dns/promises';
import net from 'node:net';

// SSRF-hardened fetch wrapper. Validates protocol, blocks private/loopback/
// link-local/metadata IPs (IPv4 + IPv6), resolves DNS before connect so a
// name that points at an internal IP cannot slip through, follows redirects
// manually and re-validates each hop, caps response size and elapsed time.

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_PROTOCOLS = ['http:', 'https:'];

export class SSRFError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'SSRFError';
    this.code = code;
  }
}

function isBlockedIPv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n < 0 || n > 255)) return true;
  if (o[0] === 0) return true;                                      // 0.0.0.0/8
  if (o[0] === 10) return true;                                     // RFC1918
  if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true;       // CGNAT
  if (o[0] === 127) return true;                                    // loopback
  if (o[0] === 169 && o[1] === 254) return true;                    // link-local / AWS+Azure IMDS
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;        // RFC1918
  if (o[0] === 192 && o[1] === 0 && (o[2] === 0 || o[2] === 2)) return true;
  if (o[0] === 192 && o[1] === 88 && o[2] === 99) return true;      // 6to4 anycast
  if (o[0] === 192 && o[1] === 168) return true;                    // RFC1918
  if (o[0] === 198 && (o[1] === 18 || o[1] === 19)) return true;    // benchmarking
  if (o[0] === 198 && o[1] === 51 && o[2] === 100) return true;     // TEST-NET-2
  if (o[0] === 203 && o[1] === 0 && o[2] === 113) return true;      // TEST-NET-3
  if (o[0] >= 224 && o[0] <= 239) return true;                      // multicast
  if (o[0] >= 240) return true;                                     // reserved, 255.255.255.255
  return false;
}

function isBlockedIPv6(ip: string): boolean {
  const h = ip.toLowerCase();
  if (h === '::' || h === '::1') return true;
  // IPv4-mapped ::ffff:a.b.c.d must be checked against IPv4 rules.
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIPv4(mapped[1]);
  if (/^f[cd]/.test(h)) return true;       // fc00::/7 unique-local
  if (/^fe[89ab]/.test(h)) return true;    // fe80::/10 link-local
  if (h.startsWith('ff')) return true;     // ff00::/8 multicast
  return false;
}

export function isBlockedIP(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedIPv4(ip);
  if (net.isIPv6(ip)) return isBlockedIPv6(ip);
  return true;
}

// Hostname-level check. Catches literal IPs (including obfuscated forms) and
// well-known internal TLDs. Anything that passes here still has its DNS
// records inspected before we dispatch the request.
function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === 'metadata.google.internal') return true;
  // Single decimal integer (e.g. 2130706433 = 127.0.0.1) or 0x-prefixed hex.
  if (/^\d+$/.test(h) || /^0x[0-9a-f]+$/i.test(h)) return true;
  // Dotted form with any octet expressed in octal (leading zero) or hex.
  if (/(^|\.)0\d+/.test(h) || /(^|\.)0x[0-9a-f]+/i.test(h)) return true;
  if (net.isIP(h)) return isBlockedIP(h);
  return false;
}

export interface AssertPublicUrlResult {
  url: URL;
  hostname: string;
  ips: string[];
}

export async function assertPublicUrl(
  urlStr: string,
  allowedProtocols: string[] = DEFAULT_PROTOCOLS,
): Promise<AssertPublicUrlResult> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new SSRFError('Invalid URL', 'INVALID_URL');
  }
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new SSRFError(`Protocol not allowed: ${parsed.protocol}`, 'PROTOCOL_BLOCKED');
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (isBlockedHostname(hostname)) {
    throw new SSRFError('Blocked hostname', 'HOST_BLOCKED');
  }
  let ips: string[];
  if (net.isIP(hostname)) {
    ips = [hostname];
  } else {
    try {
      const results = await dns.lookup(hostname, { all: true });
      ips = results.map((r) => r.address);
    } catch {
      throw new SSRFError('DNS resolution failed', 'DNS_FAILED');
    }
    if (ips.length === 0) throw new SSRFError('No DNS records', 'DNS_EMPTY');
    for (const ip of ips) {
      if (isBlockedIP(ip)) {
        throw new SSRFError(`Resolves to blocked IP: ${ip}`, 'IP_BLOCKED');
      }
    }
  }
  return { url: parsed, hostname, ips };
}

export interface SafeFetchOptions {
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  allowedProtocols?: string[];
}

export async function safeFetch(
  input: string | URL,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const {
    method = 'GET',
    headers,
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    maxBytes = DEFAULT_MAX_BYTES,
    allowedProtocols = DEFAULT_PROTOCOLS,
  } = options;

  let currentUrl = typeof input === 'string' ? input : input.toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      await assertPublicUrl(currentUrl, allowedProtocols);
      const response = await fetch(currentUrl, {
        method,
        headers,
        body,
        redirect: 'manual',
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return cappedResponse(response, maxBytes);
        if (hop >= maxRedirects) {
          throw new SSRFError('Too many redirects', 'TOO_MANY_REDIRECTS');
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      const cl = response.headers.get('content-length');
      if (cl && Number(cl) > maxBytes) {
        throw new SSRFError('Response too large', 'TOO_LARGE');
      }
      return cappedResponse(response, maxBytes);
    }
    throw new SSRFError('Too many redirects', 'TOO_MANY_REDIRECTS');
  } finally {
    clearTimeout(timer);
  }
}

function cappedResponse(response: Response, maxBytes: number): Response {
  if (!response.body || !Number.isFinite(maxBytes)) return response;
  let received = 0;
  const reader = response.body.getReader();
  const capped = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      received += value.byteLength;
      if (received > maxBytes) {
        reader.cancel().catch(() => {});
        controller.error(new SSRFError('Response too large', 'TOO_LARGE'));
        return;
      }
      controller.enqueue(value);
    },
    cancel(reason) {
      reader.cancel(reason).catch(() => {});
    },
  });
  return new Response(capped, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
