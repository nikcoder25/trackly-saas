/**
 * POST /api/brands/[id]/connections/cloudflare/deploy
 *
 * One-click edge publishing for a website. With the user's Cloudflare API
 * token (sent once in the body, then stored encrypted and reused across all
 * their brands — including by the cron's zero-click auto-connect for every
 * website they add later) this route runs the whole manual flow by API:
 * verify token → find zone → mint pairing → upload + route the Worker →
 * probe the live marker → activate the brand's `edge` CMS connection.
 *
 * Body: { apiToken?: string } — optional when a stored token exists.
 * Requires write access (viewers cannot deploy).
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { getLatestUserConnection, upsertConnection } from '@/lib/fix-engine/connections';
import { verifyCloudflareToken } from '@/lib/fix-engine/cloudflare';
import { provisionEdgeForBrand } from '@/lib/fix-engine/edge-deploy';
import { logFixEvent } from '@/lib/fix-engine/schema';

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

    // Token: body wins; otherwise reuse the account's stored token.
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
    // Store (or refresh) so future sites deploy with no token entry — the
    // cron auto-connect picks up new brands from this account automatically.
    await upsertConnection({ userId: ownerId, brandId: id, provider: 'cloudflare', creds: { apiToken } });

    const result = await provisionEdgeForBrand(apiToken, id, ownerId, website);
    if (!result.ok) {
      return Response.json({ error: result.error, zone: result.zone, scriptName: result.scriptName }, { status: result.zone ? 502 : 400 });
    }
    await logFixEvent(null, id, ownerId, 'edge.deployed', {
      zone: result.zone, scriptName: result.scriptName, routes: result.routes, live: result.connected,
    });

    return Response.json({
      ok: true,
      zone: result.zone,
      scriptName: result.scriptName,
      routes: result.routes,
      connected: result.connected,
      note: result.connected
        ? 'Worker deployed, routed, verified live, and the edge connection is active — Ship now publishes to this site.'
        : 'Worker deployed and routed, but the marker isn’t visible yet (DNS may not be proxied through Cloudflare, or propagation is slow). Re-try Connect (platform: edge) in a minute.',
    }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.error('fix_engine.cloudflare_deploy_failed', { err: (e as Error).message });
    return Response.json({ error: 'Deploy failed', message: (e as Error).message }, { status: 500 });
  }
}
