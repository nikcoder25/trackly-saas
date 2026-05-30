import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { ensureReportSchema, getHistoryPdf } from '@/lib/report-builder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Re-download a previously generated report by its history id.
export async function GET(request: Request, { params }: { params: Promise<{ id: string; hid: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const { id, hid } = await params;
  const access = await getBrandWithAccess(id, authResult.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

  await ensureReportSchema();
  const row = await getHistoryPdf(id, hid);
  if (!row) return Response.json({ error: 'Report not found' }, { status: 404 });

  return new Response(new Uint8Array(row.pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${row.filename}"`,
      'Content-Length': String(row.pdf.length),
      'Cache-Control': 'no-store, private',
    },
  });
}
