/**
 * POST /api/brands/[id]/connections/cloudflare/deploy
 *
 * One-click edge publishing for a new website. With the user's Cloudflare
 * API token (sent once in the body, then stored encrypted and reused across
 * all their brands) this route does the whole manual flow by API:
 *
 *   1. verify the token (from body, or the account's stored one)
 *   2. mint the brand's Connector pairing (raw token embeds in the Worker)
 *   3. build the edge Worker script and upload it to the Cloudflare account
 *   4. route it to the site's zone (zone/* and *.zone/*)
 *   5. probe the site for the Worker marker and, once live, create the
 *      brand's `edge` CMS connection — Ship works immediately after.
 *
 * Body: { apiToken?: string } — optional when a stored token exists.
 * Requires write access (viewers cannot deploy).
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import {
  createConnectorPairing,
  getLatestUserConnection,
  upsertConnection,
} from '@/lib/fix-engine/connections';
import { verifyCloudflareToken, findZoneForHost, deployEdgeWorker } from '@/lib/fix-engine/cloudflare';
import { buildEdgeWorkerScript } from '@/lib/fix-engine/edge-worker';
import { getCmsAdapter } from '@/lib/fix-engine/cms';
import { logFixEvent } from '@/lib/fix-engine/schema';

const MARKER_PROBE_ATTEMPTS = 3;
const MARKER_PROBE_DELAY_MS = 2_000;

function edgeBase(): string {
  const base = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/api/edge/serve`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  try {
    const { id } = await params;
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    if (access.role === 'viewer') {
      return Response.json({ error: 'Viewers cannot manage connections.' }, { status: 403 });
    }
    const ownerId = access.brand.userId || user.id;

    const website = access.brand.website as string | undefined;
    if (!website) return Response.json({ error: 'Set the brand website first (Brand Setup).' }, { status: 400 });
    let host: string;
    let siteUrl: string;
    try {
      const u = new URL(website.startsWith('http') ? website : `https://${website}`);
      host = u.host;
      siteUrl = u.origin;
    } catch {
      return Response.json({ error: `Brand website is not a valid URL: ${website}` }, { status: 400 });
    }

    // 1. Token: body wins; otherwise reuse the account's stored token.
    let body: { apiToken?: unknown } = {};
    try { body = (await request.json()) as { apiToken?: unknown }; } catch { /* empty body is fine */ }
    let apiToken = typeof body.apiToken === 'string' ? body.apiToken.trim() : '';
    if (!apiToken) {
      const stored = await getLatestUserConnection(ownerId, 'cloudflare');
      apiToken = typeof stored?.creds?.apiToken === 'string' ? String(stored.creds.apiToken) : '';
    }
    if (!apiToken) {
      return Response.json({
        error: 'No Cloudflare API token. Paste one once (scopes: Workers Scripts:Edit, Workers Routes:Edit, Zone:Read) — it is stored encrypted and reused for every site you add.',
      }, { status: 400 });
    }
    const check = await verifyCloudflareToken(apiToken);
    if (!check.ok) {
      return Response.json({ error: `Cloudflare token verification failed: ${check.error}` }, { status: 400 });
    }
    // Store (or refresh) for this brand so future sites reuse it.
    await upsertConnection({ userId: ownerId, brandId: id, provider: 'cloudflare', creds: { apiToken } });

    // 2. Zone lookup before pairing, so a wrong-account token fails cleanly
    // without rotating an existing Connector token.
    const { zone, error: zoneError } = await findZoneForHost(apiToken, host);
    if (!zone) return Response.json({ error: zoneError }, { status: 400 });
    if (!zone.accountId) return Response.json({ error: 'Cloudflare zone is missing its account id (token may lack Zone:Read).' }, { status: 400 });

    // 3. Pairing: the Worker embeds the brand's raw Connector token. Note:
    // this rotates any existing pairing (same as Re-pair in the dashboard).
    const pairing = await createConnectorPairing(ownerId, id);
    const script = buildEdgeWorkerScript(pairing.token, edgeBase());

    // 4. Upload + route.
    const deploy = await deployEdgeWorker(apiToken, zone, script);
    if (!deploy.ok) return Response.json({ error: deploy.error, scriptName: deploy.scriptName }, { status: 502 });

    // 5. Probe for the marker (route propagation is near-instant, but give
    // it a few seconds) and auto-create the edge CMS connection once live.
    const edge = getCmsAdapter('edge')!;
    let live = false;
    for (let i = 0; i < MARKER_PROBE_ATTEMPTS; i++) {
      if (i > 0) await sleep(MARKER_PROBE_DELAY_MS);
      const probe = await edge.verify({}, siteUrl);
      if (probe.ok) { live = true; break; }
    }
    if (live) {
      await upsertConnection({ userId: ownerId, brandId: id, provider: 'cms', cmsType: 'edge', siteUrl, creds: {} });
    }
    await logFixEvent(null, id, ownerId, 'edge.deployed', {
      zone: zone.name, scriptName: deploy.scriptName, routes: deploy.routes, live,
    });

    return Response.json({
      ok: true,
      zone: zone.name,
      scriptName: deploy.scriptName,
      routes: deploy.routes,
      connected: live,
      note: live
        ? 'Worker deployed, routed, verified live, and the edge connection is active — Ship now publishes to this site.'
        : 'Worker deployed and routed, but the marker isn’t visible yet (DNS may not be proxied through Cloudflare, or propagation is slow). Re-try Connect (platform: edge) in a minute.',
    }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.error('fix_engine.cloudflare_deploy_failed', { err: (e as Error).message });
    return Response.json({ error: 'Deploy failed', message: (e as Error).message }, { status: 500 });
  }
}
