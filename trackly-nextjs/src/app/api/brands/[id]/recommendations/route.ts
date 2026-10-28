import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { getPlanLimits, getEffectivePlan } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { gatherAnalytics, generateRecommendations, trackedSet } from '@/lib/recommendations-engine';

const VALID_STATUSES = ['open', 'in_progress', 'done', 'ignored'] as const;
const VALID_SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
type RecStatus = typeof VALID_STATUSES[number];
type RecSeverity = typeof VALID_SEVERITIES[number];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let brandId: string | undefined;
  try {
    const authResult = await requireVerifiedAuth(request, pool);
    if (authResult instanceof Response) return authResult;
    const user = authResult;
    const { id } = await params;
    brandId = id;
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

    const ownerId = access.brand.userId || user.id;
    const planResult = await pool.query('SELECT plan, trial_ends_at FROM users WHERE id = $1', [ownerId]);
    const plan = getEffectivePlan(planResult.rows[0]?.plan || 'free', planResult.rows[0]?.trial_ends_at);
    const limits = getPlanLimits(plan);
    if (!limits.sentiment) {
      return Response.json({ error: 'Recommendations are available on Starter plans and above. Upgrade to access.', planLimit: true }, { status: 403 });
    }

    // Treat absent OR empty-string filter values as "no filter".
    // The page always builds the URL with a trailing '?' so empty
    // strings arrive on every load that has no filters set.
    const url = new URL(request.url);
    const rawStatus = url.searchParams.get('status')?.trim() || null;
    const rawSeverity = url.searchParams.get('severity')?.trim() || null;

    if (rawStatus && !(VALID_STATUSES as readonly string[]).includes(rawStatus)) {
      return Response.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 },
      );
    }
    if (rawSeverity && !(VALID_SEVERITIES as readonly string[]).includes(rawSeverity)) {
      return Response.json(
        { error: `Invalid severity. Must be one of: ${VALID_SEVERITIES.join(', ')}` },
        { status: 400 },
      );
    }
    const status = rawStatus as RecStatus | null;
    const severity = rawSeverity as RecSeverity | null;

    // `category` was previously listed here but the legacy schema does
    // not declare it and no INSERT in this codebase ever populates it.
    // Selecting it threw `column "category" does not exist`, which the
    // old bare catch swallowed into a 500.
    let query = `SELECT id, brand_id, prompt, type, title, description, severity, status, playbook_id, payload, created_at
                 FROM recommendations WHERE brand_id = $1`;
    const values: unknown[] = [id];
    let idx = 2;

    if (status) {
      query += ` AND status = $${idx}`;
      values.push(status);
      idx++;
    }
    if (severity) {
      query += ` AND severity = $${idx}`;
      values.push(severity);
      idx++;
    }

    query += ` ORDER BY
       CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       created_at DESC LIMIT 100`;

    const result = await pool.query(query, values);
    // Hide platform-gap rows for engines the brand doesn't track (e.g. an
    // old "Google AI Overviews" row from before the engine list changed).
    const trackedPlatforms = trackedSet((access.brand as { platforms?: unknown }).platforms);
    const recommendations = trackedPlatforms
      ? result.rows.filter((row: { type?: string; prompt?: string | null }) =>
          row.type !== 'platform_gap' || trackedPlatforms.has(String(row.prompt || '').toLowerCase()))
      : result.rows;
    return Response.json({ recommendations });
  } catch (err) {
    // Backstop: log the real error so future schema drifts (or any
    // other unexpected throw) are visible in Sentry/server logs
    // instead of silently surfacing as a generic 500.
    logger.error('GET /api/brands/[id]/recommendations failed', {
      brandId,
      err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
    });
    return Response.json({ error: 'Failed to load recommendations' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const { id } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
  if (access.role === 'viewer') {
    return Response.json({ error: 'Viewers cannot generate recommendations.' }, { status: 403 });
  }

  // Check plan allows sentiment/recommendations
  const ownerId = access.brand.userId || user.id;
  const planResult = await pool.query('SELECT plan, trial_ends_at FROM users WHERE id = $1', [ownerId]);
  const plan = getEffectivePlan(planResult.rows[0]?.plan || 'free', planResult.rows[0]?.trial_ends_at);
  const limits = getPlanLimits(plan);
  if (!limits.sentiment) {
    return Response.json({ error: 'Recommendations are available on Starter plans and above. Upgrade to access.', planLimit: true }, { status: 403 });
  }

  try {
    // Gather analytics data from prompt_runs for this brand
    const analytics = await gatherAnalytics(id, access.brand);

    // Generate recommendations based on rules
    const newRecs = await generateRecommendations(id, analytics);

    return Response.json({
      generated: newRecs.length,
      recommendations: newRecs,
    });
  } catch (err) {
    logger.error('POST /api/brands/[id]/recommendations failed', {
      brandId: id,
      err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
    });
    return Response.json({ error: 'Failed to generate recommendations' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const { id: brandId } = await params;
  const access = await getBrandWithAccess(brandId, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
  if (access.role === 'viewer') {
    return Response.json({ error: 'Viewers cannot update recommendations.' }, { status: 403 });
  }

  const body = await request.json();
  const { id: recId, status } = body;
  if (!recId || !status) return Response.json({ error: 'Missing id or status' }, { status: 400 });

  const validStatuses = ['open', 'in_progress', 'done', 'ignored'];
  if (!validStatuses.includes(status)) return Response.json({ error: 'Invalid status' }, { status: 400 });

  try {
    const result = await pool.query(
      'UPDATE recommendations SET status = $1, updated_at = NOW() WHERE id = $2 AND brand_id = $3 RETURNING id, status',
      [status, recId, brandId]
    );
    if (!result.rows.length) return Response.json({ error: 'Recommendation not found' }, { status: 404 });
    return Response.json({ success: true, recommendation: result.rows[0] });
  } catch (err) {
    logger.error('PUT /api/brands/[id]/recommendations failed', {
      brandId,
      recId,
      err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
    });
    return Response.json({ error: 'Failed to update recommendation' }, { status: 500 });
  }
}
