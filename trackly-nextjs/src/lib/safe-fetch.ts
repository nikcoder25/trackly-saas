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

// Maps `SSRFError.code` to user-facing copy for endpoints that surface
// safe-fetch failures (e.g. /api/geo-audit). HOST_BLOCKED + IP_BLOCKED
// stay generic on purpose - telling a caller exactly which private
// range we rejected would leak infra topology to an attacker. Every
// other code is non-security-sensitive and gets actionable copy.
export function ssrfErrorToCopy(code: string): string {
  switch (code) {
    case 'PROTOCOL_BLOCKED':
      return 'URL protocol not allowed. Use http or https.';
    case 'DNS_FAILED':
    case 'DNS_EMPTY':
      return "We couldn't find that domain. Check the URL and try again.";
    case 'TOO_MANY_REDIRECTS':
      return 'URL redirects too many times.';
    case 'TOO_LARGE':
      return 'Page is too large to analyze (over 5 MB).';
    case 'INVALID_URL':
      return 'Invalid URL.';
    case 'HOST_BLOCKED':
    case 'IP_BLOCKED':
    default:
      return "We couldn't reach that URL.";
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

// Expand an IPv6 literal into its 8 16-bit hextets. Handles `::` compression,
// an embedded trailing dotted quad (e.g. ::ffff:1.2.3.4) and a zone id
// (fe80::1%eth0). Returns null when the input is not a well-formed address.
export function parseIPv6(ip: string): number[] | null {
  let h = ip.toLowerCase().replace(/^\[|\]$/g, '');
  const zone = h.indexOf('%');
  if (zone !== -1) h = h.slice(0, zone);
  if (!h) return null;

  // Embedded IPv4 in the last 32 bits.
  let tail: number[] = [];
  const lastColon = h.lastIndexOf(':');
  if (lastColon !== -1 && h.slice(lastColon + 1).includes('.')) {
    const v4 = h.slice(lastColon + 1);
    const m = v4.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return null;
    const o = m.slice(1).map(Number);
    if (o.some((n) => n > 255)) return null;
    tail = [(o[0] << 8) | o[1], (o[2] << 8) | o[3]];
    h = h.slice(0, lastColon + 1);
    // `::1.2.3.4` leaves `::`, `::ffff:1.2.3.4` leaves `::ffff:`; restore a
    // parseable form by trimming the dangling single colon.
    if (h.endsWith(':') && !h.endsWith('::')) h = h.slice(0, -1);
  }

  const parseGroups = (part: string): number[] | null => {
    if (part === '') return [];
    const groups = part.split(':');
    const out: number[] = [];
    for (const g of groups) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };

  const want = 8 - tail.length;
  const dbl = h.indexOf('::');
  let groups: number[];
  if (dbl !== -1) {
    if (h.indexOf('::', dbl + 1) !== -1) return null;
    const head = parseGroups(h.slice(0, dbl));
    const rest = parseGroups(h.slice(dbl + 2));
    if (!head || !rest) return null;
    const fill = want - head.length - rest.length;
    if (fill < 1) return null;
    groups = [...head, ...new Array(fill).fill(0), ...rest];
  } else {
    const all = parseGroups(h);
    if (!all || all.length !== want) return null;
    groups = all;
  }
  return [...groups, ...tail];
}

function hextetsToIPv4(hi: number, lo: number): string {
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

function isBlockedIPv6(ip: string): boolean {
  const g = parseIPv6(ip);
  // Anything we cannot parse is treated as blocked (fail closed).
  if (!g) return true;
  const zeroUpTo = (n: number) => g.slice(0, n).every((x) => x === 0);

  // :: (unspecified) and ::1 (loopback).
  if (zeroUpTo(7) && (g[7] === 0 || g[7] === 1)) return true;
  // IPv4-mapped ::ffff:0:0/96.
  if (zeroUpTo(5) && g[5] === 0xffff) return isBlockedIPv4(hextetsToIPv4(g[6], g[7]));
  // IPv4-translated ::ffff:0:0:0/96 (::ffff:0:a.b.c.d).
  if (zeroUpTo(4) && g[4] === 0xffff && g[5] === 0) {
    return isBlockedIPv4(hextetsToIPv4(g[6], g[7]));
  }
  // IPv4-compatible ::a.b.c.d (deprecated ::/96).
  if (zeroUpTo(6)) return isBlockedIPv4(hextetsToIPv4(g[6], g[7]));
  // NAT64 well-known prefix 64:ff9b::/96 and local-use 64:ff9b:1::/48.
  if (g[0] === 0x64 && g[1] === 0xff9b) {
    if (g.slice(2, 6).every((x) => x === 0)) return isBlockedIPv4(hextetsToIPv4(g[6], g[7]));
    if (g[2] === 1) return true;
  }
  // 6to4 2002::/16 embeds the IPv4 in bits 16-48.
  if (g[0] === 0x2002) return isBlockedIPv4(hextetsToIPv4(g[1], g[2]));
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
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

// Overridable for tests. ESM namespaces aren't spy-able under vitest, so we
// route the DNS call through a module-local indirection instead.
export type LookupFn = (hostname: string) => Promise<string[]>;
const defaultLookup: LookupFn = async (hostname) => {
  const results = await dns.lookup(hostname, { all: true });
  return results.map((r) => r.address);
};

export async function assertPublicUrl(
  urlStr: string,
  allowedProtocols: string[] = DEFAULT_PROTOCOLS,
  lookup: LookupFn = defaultLookup,
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
      ips = await lookup(hostname);
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
  lookup?: LookupFn;
}

// ── Connection pinning (DNS-rebinding / TOCTOU defence) ──────────────────────
//
// `assertPublicUrl` validates the IPs a hostname resolves to, but plain
// `fetch(url)` re-resolves the hostname independently when it opens the
// socket. A hostname whose DNS answer flips between our check and the connect
// (DNS rebinding) could therefore land on a private IP we already rejected.
// To close that window we pin the socket to a validated IP via an undici
// `Agent` with a custom `connect.lookup`, so the address fetch dials is the
// exact one we approved. The TLS servername/SNI and Host header stay the
// original hostname (undici derives them from the request URL), so HTTPS
// certificate validation is unaffected.

interface PinnedAgent {
  close(): Promise<void>;
  destroy(): Promise<void>;
}
type AgentCtor = new (opts: unknown) => PinnedAgent;

// Cached result of `import('undici')`. `undefined` = not attempted yet,
// `null` = unavailable (fall back to re-validation only).
let undiciAgentCtor: AgentCtor | null | undefined;
async function getAgentCtor(): Promise<AgentCtor | null> {
  if (undiciAgentCtor !== undefined) return undiciAgentCtor;
  try {
    // `undici` ships with the Node runtime (it backs global fetch) but isn't a
    // declared dependency, so it has no type declarations at build time. Use a
    // non-literal specifier so TypeScript treats this as a dynamic import
    // (`Promise<any>`) instead of trying to resolve the module's types - the
    // DO-parity `next build` typechecks and would otherwise fail with
    // "Cannot find module 'undici'". If it isn't importable at runtime the
    // catch below leaves us on the per-hop re-validation fallback.
    const undiciSpecifier: string = 'undici';
    const mod = (await import(undiciSpecifier)) as { Agent?: AgentCtor };
    undiciAgentCtor = mod.Agent ?? null;
  } catch {
    undiciAgentCtor = null;
  }
  return undiciAgentCtor;
}

// Build a dns.lookup-shaped function that always resolves to `ip`, matching
// both the (err, address, family) and the `{ all: true }` array callback
// forms Node's socket layer may use. Exported for tests.
export function pinnedLookup(ip: string) {
  const family = net.isIPv6(ip) ? 6 : 4;
  return (
    _hostname: string,
    options: unknown,
    callback: (err: Error | null, address: unknown, family?: number) => void,
  ): void => {
    if (options && typeof options === 'object' && (options as { all?: boolean }).all) {
      callback(null, [{ address: ip, family }]);
    } else {
      callback(null, ip, family);
    }
  };
}

async function makePinnedAgent(ip: string): Promise<PinnedAgent | null> {
  const Ctor = await getAgentCtor();
  if (!Ctor) return null;
  try {
    return new Ctor({ connect: { lookup: pinnedLookup(ip) } });
  } catch {
    return null;
  }
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
    lookup = defaultLookup,
  } = options;

  let currentUrl = typeof input === 'string' ? input : input.toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const { ips } = await assertPublicUrl(currentUrl, allowedProtocols, lookup);
      // Pin the connection to a validated IP so DNS can't be re-resolved to a
      // private address between the check above and the connect below. When
      // undici isn't available the per-hop re-validation still stands.
      const agent = ips[0] ? await makePinnedAgent(ips[0]) : null;
      const response = await fetch(currentUrl, {
        method,
        headers,
        body,
        redirect: 'manual',
        signal: controller.signal,
        // `dispatcher` is an undici-specific fetch option not yet in the DOM
        // typings; it's honoured by Node's global (undici) fetch.
        ...(agent ? { dispatcher: agent } : {}),
      } as RequestInit);
      // Graceful close: undici's Agent.close() waits for the in-flight request
      // (and its streaming body) to finish before tearing the pool down, so
      // this never truncates the response we're about to read.
      if (agent) void agent.close().catch(() => {});
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
