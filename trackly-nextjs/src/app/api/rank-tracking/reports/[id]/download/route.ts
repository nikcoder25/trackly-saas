/**
 * GET /api/rank-tracking/reports/:id/download - build and download the report file.
 * Signed in as its owner, or with the signed ?exp=&sig= link a scheduled email carries.
 */
import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { ensureRankSchema } from '@/lib/rank-tracking/schema';
import { buildReport, verifyReportLink, type ReportRow } from '@/lib/rank-tracking/reports';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  await ensureRankSchema();
  const url = new URL(request.url);
  const signed = verifyReportLink(id, url.searchParams.get('exp'), url.searchParams.get('sig'));
  const user = signed ? null : verifyRequestAuth(request);
  if (!signed && !user) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const r = await pool.query<ReportRow>(`SELECT * FROM rt_reports WHERE id = $1`, [id]);
  const rep = r.rows[0];
  if (!rep || (!signed && rep.account_id !== user?.id)) return Response.json({ error: 'Report not found' }, { status: 404 });
  try {
    const f = await buildReport(rep);
    const inline = rep.format.startsWith('html') && url.searchParams.get('view') === '1';
    return new Response(typeof f.body === 'string' ? f.body : new Uint8Array(f.body), {
      headers: {
        'Content-Type': f.contentType,
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${f.filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    logger.error('rank.report_build_failed', { reportId: id, err: (e as Error).message });
    return Response.json({ error: 'Failed to build the report' }, { status: 500 });
  }
}
