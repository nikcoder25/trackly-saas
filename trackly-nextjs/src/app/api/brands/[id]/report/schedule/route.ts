import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { getEffectivePlan } from '@/lib/constants';
import { ensureReportSchema, getSchedule, setSchedule, type ReportFrequency } from '@/lib/report-builder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function authBrand(request: Request, id: string) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return { resp: authResult } as const;
  const access = await getBrandWithAccess(id, authResult.id);
  if (!access) return { resp: Response.json({ error: 'Brand not found' }, { status: 404 }) } as const;
  return { user: authResult, access } as const;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await authBrand(request, id);
  if ('resp' in a) return a.resp;
  await ensureReportSchema();
  return Response.json(await getSchedule(id));
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await authBrand(request, id);
  if ('resp' in a) return a.resp;
  if (a.access.role === 'viewer') return Response.json({ error: 'Viewers cannot change report settings' }, { status: 403 });

  let body: { frequency?: string };
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid body' }, { status: 400 }); }
  const frequency = body.frequency as ReportFrequency;
  if (!['off', 'weekly', 'monthly'].includes(frequency)) return Response.json({ error: 'Invalid frequency' }, { status: 400 });

  // Enabling a schedule is a Pro+ feature (matches the manual PDF download).
  if (frequency !== 'off') {
    const planRow = await pool.query('SELECT plan, trial_ends_at FROM users WHERE id = $1', [a.user.id]);
    const effective = getEffectivePlan(planRow.rows[0]?.plan, planRow.rows[0]?.trial_ends_at);
    if (!new Set(['pro', 'agency', 'enterprise', 'owner']).has(effective)) {
      return Response.json({ error: 'Automatic reports are available on the Pro plan and above. Upgrade to enable scheduling.', planLimit: true }, { status: 403 });
    }
  }

  await ensureReportSchema();
  await setSchedule(id, frequency);
  return Response.json({ ok: true, ...(await getSchedule(id)) });
}
