/**
 * GET /api/brands/[id]/fixes/report
 *
 * A client-ready PDF of the brand's Fix Engine status: summary counts +
 * a table of fixes (module, severity, status, page). Uses pdfkit's
 * built-in Helvetica (no font files needed).
 */

import PDFDocument from 'pdfkit';
import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { listFixes } from '@/lib/fix-engine/schema';
import { getModule } from '@/lib/fix-engine/registry';

function bucket(status: string): string {
  if (status === 'detected' || status === 'generating') return 'detected';
  if (status === 'generated' || status === 'preview_ready') return 'review';
  if (status === 'approved' || status === 'shipping') return 'approved';
  if (status === 'shipped' || status === 'verified') return 'live';
  if (status === 'failed' || status === 'reverted') return 'attention';
  return 'detected';
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  try {
    const { id } = await params;
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

    const fixes = await listFixes(id);
    const name = (access.brand.name as string | undefined) || 'Brand';
    const counts: Record<string, number> = {};
    for (const f of fixes) counts[bucket(f.status)] = (counts[bucket(f.status)] || 0) + 1;

    const buf = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 44, info: { Title: `${name} — Fix Engine Report` } });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const M = 44; const W = doc.page.width;
      doc.font('Helvetica-Bold').fontSize(22).fillColor('#111').text('Fix Engine Report');
      doc.font('Helvetica').fontSize(12).fillColor('#555').text(name);
      doc.fontSize(9).fillColor('#888').text(new Date().toUTCString());
      doc.moveDown(1);

      // Summary row
      const cards = [
        ['Detected', counts.detected || 0], ['In review', counts.review || 0],
        ['Approved', counts.approved || 0], ['Live', counts.live || 0], ['Attention', counts.attention || 0],
      ] as const;
      const cw = (W - M * 2) / cards.length;
      const cy = doc.y;
      cards.forEach(([label, val], i) => {
        const x = M + i * cw;
        doc.font('Helvetica-Bold').fontSize(20).fillColor('#111').text(String(val), x, cy, { width: cw - 8 });
        doc.font('Helvetica').fontSize(8).fillColor('#888').text(String(label).toUpperCase(), x, cy + 26, { width: cw - 8 });
      });
      doc.moveDown(3);

      // Table header
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#888');
      const cols = { mod: M, sev: M + 200, st: M + 270, page: M + 350 };
      let y = doc.y + 6;
      doc.text('MODULE', cols.mod, y); doc.text('SEVERITY', cols.sev, y); doc.text('STATUS', cols.st, y); doc.text('PAGE', cols.page, y);
      y += 16;
      doc.moveTo(M, y).lineTo(W - M, y).strokeColor('#ddd').stroke();
      y += 6;

      doc.font('Helvetica').fontSize(9).fillColor('#222');
      for (const f of fixes) {
        if (y > doc.page.height - 60) { doc.addPage(); y = 60; }
        const title = getModule(f.moduleKey)?.title || f.moduleKey;
        const page = (f.targetUrl || '').replace(/^https?:\/\//, '');
        doc.fillColor('#222').text(title, cols.mod, y, { width: 190, ellipsis: true, lineBreak: false });
        doc.fillColor('#555').text(f.severity, cols.sev, y, { width: 64, lineBreak: false });
        doc.fillColor('#555').text(f.status, cols.st, y, { width: 74, lineBreak: false });
        doc.fillColor('#777').text(page, cols.page, y, { width: W - M - cols.page, ellipsis: true, lineBreak: false });
        y += 16;
      }
      if (fixes.length === 0) doc.fillColor('#888').text('No fixes yet — run a scan.', M, y);

      doc.end();
    });

    const slug = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="fix-engine-${slug}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    logger.error('fix_engine.report_failed', { err: (e as Error).message });
    return Response.json({ error: 'Failed to build report', message: (e as Error).message }, { status: 500 });
  }
}
