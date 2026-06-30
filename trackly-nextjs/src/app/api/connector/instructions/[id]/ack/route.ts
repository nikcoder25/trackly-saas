/**
 * POST /api/connector/instructions/[id]/ack
 *
 * The Connector plugin acknowledges applying an instruction. On success
 * the fix is marked delivered (the pull endpoint stops returning it); the
 * next recheck confirms it's actually live. On failure the fix is moved
 * to 'failed' with the reported reason.
 *
 * Body: { ok: boolean, detail?: object, error?: string }
 */

import { NextResponse, after } from 'next/server';
import { rateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { getConnectorByToken } from '@/lib/fix-engine/connections';
import { getConnectorFix, markConnectorDelivered, recordConnectorAttempt, updateFix, logFixEvent } from '@/lib/fix-engine/schema';
import { CONNECTOR_MAX_ATTEMPTS } from '@/lib/fix-engine/connector';
import { recheckFix } from '@/lib/fix-engine/engine';
import { logger } from '@/lib/logger';

function bearer(request: Request): string {
  const h = request.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

interface AckBody { ok?: unknown; detail?: unknown; error?: unknown }

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const token = bearer(request);
  if (!token) return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 });

  const rl = await rateLimit(`connector:ack:${getClientIp(request)}`, 60_000, 120);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const conn = await getConnectorByToken(token);
  if (!conn) return NextResponse.json({ error: 'Invalid or revoked token' }, { status: 401 });

  const { id: fixId } = await params;
  // The fix must belong to the token's brand and be a Connector-delivered
  // item: a classic Channel-B fix, or a staged (ship-as-draft) page edit.
  const fix = await getConnectorFix(fixId, conn.brandId);
  if (!fix || (fix.channel !== 'B' && fix.status !== 'staged')) {
    return NextResponse.json({ error: 'Instruction not found' }, { status: 404 });
  }
  const op = String((fix.shipResult as Record<string, unknown> | null)?.op ?? 'write_file');

  let body: AckBody = {};
  try { body = (await request.json()) as AckBody; } catch { /* tolerate empty body */ }
  const ok = body.ok !== false; // default to success unless explicitly false
  const detail = (body.detail && typeof body.detail === 'object') ? (body.detail as Record<string, unknown>) : {};

  try {
    if (ok) {
      await markConnectorDelivered(fixId);

      // stage_content: the draft revision exists but is NOT live. Capture
      // the plugin-supplied preview URL and keep the fix 'staged' (the user
      // promotes it via publishStagedFix). No recheck — nothing is live yet.
      if (op === 'stage_content') {
        const previewUrl = typeof detail.previewUrl === 'string' ? detail.previewUrl
          : typeof detail.preview_url === 'string' ? detail.preview_url : null;
        await updateFix(fixId, { previewUrl, error: null });
        await logFixEvent(fixId, conn.brandId, conn.userId, 'connector.staged', { previewUrl });
        return NextResponse.json({ ok: true, staged: true }, { headers: { 'Cache-Control': 'no-store' } });
      }

      // publish_content: the staged draft was promoted to live → ship it.
      if (op === 'publish_content') {
        await updateFix(fixId, { status: 'shipped', error: null });
        await logFixEvent(fixId, conn.brandId, conn.userId, 'connector.published', { detail });
      } else {
        await logFixEvent(fixId, conn.brandId, conn.userId, 'connector.applied', { detail });
      }

      // Auto-verify: confirm the change is actually live (re-fetch the
      // file/page) without the user lifting a finger. Non-blocking so the
      // connector's ack returns immediately.
      after(async () => {
        try { await recheckFix(fixId, conn.brandId, null); }
        catch (e) { logger.warn('fix_engine.connector_autorecheck_failed', { fixId, err: (e as Error).message }); }
      });
      return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // Failure: re-deliver on the next pull until we hit the attempt cap,
    // then mark the fix failed so it stops looping and surfaces to the user.
    const err = typeof body.error === 'string' ? body.error : 'Connector reported failure';
    const attempts = await recordConnectorAttempt(fixId);
    if (attempts >= CONNECTOR_MAX_ATTEMPTS) {
      await updateFix(fixId, { status: 'failed', error: `${err} (after ${attempts} attempts)` });
      await logFixEvent(fixId, conn.brandId, conn.userId, 'connector.failed', { error: err, attempts });
      return NextResponse.json({ ok: true, retry: false }, { headers: { 'Cache-Control': 'no-store' } });
    }
    await logFixEvent(fixId, conn.brandId, conn.userId, 'connector.retry', { error: err, attempts });
    return NextResponse.json({ ok: true, retry: true, attempt: attempts }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.error('fix_engine.connector_ack_failed', { fixId, err: (e as Error).message });
    return NextResponse.json({ error: 'Failed to record ack' }, { status: 500 });
  }
}
