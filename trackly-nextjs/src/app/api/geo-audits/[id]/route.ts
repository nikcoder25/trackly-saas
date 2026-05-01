/**
 * /api/geo-audits/[id] — single-audit detail (header + per-call results).
 *
 * GET   /api/geo-audits/:id           → header + joined per-(region×prompt×platform) rows
 * POST  /api/geo-audits/:id/cancel    → optional: cancel a queued audit
 *
 * Cancel is implemented in this same file via an extra `?action=cancel`
 * query param on POST so the [id] sub-tree stays a single route file.
 * (Matches the repo's preference for thin route trees — see
 * brands/[id]/run-status/[runId] for a parallel pattern.)
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { ensureGeoAuditsSchema } from '@/lib/geo-audits';
import { refundCredits } from '@/lib/credits';
import { logger } from '@/lib/logger';

interface AuditRowRaw {
  id: string;
  user_id: string;
  brand_id: string;
  regions: string[];
  prompts: string[];
  prompts_count: number;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  mentions_count: number;
  total_expected: number;
  received: number;
  error: string | null;
  created_at: Date | string;
  started_at: Date | string | null;
  completed_at: Date | string | null;
}

interface ResultRowRaw {
  id: string;
  region: string;
  prompt_text: string;
  platform: string;
  model: string | null;
  response: string | null;
  mentioned: boolean;
  error: string | null;
  created_at: Date | string;
}

function isoOrNull(v: Date | string | null): string | null {
  if (v == null) return null;
  return typeof v === 'string' ? v : v.toISOString();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;

  const { id } = await params;
  if (!id) return Response.json({ error: 'Missing audit id' }, { status: 400 });

  await ensureGeoAuditsSchema();

  const auditRes = await pool.query(
    `SELECT id, user_id, brand_id, regions, prompts, prompts_count, status,
            mentions_count, total_expected, received, error,
            created_at, started_at, completed_at
       FROM geo_audits WHERE id = $1 LIMIT 1`,
    [id],
  );
  const audit = auditRes.rows[0] as AuditRowRaw | undefined;
  if (!audit) return Response.json({ error: 'Audit not found' }, { status: 404 });
  if (audit.user_id !== user.id) {
    // Don't leak existence of someone else's audit id.
    return Response.json({ error: 'Audit not found' }, { status: 404 });
  }

  const resultsRes = await pool.query(
    `SELECT id, region, prompt_text, platform, model, response, mentioned, error, created_at
       FROM geo_audit_results
      WHERE audit_id = $1
      ORDER BY created_at ASC`,
    [id],
  );

  return Response.json({
    audit: {
      id: audit.id,
      brandId: audit.brand_id,
      regions: audit.regions,
      prompts: audit.prompts,
      promptsCount: audit.prompts_count,
      status: audit.status,
      mentionsCount: audit.mentions_count,
      totalExpected: audit.total_expected,
      received: audit.received,
      error: audit.error,
      createdAt: isoOrNull(audit.created_at),
      startedAt: isoOrNull(audit.started_at),
      completedAt: isoOrNull(audit.completed_at),
    },
    results: (resultsRes.rows as ResultRowRaw[]).map((r) => ({
      id: r.id,
      region: r.region,
      promptText: r.prompt_text,
      platform: r.platform,
      model: r.model,
      response: r.response,
      mentioned: r.mentioned,
      error: r.error,
      createdAt: isoOrNull(r.created_at),
    })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;

  const url = new URL(request.url);
  const action = url.searchParams.get('action') || '';
  if (action !== 'cancel') {
    return Response.json({ error: 'Unsupported action' }, { status: 400 });
  }

  const { id } = await params;
  if (!id) return Response.json({ error: 'Missing audit id' }, { status: 400 });

  await ensureGeoAuditsSchema();

  // Only owner can cancel; only queued audits are cancellable. A
  // 'running' audit is in the middle of provider calls — letting it
  // complete (or be reaped by the watchdog) is safer than racing the
  // worker.
  const res = await pool.query(
    `UPDATE geo_audits
        SET status = 'cancelled',
            completed_at = NOW(),
            error = COALESCE(error, 'Cancelled by user')
      WHERE id = $1 AND user_id = $2 AND status = 'queued'
      RETURNING total_expected`,
    [id, user.id],
  );
  if (res.rowCount === 0) {
    return Response.json(
      { error: 'Audit not found or not cancellable (already running or terminal).' },
      { status: 409 },
    );
  }
  // Refund the entire reservation since no provider calls have run.
  const totalExpected = Number((res.rows[0] as { total_expected?: number } | undefined)?.total_expected) || 0;
  if (totalExpected > 0) {
    try {
      await refundCredits(user.id, totalExpected, 'manual');
    } catch (e) {
      logger.error('geo_audit.cancel_refund_failed', { auditId: id, err: (e as Error).message });
    }
  }

  return Response.json({ ok: true, id, status: 'cancelled' });
}
