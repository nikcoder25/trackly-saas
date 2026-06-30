/**
 * /api/brands/[id]/connections
 *
 * GET  → list this brand's integration connections (CMS / GSC /
 *        Connector), masked (never returns credentials).
 * POST → create/update a connection. For a CMS connection we verify the
 *        credentials against the live site before storing them.
 *
 * Credentials are encrypted at rest (AES-256-GCM via ENCRYPTION_KEY) and
 * only ever decrypted inside the engine's ship path.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { listConnections, upsertConnection } from '@/lib/fix-engine/connections';
import { getCmsAdapter, listSupportedCms } from '@/lib/fix-engine/cms';
import { getTracker } from '@/lib/fix-engine/trackers';

export async function GET(
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
    const connections = await listConnections(id);
    return Response.json(
      { connections, supportedCms: listSupportedCms() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    logger.error('fix_engine.connections_list_failed', { err: (e as Error).message });
    return Response.json({ error: 'Failed to load connections', message: (e as Error).message }, { status: 500 });
  }
}

interface ConnBody {
  provider?: unknown;
  cmsType?: unknown;
  siteUrl?: unknown;
  creds?: unknown;
  meta?: unknown;
}

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

    let body: ConnBody;
    try { body = (await request.json()) as ConnBody; } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    const provider = typeof body.provider === 'string' ? body.provider : '';
    if (!['cms', 'gsc', 'connector', 'linear', 'jira'].includes(provider)) {
      return Response.json({ error: 'provider must be one of: cms, gsc, connector, linear, jira' }, { status: 400 });
    }
    const creds = (body.creds && typeof body.creds === 'object') ? (body.creds as Record<string, unknown>) : {};
    const siteUrl = typeof body.siteUrl === 'string' ? body.siteUrl.trim() : (access.brand.website as string | undefined) ?? null;
    const meta = (body.meta && typeof body.meta === 'object') ? (body.meta as Record<string, unknown>) : {};

    if (provider === 'cms') {
      const cmsType = typeof body.cmsType === 'string' ? body.cmsType.toLowerCase() : '';
      const adapter = getCmsAdapter(cmsType);
      if (!adapter) {
        return Response.json({ error: `Unsupported CMS type. Supported: ${listSupportedCms().join(', ')}` }, { status: 400 });
      }
      if (!siteUrl) return Response.json({ error: 'siteUrl is required for a CMS connection' }, { status: 400 });
      // Verify before storing so we never persist creds that don't work.
      const check = await adapter.verify(creds, siteUrl);
      if (!check.ok) {
        return Response.json({ error: `CMS verification failed: ${check.detail ?? 'unknown error'}` }, { status: 400 });
      }
      const conn = await upsertConnection({
        userId: access.brand.userId || user.id, brandId: id, provider: 'cms',
        cmsType, siteUrl, creds, meta,
      });
      return Response.json({ connection: conn, verified: true }, { status: 201 });
    }

    if (provider === 'linear' || provider === 'jira') {
      // Verify the API token before storing so we never persist creds that
      // don't work (and so the connect button gives instant feedback).
      const tracker = getTracker(provider)!;
      const check = await tracker.verify(creds);
      if (!check.ok) {
        return Response.json({ error: `${provider} verification failed: ${check.detail ?? 'unknown error'}` }, { status: 400 });
      }
      const conn = await upsertConnection({
        userId: access.brand.userId || user.id, brandId: id, provider,
        siteUrl: null, creds, meta,
      });
      return Response.json({ connection: conn, verified: true }, { status: 201 });
    }

    // gsc / connector: store as-is. (GSC OAuth + Connector pairing flows
    // are specced in docs/FIX-ENGINE.md and land in later phases; this
    // endpoint already persists their creds encrypted.)
    const conn = await upsertConnection({
      userId: access.brand.userId || user.id, brandId: id, provider: provider as 'gsc' | 'connector',
      siteUrl, creds, meta,
    });
    return Response.json({ connection: conn }, { status: 201 });
  } catch (e) {
    logger.error('fix_engine.connections_upsert_failed', { err: (e as Error).message });
    return Response.json({ error: 'Failed to save connection', message: (e as Error).message }, { status: 500 });
  }
}
