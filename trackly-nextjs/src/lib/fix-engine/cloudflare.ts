/**
 * Fix Engine - Cloudflare API client for one-click edge Worker deploys.
 *
 * With a user-supplied API token (needed scopes: Account → Workers Scripts:
 * Edit, Zone → Workers Routes: Edit, Zone → Zone: Read), Livesov deploys the
 * edge Worker itself: upload the script to the account, then route it to the
 * brand's zone. Connecting Cloudflare is once per account — every website
 * added after that is a single click, no dashboard copy-paste.
 *
 * All calls go through safeFetch against api.cloudflare.com and return
 * structured results (never throw for API-level failures) so the deploy
 * route can report exactly which step needs attention.
 */

import { safeFetch } from '@/lib/safe-fetch';

const CF_API = 'https://api.cloudflare.com/client/v4';

interface CfEnvelope<T> {
  success?: boolean;
  result?: T;
  errors?: Array<{ code?: number; message?: string }>;
}

function cfError<T>(json: CfEnvelope<T>, fallback: string): string {
  return json.errors?.map((e) => e.message).filter(Boolean).join('; ') || fallback;
}

async function cf<T>(
  token: string,
  path: string,
  init: { method?: string; body?: BodyInit; contentType?: string | null } = {},
): Promise<{ ok: boolean; result?: T; error?: string; status: number }> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  // FormData sets its own multipart boundary — only set JSON explicitly.
  if (init.contentType) headers['Content-Type'] = init.contentType;
  try {
    const res = await safeFetch(`${CF_API}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body ?? null,
      timeoutMs: 20_000,
    });
    const json = (await res.json().catch(() => ({}))) as CfEnvelope<T>;
    if (!res.ok || json.success === false) {
      return { ok: false, status: res.status, error: cfError(json, `Cloudflare returned HTTP ${res.status}`) };
    }
    return { ok: true, status: res.status, result: json.result };
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message };
  }
}

/** Confirm the API token is valid and active. */
export async function verifyCloudflareToken(token: string): Promise<{ ok: boolean; error?: string }> {
  const r = await cf<{ status?: string }>(token, '/user/tokens/verify');
  if (!r.ok) return { ok: false, error: r.error };
  if (r.result?.status !== 'active') return { ok: false, error: `Token status is '${r.result?.status ?? 'unknown'}'` };
  return { ok: true };
}

export interface CfZone { id: string; name: string; accountId: string }

/**
 * Find the Cloudflare zone that owns `host`, walking up the labels
 * (blog.acme.co.uk → acme.co.uk → co.uk) so subdomain sites resolve to
 * their registered zone.
 */
export async function findZoneForHost(token: string, host: string): Promise<{ zone?: CfZone; error?: string }> {
  const labels = host.toLowerCase().replace(/\.$/, '').split('.');
  for (let i = 0; i <= labels.length - 2; i++) {
    const name = labels.slice(i).join('.');
    const r = await cf<Array<{ id: string; name: string; account?: { id?: string } }>>(
      token, `/zones?name=${encodeURIComponent(name)}&status=active`,
    );
    if (!r.ok) return { error: r.error };
    const z = r.result?.[0];
    if (z?.id) return { zone: { id: z.id, name: z.name, accountId: z.account?.id ?? '' } };
  }
  return { error: `No active Cloudflare zone found for ${host} on this account — is the domain on Cloudflare?` };
}

/** Cloudflare Worker script names: lowercase alphanumerics and dashes. */
export function workerScriptName(zoneName: string): string {
  return `livesov-edge-${zoneName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
}

/**
 * Upload the Worker (module syntax) to the account and route it to the
 * zone (`zone/*` + `*.zone/*`, updating an existing route that points at a
 * different script). Idempotent — safe to re-run on re-deploys.
 */
export async function deployEdgeWorker(
  token: string,
  zone: CfZone,
  script: string,
): Promise<{ ok: boolean; scriptName: string; routes: string[]; error?: string }> {
  const scriptName = workerScriptName(zone.name);

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ main_module: 'worker.js', compatibility_date: '2025-01-01' })], { type: 'application/json' }));
  form.append('worker.js', new Blob([script], { type: 'application/javascript+module' }), 'worker.js');
  const up = await cf(token, `/accounts/${zone.accountId}/workers/scripts/${scriptName}`, { method: 'PUT', body: form });
  if (!up.ok) return { ok: false, scriptName, routes: [], error: `Worker upload failed: ${up.error}` };

  const wanted = [`${zone.name}/*`, `*.${zone.name}/*`];
  const existing = await cf<Array<{ id: string; pattern: string; script?: string }>>(token, `/zones/${zone.id}/workers/routes`);
  if (!existing.ok) return { ok: false, scriptName, routes: [], error: `Could not list routes: ${existing.error}` };

  const routed: string[] = [];
  for (const pattern of wanted) {
    const current = existing.result?.find((r) => r.pattern === pattern);
    if (current?.script === scriptName) { routed.push(pattern); continue; }
    const r = current
      ? await cf(token, `/zones/${zone.id}/workers/routes/${current.id}`, {
          method: 'PUT', contentType: 'application/json', body: JSON.stringify({ pattern, script: scriptName }),
        })
      : await cf(token, `/zones/${zone.id}/workers/routes`, {
          method: 'POST', contentType: 'application/json', body: JSON.stringify({ pattern, script: scriptName }),
        });
    if (!r.ok) return { ok: false, scriptName, routes: routed, error: `Route '${pattern}' failed: ${r.error}` };
    routed.push(pattern);
  }
  return { ok: true, scriptName, routes: routed };
}
