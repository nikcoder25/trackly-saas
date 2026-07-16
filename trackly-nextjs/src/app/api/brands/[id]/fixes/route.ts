/**
 * /api/brands/[id]/fixes
 *
 * GET  → list fixes for a brand (+ the module catalog) with optional
 *        ?status=&module=&channel= filters.
 * POST → start a detection scan across selected modules. Mirrors the
 *        geo-audits dispatch: insert a queued batch, fire runScan() via
 *        after(); /api/cron/fix-engine-worker is the cold-restart net.
 *
 * Gating: the Fix Engine requires a paid plan (effective plan ≥ starter).
 * Individual modules additionally enforce their own minPlan at scan time.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess, getUserEffectivePlan } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { listFixes, ensureFixEngineSchema, getAttentionSummary } from '@/lib/fix-engine/schema';
import { dispatchScan } from '@/lib/fix-engine/engine';
import { moduleCatalog, getModule, meetsPlan } from '@/lib/fix-engine/registry';
import { getBrandAiVisibility } from '@/lib/fix-engine/ai-visibility';
import { computeGeoHealthScore } from '@/lib/fix-engine/health';
import { getPageMetrics, refreshPageMetrics, normUrl } from '@/lib/fix-engine/page-metrics';

const FIX_ENGINE_MIN_PLAN = 'starter';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  try {
    const { id } = await params;
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    await ensureFixEngineSchema();

    const url = new URL(request.url);
    const fixes = await listFixes(id, {
      status: url.searchParams.get('status')?.trim() || undefined,
      moduleKey: url.searchParams.get('module')?.trim() || undefined,
      channel: url.searchParams.get('channel')?.trim() || undefined,
    });

    const ownerId = access.brand.userId || user.id;
    const plan = await getUserEffectivePlan(ownerId);
    const catalog = moduleCatalog().map((m) => ({ ...m, available: meetsPlan(plan, m.minPlan) }));
    const attention = await getAttentionSummary(id);
    const aiVisibility = await getBrandAiVisibility(id);
    const health = computeGeoHealthScore(fixes);

    // Page-weighted ranking: enrich each fix with its target page's 28-day
    // GSC impressions (cached; refresh is cheap-noop when GSC isn't linked).
    let enriched: (typeof fixes[number] & { pageImpressions?: number })[] = fixes;
    try {
      await refreshPageMetrics(id, ownerId);
      const urls = fixes.map((f) => f.targetUrl).filter((u): u is string => !!u);
      const metrics = await getPageMetrics(id, urls);
      enriched = fixes.map((f) => {
        const m = f.targetUrl ? metrics.get(normUrl(f.targetUrl)) : undefined;
        return m ? { ...f, pageImpressions: m.impressions } : f;
      });
    } catch (e) {
      logger.warn('fix_engine.page_metrics_enrich_failed', { err: (e as Error).message });
    }

    return Response.json(
      { fixes: enriched, catalog, plan, enabled: meetsPlan(plan, FIX_ENGINE_MIN_PLAN), attention, aiVisibility, health },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    logger.error('fix_engine.list_failed', { err: (e as Error).message, userId: user.id });
    return Response.json({ error: 'Failed to load fixes', message: (e as Error).message }, { status: 500 });
  }
}

interface ScanBody { modules?: unknown }

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  try {
    const { id } = await params;
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    if (access.role === 'viewer') {
      return Response.json({ error: 'Viewers cannot run scans.' }, { status: 403 });
    }

    const ownerId = access.brand.userId || user.id;
    const plan = await getUserEffectivePlan(ownerId);
    if (!meetsPlan(plan, FIX_ENGINE_MIN_PLAN)) {
      return Response.json(
        { error: 'The Fix Engine is available on Starter plans and above. Upgrade to access.', planLimit: true },
        { status: 403 },
      );
    }
    if (!access.brand.website) {
      return Response.json({ error: 'Add a website to this brand before scanning.' }, { status: 400 });
    }

    let body: ScanBody = {};
    try { body = (await request.json()) as ScanBody; } catch { /* empty body = scan all */ }

    const requested = Array.isArray(body.modules)
      ? body.modules.filter((m): m is string => typeof m === 'string')
      : [];
    // Default to every Phase-1 module the plan allows; otherwise the
    // explicit selection, filtered to known + plan-allowed modules.
    const allowed = (requested.length ? requested : moduleCatalog().map((m) => m.key))
      .filter((k) => {
        const mod = getModule(k);
        return mod && meetsPlan(plan, mod.minPlan);
      });
    if (allowed.length === 0) {
      return Response.json({ error: 'No runnable modules for your plan/selection.' }, { status: 400 });
    }

    const batchId = await dispatchScan(ownerId, id, allowed);
    return Response.json({ batchId, modules: allowed, status: 'queued' }, { status: 202 });
  } catch (e) {
    logger.error('fix_engine.scan_failed', { err: (e as Error).message, userId: user.id });
    return Response.json({ error: 'Failed to start scan', message: (e as Error).message }, { status: 500 });
  }
}
