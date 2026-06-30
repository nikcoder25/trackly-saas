/**
 * /api/brands/[id]/automation
 *
 * GET → the brand's Fix Engine automation settings (scheduled scans +
 *       auto-pilot).
 * PUT → update them. Plan-gated (Starter+); viewers read-only.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess, getUserEffectivePlan } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { getAutomation, setAutomation, type AutomationPatch, type ScanFrequency } from '@/lib/fix-engine/automation';
import { meetsPlan } from '@/lib/fix-engine/registry';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  try {
    const { id } = await params;
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    return Response.json({ automation: await getAutomation(id) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.error('fix_engine.automation_get_failed', { err: (e as Error).message });
    return Response.json({ error: 'Failed to load automation', message: (e as Error).message }, { status: 500 });
  }
}

interface Body {
  scanEnabled?: unknown; scanFrequency?: unknown; scanModules?: unknown;
  autopilotGenerate?: unknown; autopilotShipDeterministic?: unknown;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  try {
    const { id } = await params;
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot change automation.' }, { status: 403 });

    const ownerId = access.brand.userId || user.id;
    const plan = await getUserEffectivePlan(ownerId);
    if (!meetsPlan(plan, 'starter')) {
      return Response.json({ error: 'The Fix Engine is available on Starter plans and above.', planLimit: true }, { status: 403 });
    }

    let body: Body;
    try { body = (await request.json()) as Body; } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    const patch: AutomationPatch = {};
    if (typeof body.scanEnabled === 'boolean') patch.scanEnabled = body.scanEnabled;
    if (body.scanFrequency === 'daily' || body.scanFrequency === 'weekly') patch.scanFrequency = body.scanFrequency as ScanFrequency;
    if (Array.isArray(body.scanModules)) patch.scanModules = body.scanModules.filter((m): m is string => typeof m === 'string');
    if (typeof body.autopilotGenerate === 'boolean') patch.autopilotGenerate = body.autopilotGenerate;
    if (typeof body.autopilotShipDeterministic === 'boolean') patch.autopilotShipDeterministic = body.autopilotShipDeterministic;

    const automation = await setAutomation(id, patch);
    return Response.json({ automation }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.error('fix_engine.automation_put_failed', { err: (e as Error).message });
    return Response.json({ error: 'Failed to save automation', message: (e as Error).message }, { status: 500 });
  }
}
