import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import {
  ensureReportSchema, getReport, addReportItem, removeReportItem, clearReport, updateDraftMeta,
  type ReportItemKind,
} from '@/lib/report-builder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function authBrand(request: Request, id: string) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return { resp: authResult } as const;
  const user = authResult;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return { resp: Response.json({ error: 'Brand not found' }, { status: 404 }) } as const;
  return { user, access } as const;
}

// List the current report draft (title/note + items).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await authBrand(request, id);
  if ('resp' in a) return a.resp;
  await ensureReportSchema();
  return Response.json(await getReport(id));
}

// Add an item: { kind: 'mention' | 'query', payload: {...} }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await authBrand(request, id);
  if ('resp' in a) return a.resp;
  if (a.access.role === 'viewer') return Response.json({ error: 'Viewers cannot edit reports' }, { status: 403 });

  let body: { kind?: string; payload?: Record<string, unknown> };
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid body' }, { status: 400 }); }
  const kind = body.kind as ReportItemKind;
  if (kind !== 'mention' && kind !== 'query') return Response.json({ error: 'Invalid kind' }, { status: 400 });
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};

  await ensureReportSchema();
  const item = await addReportItem(id, a.user.id, kind, payload);
  if (!item) return Response.json({ duplicate: true });
  return Response.json({ item });
}

// Update draft meta: { title?, note? }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await authBrand(request, id);
  if ('resp' in a) return a.resp;
  if (a.access.role === 'viewer') return Response.json({ error: 'Viewers cannot edit reports' }, { status: 403 });

  let body: { title?: string; note?: string };
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid body' }, { status: 400 }); }
  await ensureReportSchema();
  await updateDraftMeta(id, body.title, body.note);
  return Response.json({ ok: true });
}

// Remove an item (?itemId=...) or clear the whole draft (?clear=1)
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await authBrand(request, id);
  if ('resp' in a) return a.resp;
  if (a.access.role === 'viewer') return Response.json({ error: 'Viewers cannot edit reports' }, { status: 403 });

  await ensureReportSchema();
  const url = new URL(request.url);
  if (url.searchParams.get('clear') === '1') { await clearReport(id); return Response.json({ ok: true }); }
  const itemId = url.searchParams.get('itemId');
  if (!itemId) return Response.json({ error: 'itemId required' }, { status: 400 });
  await removeReportItem(id, itemId);
  return Response.json({ ok: true });
}
