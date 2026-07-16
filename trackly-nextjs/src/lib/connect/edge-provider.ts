/**
 * Edge Pro (Connect M3) — Cloudflare provider interface.
 *
 * Edge Pro is the opt-in "max AI-crawler coverage" upgrade over the default
 * client-side snippet: a per-customer Cloudflare edge Worker injects the brand's
 * shipped fixes server-side (before any JS runs), fronted by a Cloudflare for
 * SaaS Custom Hostname the customer CNAMEs to.
 *
 * It CANNOT go live without (a) Cloudflare for SaaS + Workers for Platforms
 * enabled on the account and (b) a scoped API token — which we don't have yet.
 * So everything is built behind this provider interface: a deterministic
 * {@link MockCloudflareEdgeProvider} is used by default, and the real
 * {@link CloudflareEdgeProvider} is selected ONLY when all env creds are
 * present. Server-side only (never import from client components).
 */

import { safeFetch } from '@/lib/safe-fetch';

/** Result of minting a Cloudflare for SaaS Custom Hostname. */
export interface CustomHostnameResult {
  /** Cloudflare's custom_hostname id (persisted for teardown). */
  id: string;
  /** The CNAME target the customer must point their hostname at. */
  cnameTarget: string;
  /** Domain Control Validation record the customer may also need to add. */
  dcvRecord: { name: string; type: string; value: string } | null;
}

/** The Cloudflare operations Edge Pro provisioning needs. Both a mock and a
 *  live implementation satisfy this so the flow is identical either way. */
export interface CloudflareEdgeProvider {
  createCustomHostname(hostname: string): Promise<CustomHostnameResult>;
  deleteCustomHostname(id: string): Promise<{ ok: boolean; error?: string }>;
  dispatchWorker(scriptName: string, script: string): Promise<{ ok: boolean; error?: string }>;
  deleteWorker(scriptName: string): Promise<{ ok: boolean; error?: string }>;
}

/** A URL/DNS-safe slug of a hostname (deterministic — no time/random). */
function slug(hostname: string): string {
  return hostname.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Deterministic, side-effect-free provider used whenever real Cloudflare creds
 * aren't configured. It touches no external infra: it just returns stable,
 * plausible values so the whole provision → CNAME → verify → connected flow
 * (and its tests) exercise end to end without a live account.
 */
export class MockCloudflareEdgeProvider implements CloudflareEdgeProvider {
  /** Where the mock tells customers to CNAME (overridable for parity tests). */
  constructor(private readonly cnameTarget = 'edge.livesov.com') {}

  async createCustomHostname(hostname: string): Promise<CustomHostnameResult> {
    const s = slug(hostname);
    return {
      id: `mock-ch-${s}`,
      cnameTarget: this.cnameTarget,
      dcvRecord: { name: `_cf-custom-hostname.${hostname}`, type: 'TXT', value: `mock-dcv-${s}` },
    };
  }
  async deleteCustomHostname(): Promise<{ ok: boolean }> { return { ok: true }; }
  async dispatchWorker(): Promise<{ ok: boolean }> { return { ok: true }; }
  async deleteWorker(): Promise<{ ok: boolean }> { return { ok: true }; }
}

/** Env creds required for the live provider. All four must be present. */
export interface EdgeCreds {
  token: string;
  accountId: string;
  zoneId: string;
  namespace: string;
  /** The Cloudflare for SaaS CNAME target customers point at (optional). */
  cnameTarget: string;
}

const CF_API = 'https://api.cloudflare.com/client/v4';

interface CfEnvelope<T> { success?: boolean; result?: T; errors?: Array<{ message?: string }> }

/**
 * The live provider (implements {@link CloudflareEdgeProvider}): real Cloudflare
 * for SaaS (Custom Hostnames) + Workers for Platforms (dispatch namespace)
 * calls. Selected ONLY when {@link readEdgeCreds} finds all env creds — until
 * then this code path is never taken. Read-through structured results;
 * createCustomHostname throws on failure (it returns data), dispatch/delete
 * return `{ ok }` so the flow can record a retryable reason.
 */
export class LiveCloudflareEdgeProvider implements CloudflareEdgeProvider {
  constructor(private readonly creds: EdgeCreds) {}

  private async cf<T>(path: string, init: { method?: string; body?: BodyInit; contentType?: string | null } = {}): Promise<{ ok: boolean; result?: T; error?: string }> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.creds.token}` };
    if (init.contentType) headers['Content-Type'] = init.contentType;
    try {
      const res = await safeFetch(`${CF_API}${path}`, { method: init.method ?? 'GET', headers, body: init.body ?? null, timeoutMs: 20_000 });
      const json = (await res.json().catch(() => ({}))) as CfEnvelope<T>;
      if (!res.ok || json.success === false) {
        return { ok: false, error: json.errors?.map((e) => e.message).filter(Boolean).join('; ') || `Cloudflare HTTP ${res.status}` };
      }
      return { ok: true, result: json.result };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async createCustomHostname(hostname: string): Promise<CustomHostnameResult> {
    const r = await this.cf<{ id: string; ownership_verification?: { name?: string; type?: string; value?: string } }>(
      `/zones/${this.creds.zoneId}/custom_hostnames`,
      { method: 'POST', contentType: 'application/json', body: JSON.stringify({ hostname, ssl: { method: 'http', type: 'dv' } }) },
    );
    if (!r.ok || !r.result?.id) throw new Error(`Custom hostname failed: ${r.error ?? 'no id returned'}`);
    const ov = r.result.ownership_verification;
    return {
      id: r.result.id,
      cnameTarget: this.creds.cnameTarget,
      dcvRecord: ov?.name && ov?.type && ov?.value ? { name: ov.name, type: ov.type, value: ov.value } : null,
    };
  }

  async deleteCustomHostname(id: string): Promise<{ ok: boolean; error?: string }> {
    const r = await this.cf(`/zones/${this.creds.zoneId}/custom_hostnames/${id}`, { method: 'DELETE' });
    return { ok: r.ok, error: r.error };
  }

  async dispatchWorker(scriptName: string, script: string): Promise<{ ok: boolean; error?: string }> {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ main_module: 'worker.js', compatibility_date: '2025-01-01' })], { type: 'application/json' }));
    form.append('worker.js', new Blob([script], { type: 'application/javascript+module' }), 'worker.js');
    const r = await this.cf(
      `/accounts/${this.creds.accountId}/workers/dispatch/namespaces/${this.creds.namespace}/scripts/${scriptName}`,
      { method: 'PUT', body: form },
    );
    return { ok: r.ok, error: r.error };
  }

  async deleteWorker(scriptName: string): Promise<{ ok: boolean; error?: string }> {
    const r = await this.cf(`/accounts/${this.creds.accountId}/workers/dispatch/namespaces/${this.creds.namespace}/scripts/${scriptName}`, { method: 'DELETE' });
    return { ok: r.ok, error: r.error };
  }
}

/** All-or-nothing read of the live Cloudflare creds from the environment. */
export function readEdgeCreds(): EdgeCreds | null {
  const token = process.env.CF_API_TOKEN;
  const accountId = process.env.CF_ACCOUNT_ID;
  const zoneId = process.env.CF_ZONE_ID;
  const namespace = process.env.CF_DISPATCH_NAMESPACE;
  if (token && accountId && zoneId && namespace) {
    return { token, accountId, zoneId, namespace, cnameTarget: process.env.CF_SAAS_CNAME_TARGET || 'edge.livesov.com' };
  }
  return null;
}

/** Whether the live Cloudflare creds are configured. */
export function edgeCredsConfigured(): boolean {
  return readEdgeCreds() !== null;
}

/**
 * Whether the Edge Pro flow should be OFFERED at all. True when live creds are
 * configured, or when the `EDGE_PRO_PREVIEW` flag is set (so staff can exercise
 * the flow against the mock provider). When false, the UI keeps the plain
 * "coming soon" stub and the API refuses — normal users are never exposed to a
 * non-functional edge flow.
 */
export function edgeProAvailable(): boolean {
  return edgeCredsConfigured() || process.env.EDGE_PRO_PREVIEW === '1';
}

/**
 * Select the provider: the real one ONLY when all creds are present, otherwise
 * the deterministic mock. `mode` tells the caller/UI which is in effect.
 */
export function getEdgeProvider(): { provider: CloudflareEdgeProvider; mode: 'live' | 'mock' } {
  const creds = readEdgeCreds();
  if (creds) return { provider: new LiveCloudflareEdgeProvider(creds), mode: 'live' };
  return { provider: new MockCloudflareEdgeProvider(), mode: 'mock' };
}
