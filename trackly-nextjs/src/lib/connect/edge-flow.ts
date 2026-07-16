/**
 * Edge Pro (Connect M3) — provision / verify / disconnect orchestration.
 *
 * Sits between the API routes and the {@link CloudflareEdgeProvider}: it mints
 * the per-tenant edge token, dispatches the Worker (built by the same
 * buildEdgeWorkerScript the edge adapter uses), creates the Custom Hostname,
 * persists the Cloudflare ids + encrypted token, and verifies the page is served
 * through the edge. Idempotent and resumable — re-running reuses whatever was
 * already provisioned — and every failure is recorded as a retryable reason.
 */

import crypto from 'crypto';
import { buildEdgeWorkerScript, EDGE_MARKER_HEADER } from '@/lib/fix-engine/edge-worker';
import { workerScriptName } from '@/lib/fix-engine/cloudflare';
import { safeFetch } from '@/lib/safe-fetch';
import { getEdgeProvider } from './edge-provider';
import { connectBaseUrl } from './snippet';
import {
  getSiteConnection,
  getEdgeTokenById,
  updateEdgeConnection,
  type SiteConnection,
} from './schema';

export interface ProvisionResult {
  ok: boolean;
  mode: 'live' | 'mock';
  connection: SiteConnection;
  cnameTarget?: string;
  error?: string;
}
export interface VerifyResult {
  ok: boolean;
  verified: boolean;
  connection: SiteConnection;
  sawInject?: boolean;
  reason?: string;
}
export interface DisconnectResult {
  ok: boolean;
  connection: SiteConnection;
  error?: string;
}

/** A per-tenant, secret token embedded in the customer's edge Worker. */
function mintEdgeToken(): string {
  return 'lvxedge_' + crypto.randomBytes(24).toString('hex');
}

/** The base the Worker fetches per-path overrides from (…/api/edge/serve). */
function edgeServeBase(): string {
  return `${connectBaseUrl()}/api/edge/serve`;
}

/**
 * Provision (or re-provision) Edge Pro for a connection's hostname: dispatch the
 * Worker and mint the Custom Hostname, persisting the Cloudflare ids + encrypted
 * token. Resumable — an existing token/script/hostname is reused, so a second
 * call re-dispatches the (idempotent) Worker but never creates a duplicate
 * Custom Hostname. Status stays 'pending' until {@link verifyEdgeLive} confirms
 * the edge is actually serving the page. On any provider failure the reason is
 * recorded and the connection left retryable.
 */
export async function provisionEdge(connectionId: string, hostname: string): Promise<ProvisionResult> {
  const { provider, mode } = getEdgeProvider();
  const conn = await getSiteConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  // Reuse a frozen token/script/hostname if this connection was partly
  // provisioned already (resumable), otherwise mint fresh.
  const token = (await getEdgeTokenById(conn.id)) || mintEdgeToken();
  const scriptName = conn.cfScriptName || workerScriptName(hostname);

  try {
    const dispatch = await provider.dispatchWorker(scriptName, buildEdgeWorkerScript(token, edgeServeBase()));
    if (!dispatch.ok) throw new Error(dispatch.error || 'Worker dispatch failed');

    // Only mint the Custom Hostname once — a second provision keeps the first.
    let hostnameId = conn.cfCustomHostnameId;
    let cnameTarget = conn.edgeCnameTarget;
    if (!hostnameId) {
      const ch = await provider.createCustomHostname(hostname);
      hostnameId = ch.id;
      cnameTarget = ch.cnameTarget;
    }

    const connection = await updateEdgeConnection(conn.id, {
      cfScriptName: scriptName,
      cfCustomHostnameId: hostnameId,
      edgeCnameTarget: cnameTarget,
      edgeTokenPlain: token,
      error: null,
    });
    return { ok: true, mode, connection, cnameTarget: cnameTarget || '' };
  } catch (e) {
    const connection = await updateEdgeConnection(conn.id, { error: (e as Error).message });
    return { ok: false, mode, connection, error: (e as Error).message };
  }
}

/**
 * Verify the page is served through the edge: fetch it and assert the Worker's
 * `x-livesov-edge` marker header (the authoritative liveness signal), reporting
 * whether an injected `data-livesov` block was also seen. On success the
 * connection flips to 'connected'; otherwise the reason is recorded (retryable).
 */
export async function verifyEdgeLive(connectionId: string, url: string): Promise<VerifyResult> {
  const conn = await getSiteConnection(connectionId);
  if (!conn) throw new Error('Connection not found');
  try {
    const res = await safeFetch(url, { timeoutMs: 12_000, maxBytes: 1024 * 1024 });
    const routed = !!res.headers.get(EDGE_MARKER_HEADER);
    if (!routed) {
      const connection = await updateEdgeConnection(conn.id, { error: 'edge_worker_not_detected' });
      return { ok: false, verified: false, connection, reason: 'edge_worker_not_detected' };
    }
    const body = await res.text().catch(() => '');
    const sawInject = body.includes('data-livesov');
    const connection = await updateEdgeConnection(conn.id, { status: 'connected', error: null });
    return { ok: true, verified: true, connection, sawInject };
  } catch (e) {
    const connection = await updateEdgeConnection(conn.id, { error: (e as Error).message });
    return { ok: false, verified: false, connection, reason: (e as Error).message };
  }
}

/**
 * Tear Edge Pro down: delete the Worker + Custom Hostname via the provider, then
 * clear the Cloudflare ids + token and mark the connection 'stale'. A partial
 * provider failure is surfaced in `error` but the local state is still cleared
 * so the customer isn't stuck.
 */
export async function disconnectEdge(connectionId: string): Promise<DisconnectResult> {
  const { provider } = getEdgeProvider();
  const conn = await getSiteConnection(connectionId);
  if (!conn) throw new Error('Connection not found');

  const failed: string[] = [];
  if (conn.cfScriptName) {
    const r = await provider.deleteWorker(conn.cfScriptName);
    if (!r.ok) failed.push('worker');
  }
  if (conn.cfCustomHostnameId) {
    const r = await provider.deleteCustomHostname(conn.cfCustomHostnameId);
    if (!r.ok) failed.push('hostname');
  }

  const connection = await updateEdgeConnection(conn.id, {
    status: 'stale',
    cfScriptName: null,
    cfCustomHostnameId: null,
    edgeCnameTarget: null,
    edgeTokenPlain: null,
    error: failed.length ? `Teardown incomplete: ${failed.join(', ')}` : null,
  });
  return { ok: failed.length === 0, connection, error: failed.length ? `Teardown incomplete: ${failed.join(', ')}` : undefined };
}
