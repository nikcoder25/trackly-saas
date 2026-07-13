/**
 * Fix Engine - edge deploy orchestration (shared by the one-click route and
 * the zero-click cron pass).
 *
 * provisionEdgeForBrand() is the whole chain for one site: find the
 * Cloudflare zone, mint the brand's Connector pairing, build + upload +
 * route the Worker, probe the live site for the marker, and activate the
 * brand's `edge` CMS connection once it's live.
 *
 * runEdgeAutoConnect() makes adding a website ZERO-click: the cron finds
 * brands whose owner already stored a Cloudflare token but that have no CMS
 * connection yet, and provisions them automatically. Exactly one attempt
 * per brand (the 'edge.autodeploy' event gates re-runs), so a domain that
 * isn't on the user's Cloudflare account is probed once, not every tick —
 * the user can always run the one-click deploy manually, which reports the
 * exact error.
 */

import { logger } from '@/lib/logger';
import { createConnectorPairing, getLatestUserConnection, upsertConnection } from './connections';
import { findZoneForHost, deployEdgeWorker } from './cloudflare';
import { buildEdgeWorkerScript } from './edge-worker';
import { getCmsAdapter } from './cms';
import { findEdgeAutoConnectCandidates, logFixEvent } from './schema';

const MARKER_PROBE_ATTEMPTS = 3;
const MARKER_PROBE_DELAY_MS = 2_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Absolute /api/edge/serve URL of this deployment (embedded in the Worker). */
export function edgeServeBase(): string {
  const base = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/api/edge/serve`;
}

export interface EdgeProvisionResult {
  ok: boolean;
  zone?: string;
  scriptName?: string;
  routes?: string[];
  /** True when the Worker marker was seen live and the edge CMS connection was activated. */
  connected?: boolean;
  error?: string;
}

/**
 * Deploy + route + verify + connect the edge Worker for one brand. Assumes
 * the caller resolved and verified the Cloudflare token. Note: mints a fresh
 * Connector pairing (rotates any existing one, same as dashboard Re-pair).
 */
export async function provisionEdgeForBrand(
  apiToken: string,
  brandId: string,
  ownerId: string,
  website: string,
): Promise<EdgeProvisionResult> {
  let host: string;
  let siteUrl: string;
  try {
    const u = new URL(website.startsWith('http') ? website : `https://${website}`);
    host = u.host;
    siteUrl = u.origin;
  } catch {
    return { ok: false, error: `Brand website is not a valid URL: ${website}` };
  }

  const { zone, error: zoneError } = await findZoneForHost(apiToken, host);
  if (!zone) return { ok: false, error: zoneError };
  if (!zone.accountId) {
    return { ok: false, error: 'Cloudflare zone is missing its account id (token may lack Zone:Read).' };
  }

  const pairing = await createConnectorPairing(ownerId, brandId);
  const script = buildEdgeWorkerScript(pairing.token, edgeServeBase());

  const deploy = await deployEdgeWorker(apiToken, zone, script);
  if (!deploy.ok) {
    return { ok: false, zone: zone.name, scriptName: deploy.scriptName, error: deploy.error };
  }

  // Route propagation is near-instant; give it a few seconds before
  // declaring "deployed but not visible yet".
  const edge = getCmsAdapter('edge')!;
  let live = false;
  for (let i = 0; i < MARKER_PROBE_ATTEMPTS; i++) {
    if (i > 0) await sleep(MARKER_PROBE_DELAY_MS);
    const probe = await edge.verify({}, siteUrl);
    if (probe.ok) { live = true; break; }
  }
  if (live) {
    await upsertConnection({ userId: ownerId, brandId, provider: 'cms', cmsType: 'edge', siteUrl, creds: {} });
  }
  return { ok: true, zone: zone.name, scriptName: deploy.scriptName, routes: deploy.routes, connected: live };
}

export interface EdgeAutoConnectSummary { attempted: number; connected: number }

/**
 * Cron pass: zero-click edge publishing for newly added websites. For each
 * candidate brand, reuse the owner's stored Cloudflare token and provision
 * the edge end-to-end. Every attempt (success or failure) logs an
 * 'edge.autodeploy' brand event, which both feeds the activity feed and
 * gates the candidate query so each brand is attempted exactly once.
 */
export async function runEdgeAutoConnect(limit = 3): Promise<EdgeAutoConnectSummary> {
  const candidates = await findEdgeAutoConnectCandidates(limit);
  let attempted = 0, connected = 0;
  for (const c of candidates) {
    try {
      const stored = await getLatestUserConnection(c.userId, 'cloudflare');
      const apiToken = typeof stored?.creds?.apiToken === 'string' ? String(stored.creds.apiToken) : '';
      if (!apiToken) continue; // race: token revoked since the query
      attempted++;
      const result = await provisionEdgeForBrand(apiToken, c.brandId, c.userId, c.website);
      if (result.connected) connected++;
      await logFixEvent(null, c.brandId, c.userId, 'edge.autodeploy', { ...result, website: c.website });
    } catch (e) {
      logger.warn('fix_engine.edge_autoconnect_failed', { brandId: c.brandId, err: (e as Error).message });
      await logFixEvent(null, c.brandId, c.userId, 'edge.autodeploy', { ok: false, error: (e as Error).message, website: c.website })
        .catch(() => undefined);
    }
  }
  return { attempted, connected };
}
