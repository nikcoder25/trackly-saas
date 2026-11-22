import * as Sentry from '@sentry/nextjs';
import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { getEffectivePlan } from '@/lib/constants';
import { generateReport, reportFilename } from '@/lib/pdf-report';
import { ensureReportSchema, recordReport } from '@/lib/report-builder';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Chrome cold start + render takes a few seconds.
export const maxDuration = 60;

// Pro+ feature: download the AI Visibility PDF report for a brand.
// Ported from the Express handler at routes/brands.js:2254.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  // PDF generation buffers to memory; 20/hr is generous for legitimate
  // download-and-retry while bounding memory spend under abuse.
  const rl = await checkUserIpRateLimit('report_pdf', user.id, getClientIp(request), {
    user: { max: 20, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  try {
    // Plan gate - Pro and above only. Use the effective plan so trial users
    // on a trial-into-Pro arrangement still get the feature during the trial.
    const planRow = await pool.query('SELECT plan, trial_ends_at FROM users WHERE id = $1', [user.id]);
    const rawPlan = planRow.rows[0]?.plan;
    const trialEndsAt = planRow.rows[0]?.trial_ends_at;
    const effective = getEffectivePlan(rawPlan, trialEndsAt);
    const allowed = new Set(['pro', 'agency', 'enterprise', 'owner']);
    if (!allowed.has(effective)) {
      return Response.json({
        error: 'PDF reports are available on Pro plan and above. Upgrade to access this feature.',
        planLimit: true,
      }, { status: 403 });
    }

    const { id } = await params;
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

    const brand = access.brand as Record<string, unknown> & {
      id: string; name?: string;
    };

    // Open fix-list items fill the plan page when the scan data gives fewer
    // than five steps. Best-effort: the report renders without them.
    let recommendations: { title: string; description: string | null }[] = [];
    try {
      const recs = await pool.query(
        `SELECT title, description FROM recommendations
          WHERE brand_id = $1 AND status = 'open'
          ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC
          LIMIT 10`,
        [id],
      );
      recommendations = recs.rows;
    } catch { /* table may not exist yet on a fresh install */ }

    // HTML template rendered to PDF by headless Chrome (see lib/pdf-report.ts).
    const buffer = await generateReport(brand, { recommendations });

    const filename = reportFilename(brand.name);

    // Record in history (best-effort) so it's re-downloadable from /dashboard/reports.
    // Must never block the download: a schema migration glitch or transient DB
    // error here used to surface as a confusing "Could not generate the report"
    // toast for the user even though the PDF rendered fine.
    try {
      const brandRec = brand as Record<string, unknown>;
      const runs = (Array.isArray(brandRec.runs) ? brandRec.runs : []) as { sov?: number }[];
      const lastSov = runs.length ? Math.round(runs[runs.length - 1].sov || 0) : 0;
      await ensureReportSchema();
      await recordReport(id, user.id, 'standard', `${brand.name || 'Brand'} - AI Visibility Report`, filename, buffer, { sov: lastSov });
    } catch (recErr) {
      console.error('[PDF Report] History record failed (non-fatal):', (recErr as Error).message);
      Sentry.captureException(recErr, { tags: { route: 'brands.report.pdf', step: 'history-record' } });
    }

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'no-store, private',
      },
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (process.env.NODE_ENV === 'production') {
      console.error('[PDF Report] Failed:', msg);
    } else {
      console.error('[PDF Report] Failed:', msg, (e as Error).stack);
    }
    Sentry.captureException(e, { tags: { route: 'brands.report.pdf' } });
    return Response.json({ error: 'Failed to generate PDF report' }, { status: 500 });
  }
}
