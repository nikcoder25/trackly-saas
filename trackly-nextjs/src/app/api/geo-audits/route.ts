/**
 * /api/geo-audits — list (GET) and create (POST) Regional Audits.
 *
 * GET  /api/geo-audits             → list current user's audits, newest first
 * POST /api/geo-audits             → create + dispatch a new audit
 *
 * The POST flow mirrors brands/[id]/run:
 *   - Auth + plan-cap validation
 *   - reserveCredits() up-front for (regions × prompts × 5 platforms)
 *   - createAuditRecord() inserts the row in 'queued'
 *   - after(() => processGeoAudit(id)) runs the heavy work in the
 *     background; the request returns immediately with the audit id
 *   - The /api/cron/geo-audits-worker route is the cold-restart
 *     safety net (picks up rows stuck in 'queued' > 60s)
 */

import { after } from 'next/server';
import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getEffectivePlan, getPlanLimits } from '@/lib/constants';
import { logger } from '@/lib/logger';
import {
  ensureGeoAuditsSchema,
  createAuditRecord,
  reserveAuditCredits,
  processGeoAudit,
  GEO_AUDIT_PLATFORMS,
} from '@/lib/geo-audits';

const MAX_REGIONS_PER_AUDIT = 5;
const MAX_PROMPTS_PER_AUDIT = 100;

export interface GeoAuditListItem {
  id: string;
  brandId: string;
  regions: string[];
  /**
   * Configured prompts on this audit. Returned so the Audits list page
   * can search by prompt text without an N+1 detail fetch per row.
   */
  prompts: string[];
  promptsCount: number;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  mentionsCount: number;
  /**
   * Persisted mention rate as a fraction in [0, 1]. null while
   * still queued/running, or when no calls succeeded. The 4-week
   * sparkline reads this directly per region.
   */
  mentionRate: number | null;
  totalExpected: number;
  received: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export async function GET(request: Request): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;

  try {
    await ensureGeoAuditsSchema();

    const res = await pool.query(
      `SELECT id, brand_id, regions, prompts, prompts_count, status, mentions_count,
              mention_rate, total_expected, received, error,
              created_at, started_at, completed_at
         FROM geo_audits
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [user.id],
    );

    const audits: GeoAuditListItem[] = (res.rows as Array<{
      id: string; brand_id: string; regions: string[];
      prompts: string[] | null; prompts_count: number;
      status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
      mentions_count: number;
      mention_rate: string | number | null;
      total_expected: number; received: number;
      error: string | null;
      created_at: Date | string; started_at: Date | string | null; completed_at: Date | string | null;
    }>).map((r) => ({
      id: r.id,
      brandId: r.brand_id,
      regions: r.regions,
      prompts: Array.isArray(r.prompts) ? r.prompts : [],
      promptsCount: r.prompts_count,
      status: r.status,
      mentionsCount: r.mentions_count,
      // mention_rate comes back as a numeric string from pg by default;
      // coerce to a number, preserve null so the sparkline can show
      // "no data yet" instead of a misleading 0.
      mentionRate: r.mention_rate == null ? null : Number(r.mention_rate),
      totalExpected: r.total_expected,
      received: r.received,
      error: r.error,
      createdAt: typeof r.created_at === 'string' ? r.created_at : r.created_at.toISOString(),
      startedAt: r.started_at == null ? null : (typeof r.started_at === 'string' ? r.started_at : r.started_at.toISOString()),
      completedAt: r.completed_at == null ? null : (typeof r.completed_at === 'string' ? r.completed_at : r.completed_at.toISOString()),
    }));

    return Response.json({ audits }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    // Without this catch, schema-bootstrap or DB errors propagate as
    // an empty-body 500 from Next.js (no JSON, no error message).
    // That's exactly the symptom that hid the brand_id UUID/TEXT FK
    // type-mismatch in production until users hit the route.
    logger.error('geo_audits.list_failed', {
      err: (e as Error).message,
      userId: user.id,
    });
    return Response.json(
      { error: 'Failed to load audits', message: (e as Error).message },
      { status: 500 },
    );
  }
}

interface PostBody {
  brandId?: unknown;
  regions?: unknown;
  prompts?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Shape validation
  const brandId = typeof body.brandId === 'string' ? body.brandId.trim() : '';
  if (!brandId) return Response.json({ error: 'brandId is required' }, { status: 400 });

  const rawRegions = Array.isArray(body.regions) ? body.regions : [];
  const regions = Array.from(
    new Set(rawRegions.filter((r): r is string => typeof r === 'string' && r.trim().length > 0).map((r) => r.trim())),
  );
  if (regions.length === 0) {
    return Response.json({ error: 'At least one region is required' }, { status: 400 });
  }
  if (regions.length > MAX_REGIONS_PER_AUDIT) {
    return Response.json({ error: `At most ${MAX_REGIONS_PER_AUDIT} regions per audit` }, { status: 400 });
  }

  const rawPrompts = Array.isArray(body.prompts) ? body.prompts : [];
  const prompts = rawPrompts
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .map((p) => p.trim());
  if (prompts.length === 0) {
    return Response.json({ error: 'At least one prompt is required' }, { status: 400 });
  }
  if (prompts.length > MAX_PROMPTS_PER_AUDIT) {
    return Response.json({ error: `At most ${MAX_PROMPTS_PER_AUDIT} prompts per audit` }, { status: 400 });
  }

  // Brand must belong to caller — silently 404 otherwise so we don't
  // leak existence of someone else's brand id.
  const brandCheck = await pool.query(
    `SELECT id FROM brands WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [brandId, user.id],
  );
  if (brandCheck.rows.length === 0) {
    return Response.json({ error: 'Brand not found' }, { status: 404 });
  }

  // Effective plan + plan-tier gate
  const planRow = await pool.query(
    `SELECT plan, trial_ends_at FROM users WHERE id = $1 LIMIT 1`,
    [user.id],
  );
  if (planRow.rows.length === 0) {
    return Response.json({ error: 'User not found' }, { status: 401 });
  }
  const effectivePlan = getEffectivePlan(planRow.rows[0].plan, planRow.rows[0].trial_ends_at);
  const limits = getPlanLimits(effectivePlan);
  if ((limits.geoAudits ?? 0) <= 0 && effectivePlan !== 'owner') {
    return Response.json(
      { error: 'Your plan does not include Regional Audits. Upgrade to unlock.' },
      { status: 403 },
    );
  }

  const totalExpected = regions.length * prompts.length * GEO_AUDIT_PLATFORMS.length;

  // Reserve credits up-front (mirrors brands/[id]/run flow). Owner
  // accounts skip the cap — reserveCredits returns ok=true for them.
  const reservation = await reserveAuditCredits(user.id, effectivePlan, totalExpected);
  if (!reservation.ok) {
    return Response.json(
      {
        error: 'Insufficient credits for this audit',
        code: reservation.code,
        message: reservation.message,
        remaining: reservation.remaining,
        monthlyCap: reservation.monthlyCap,
        required: totalExpected,
      },
      { status: 402 },
    );
  }

  // Insert + dispatch
  let auditId: string;
  try {
    const created = await createAuditRecord({
      userId: user.id,
      brandId,
      regions,
      prompts,
    });
    auditId = created.id;
  } catch (e) {
    // Rolling back the reservation so the user isn't billed for a
    // failed insert.
    try {
      const { refundCredits } = await import('@/lib/credits');
      await refundCredits(user.id, totalExpected, 'manual');
    } catch {
      // best-effort
    }
    logger.error('geo_audit.create_failed', { err: (e as Error).message });
    return Response.json({ error: 'Failed to create audit' }, { status: 500 });
  }

  // Kick the worker in the background. The request returns now; the
  // /api/cron/geo-audits-worker route is the safety net for any case
  // where after() doesn't fire (cold restart, deploy mid-flight).
  after(async () => {
    try {
      await processGeoAudit(auditId);
    } catch (e) {
      logger.error('geo_audit.dispatch_failed', { auditId, err: (e as Error).message });
    }
  });

  return Response.json(
    {
      id: auditId,
      status: 'queued',
      regions,
      promptsCount: prompts.length,
      totalExpected,
    },
    { status: 201 },
  );
}
