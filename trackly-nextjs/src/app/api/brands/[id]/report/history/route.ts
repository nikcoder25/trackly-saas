import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { ensureReportSchema, listHistory, deleteHistory } from '@/lib/report-builder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function authBrand(request: Request, id: string) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return { resp: authResult } as const;
  const access = await getBrandWithAccess(id, authResult.id);
  if (!access) return { resp: Response.json({ error: 'Brand not found' }, { status: 404 }) } as const;
  return { user: authResult, access } as const;
}

// List past generated reports for this brand (metadata only, no bytes).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await authBrand(request, id);
  if ('resp' in a) return a.resp;
  await ensureReportSchema();
  return Response.json({ history: await listHistory(id) });
}

// Delete a history entry (?id=...)
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await authBrand(request, id);
  if ('resp' in a) return a.resp;
  if (a.access.role === 'viewer') return Response.json({ error: 'Viewers cannot delete reports' }, { status: 403 });
  await ensureReportSchema();
  const hid = new URL(request.url).searchParams.get('id');
  if (!hid) return Response.json({ error: 'id required' }, { status: 400 });
  await deleteHistory(id, hid);
  return Response.json({ ok: true });
}
