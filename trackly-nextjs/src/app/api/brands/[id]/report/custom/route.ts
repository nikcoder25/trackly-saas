import * as Sentry from '@sentry/nextjs';
import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { getEffectivePlan } from '@/lib/constants';
import { generateCustomReport } from '@/lib/pdf-custom-report';
import { ensureReportSchema, getReport, draftToSelection, recordReport } from '@/lib/report-builder';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Pro+ feature: download the curated "Custom Report" PDF assembled from the
// brand's report draft (selected mentions + queries).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const rl = await checkUserIpRateLimit('report_pdf', user.id, getClientIp(request), {
    user: { max: 20, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  try {
    const planRow = await pool.query('SELECT plan, trial_ends_at FROM users WHERE id = $1', [user.id]);
    const effective = getEffectivePlan(planRow.rows[0]?.plan, planRow.rows[0]?.trial_ends_at);
    const allowed = new Set(['pro', 'agency', 'enterprise', 'owner']);
    if (!allowed.has(effective)) {
      return Response.json({
        error: 'PDF reports are available on the Pro plan and above. Upgrade to access this feature.',
        planLimit: true,
      }, { status: 403 });
    }

    const { id } = await params;
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    const brand = access.brand as Record<string, unknown> & { id: string; name?: string };

    await ensureReportSchema();
    const draft = await getReport(id);
    if (!draft.items.length) {
      return Response.json({ error: 'Your report is empty. Add mentions or queries first.' }, { status: 400 });
    }

    const doc = generateCustomReport(brand, draftToSelection(draft));
    const buffer: Buffer = await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const safeName = String(brand.name || 'report').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `${safeName}_Custom_Report_${dateStr}.pdf`;

    // History recording is best-effort - never block the actual download
    // on a transient DB error or schema glitch.
    try {
      const mentions = draft.items.filter(i => i.kind === 'mention').length;
      const queries = draft.items.filter(i => i.kind === 'query').length;
      await recordReport(id, user.id, 'custom', draft.title || `${brand.name || 'Brand'} - Custom Report`, filename, buffer, { mentions, queries });
    } catch (recErr) {
      console.error('[Custom Report] History record failed (non-fatal):', (recErr as Error).message);
      Sentry.captureException(recErr, { tags: { route: 'brands.report.custom', step: 'history-record' } });
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
    if (process.env.NODE_ENV === 'production') console.error('[Custom Report] Failed:', msg);
    else console.error('[Custom Report] Failed:', msg, (e as Error).stack);
    Sentry.captureException(e, { tags: { route: 'brands.report.custom' } });
    return Response.json({ error: 'Failed to generate the custom report' }, { status: 500 });
  }
}

// Download a PDF of exactly what the user is looking at on Prompts & answers
// (current run, current filters), without going through the report draft.
// Body: { title?: string, note?: string, mentions: Array<{ platform, query,
// tag, meta, answer, sources, date }> }. Same plan gate and rate limit as GET.
const MAX_EXPORT_ROWS = 500;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const rl = await checkUserIpRateLimit('report_pdf', user.id, getClientIp(request), {
    user: { max: 20, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('bad body');
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!Array.isArray(body.mentions) || body.mentions.length === 0) {
    return Response.json({ error: 'Nothing to export. Change the filters and try again.' }, { status: 400 });
  }
  if (body.mentions.length > MAX_EXPORT_ROWS) {
    return Response.json({ error: `Too many rows (max ${MAX_EXPORT_ROWS}). Narrow the filters and try again.` }, { status: 400 });
  }

  try {
    const planRow = await pool.query('SELECT plan, trial_ends_at FROM users WHERE id = $1', [user.id]);
    const effective = getEffectivePlan(planRow.rows[0]?.plan, planRow.rows[0]?.trial_ends_at);
    const allowed = new Set(['pro', 'agency', 'enterprise', 'owner']);
    if (!allowed.has(effective)) {
      return Response.json({
        error: 'PDF reports are available on the Pro plan and above. Upgrade to access this feature.',
        planLimit: true,
      }, { status: 403 });
    }

    const { id } = await params;
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    const brand = access.brand as Record<string, unknown> & { id: string; name?: string };

    const TAGS = new Set(['pos', 'neg', 'neu', 'warn']);
    const mentions = (body.mentions as unknown[]).map(raw => {
      const m = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const tag = str(m.tag, 8);
      return {
        platform: str(m.platform, 60),
        query: str(m.query, 400),
        tag: TAGS.has(tag) ? tag : 'neu',
        meta: str(m.meta, 200),
        answer: str(m.answer, 2000),
        sources: Array.isArray(m.sources) ? m.sources.slice(0, 6).map(x => str(x, 300)).filter(Boolean) : [],
        date: str(m.date, 40),
      };
    });
    const title = str(body.title, 120) || `${brand.name || 'Brand'} - Prompts & answers`;
    const note = str(body.note, 500) || undefined;

    const doc = generateCustomReport(brand, { title, note, mentions, queries: [] });
    const buffer: Buffer = await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const safeName = String(brand.name || 'report').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `${safeName}_Prompts_and_answers_${dateStr}.pdf`;

    try {
      await ensureReportSchema();
      await recordReport(id, user.id, 'custom', title, filename, buffer, { mentions: mentions.length, queries: 0 });
    } catch (recErr) {
      Sentry.captureException(recErr, { tags: { route: 'brands.report.custom.post', step: 'history-record' } });
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
    Sentry.captureException(e, { tags: { route: 'brands.report.custom.post' } });
    return Response.json({ error: 'Failed to generate the PDF' }, { status: 500 });
  }
}
