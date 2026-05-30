import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { getEffectivePlan } from '@/lib/constants';
import { generateReport } from '@/lib/pdf-report';
import { ensureReportSchema, recordReport } from '@/lib/report-builder';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    const doc = generateReport(brand);

    // Drain the PDFKit doc into a Buffer before responding. Next.js route
    // handlers can't pipe the Node stream directly into the Response, so
    // we materialise first. Typical reports are <1 MB - fine to buffer.
    const buffer: Buffer = await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      // generateReport() already called doc.end()
    });

    const safeName = String(brand.name || 'report').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `${safeName}_AI_Visibility_Report_${dateStr}.pdf`;

    // Record in history (best-effort) so it's re-downloadable from /dashboard/reports.
    const brandRec = brand as Record<string, unknown>;
    const runs = (Array.isArray(brandRec.runs) ? brandRec.runs : []) as { sov?: number }[];
    const lastSov = runs.length ? Math.round(runs[runs.length - 1].sov || 0) : 0;
    await ensureReportSchema();
    await recordReport(id, user.id, 'standard', `${brand.name || 'Brand'} — AI Visibility Report`, filename, buffer, { sov: lastSov });

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
    return Response.json({ error: 'Failed to generate PDF report' }, { status: 500 });
  }
}
