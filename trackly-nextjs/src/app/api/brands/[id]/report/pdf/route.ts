import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { getEffectivePlan } from '@/lib/constants';
import { isConfigured as isDataForSEOConfigured } from '@/lib/dataforseo';
import { generateReport } from '@/lib/pdf-report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Pro+ feature: download the AI Visibility PDF report for a brand.
// Ported from the Express handler at routes/brands.js:2254.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

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

    // Enrich with AI Overview results if DataForSEO is configured.
    if (isDataForSEOConfigured()) {
      try {
        const overviewResult = await pool.query(
          'SELECT query, has_ai_overview, brand_mentioned FROM ai_overview_results WHERE brand_id = $1 ORDER BY checked_at DESC',
          [brand.id]
        );
        (brand as Record<string, unknown>).aiOverviews = overviewResult.rows.map(r => ({
          query: r.query,
          hasOverview: r.has_ai_overview,
          brandMentioned: r.brand_mentioned,
        }));
      } catch {
        // Non-fatal - the report renders without the AI Overview block.
      }
    }

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
