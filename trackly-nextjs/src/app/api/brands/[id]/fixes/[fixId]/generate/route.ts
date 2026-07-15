/**
 * POST /api/brands/[id]/fixes/[fixId]/generate
 *
 * Runs the module's generate() for a detected (or failed/regenerate)
 * fix. Reserves credits up front (refunded on failure). Returns the
 * updated fix so the UI can render the preview immediately.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { generateFix } from '@/lib/fix-engine/engine';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; fixId: string }> },
): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  try {
    const { id, fixId } = await params;
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot generate fixes.' }, { status: 403 });

    // Optional reviewer guidance for a steered regenerate. A missing/invalid
    // body just means a plain (re)generate — never an error.
    let instruction: string | undefined;
    try {
      const body = (await request.json()) as { instruction?: unknown };
      if (typeof body?.instruction === 'string') instruction = body.instruction;
    } catch { /* no JSON body — plain regenerate */ }

    const fix = await generateFix(fixId, id, instruction);
    return Response.json({ fix }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const err = e as Error & { paymentRequired?: boolean };
    const status = err.paymentRequired ? 402 : 400;
    logger.warn('fix_engine.generate_route_failed', { err: err.message });
    return Response.json({ error: err.message }, { status });
  }
}
