/**
 * GET /api/nap-audits/[id]/pdf — download a branded PDF of a saved NAP audit.
 */
import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { getNapAudit } from '@/lib/nap-audits';
import { generateNapAuditPdf } from '@/lib/nap-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  const rl = await checkUserIpRateLimit('nap_audit_pdf', auth.id, getClientIp(request), {
    user: { max: 30, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  try {
    const audit = await getNapAudit(auth.id, id);
    if (!audit) return Response.json({ error: 'Audit not found' }, { status: 404 });

    const doc = generateNapAuditPdf(audit);
    const buffer: Buffer = await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const safe = audit.label.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_').slice(0, 60) || 'nap-audit';
    const filename = `${safe}_NAP_Audit_${new Date().toISOString().slice(0, 10)}.pdf`;
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    logger.error('nap_audits.pdf_failed', { err: (e as Error).message, id });
    return Response.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
