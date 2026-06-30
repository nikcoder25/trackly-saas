/**
 * POST /api/brands/[id]/connections/connector/pair
 *
 * Creates (or rotates) the Connector pairing for a brand and returns the
 * raw bearer token + HMAC secret ONCE. The user pastes these into the
 * Connector plugin. Only the token hash + (encrypted) secret are stored.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { createConnectorPairing } from '@/lib/fix-engine/connections';

function pullUrl(): string {
  const base = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/api/connector/instructions`;
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
    const pairing = await createConnectorPairing(access.brand.userId || user.id, id);
    return Response.json(
      {
        token: pairing.token,
        hmacSecret: pairing.hmacSecret,
        pullUrl: pullUrl(),
        note: 'Store these now — the token is shown only once. Paste them into the Connector plugin.',
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    logger.error('fix_engine.connector_pair_failed', { err: (e as Error).message });
    return Response.json({ error: 'Failed to create pairing', message: (e as Error).message }, { status: 500 });
  }
}
