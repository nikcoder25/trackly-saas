/**
 * GET /api/brands/[id]/fixes/[fixId]
 *
 * Returns one fix plus its rendered preview block (computed from the
 * module's preview() so the dashboard stays module-agnostic).
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { getFix, getFixEvents, updateFix, logFixEvent } from '@/lib/fix-engine/schema';
import { getModule } from '@/lib/fix-engine/registry';
import { getAutomation } from '@/lib/fix-engine/automation';
import { applyBrandRules } from '@/lib/fix-engine/rules';
import type { PreviewBlock } from '@/lib/fix-engine/types';

export async function GET(
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

    const fix = await getFix(fixId, id);
    if (!fix) return Response.json({ error: 'Fix not found' }, { status: 404 });

    let preview: PreviewBlock | null = null;
    const mod = getModule(fix.moduleKey);
    if (mod && fix.generated) {
      try {
        preview = mod.preview(
          {
            key: fix.dedupeKey,
            targetUrl: fix.targetUrl,
            severity: fix.severity,
            summary: fix.summary,
            detected: fix.detected,
            before: fix.beforeSnapshot ?? undefined,
          },
          { generated: fix.generated },
        );
      } catch (e) {
        logger.warn('fix_engine.preview_failed', { fixId, err: (e as Error).message });
      }
    }

    const events = await getFixEvents(fixId);
    return Response.json({ fix, preview, events }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.error('fix_engine.detail_failed', { err: (e as Error).message });
    return Response.json({ error: 'Failed to load fix', message: (e as Error).message }, { status: 500 });
  }
}

interface PatchBody { note?: unknown; assignee?: unknown; generated?: unknown; archived?: unknown }

/**
 * PATCH — set the fix's note / assignee (collaboration metadata), archive or
 * unarchive a live fix (shipping never auto-archives — the fix stays in the
 * main list until the user moves it), or edit the generated draft's text
 * fields before approval (inline draft editing). Draft edits only merge
 * string values into keys that already exist on the draft, only while the
 * fix is awaiting review, and re-apply the brand's guardrail rules so a
 * manual edit can't bypass them.
 */
export async function PATCH(
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
    if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot edit fixes.' }, { status: 403 });
    const existing = await getFix(fixId, id);
    if (!existing) return Response.json({ error: 'Fix not found' }, { status: 404 });

    let body: PatchBody;
    try { body = (await request.json()) as PatchBody; } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
    const patch: { note?: string | null; assignee?: string | null; generated?: Record<string, unknown>; status?: 'generated'; archived?: boolean } = {};
    if (body.note !== undefined) patch.note = typeof body.note === 'string' ? body.note.slice(0, 2000) : null;
    if (body.assignee !== undefined) patch.assignee = typeof body.assignee === 'string' ? body.assignee.slice(0, 120) : null;

    if (body.archived !== undefined) {
      if (typeof body.archived !== 'boolean') return Response.json({ error: 'archived must be a boolean' }, { status: 400 });
      const isLive = existing.status === 'shipped' || existing.status === 'verified';
      if (body.archived && !isLive) {
        return Response.json({ error: 'Only a live (shipped or verified) fix can be archived.' }, { status: 400 });
      }
      if (!body.archived && !existing.archivedAt) {
        return Response.json({ error: 'This fix is not archived.' }, { status: 400 });
      }
      patch.archived = body.archived;
      await logFixEvent(fixId, id, user.id, body.archived ? 'fix.archived' : 'fix.unarchived', {});
    }

    if (body.generated !== undefined) {
      // Editable while a draft awaits review, or when revising an already-live
      // fix. A live edit is only allowed for overwrite-style modules (title/
      // meta — those with a revert()); re-shipping replaces the value cleanly,
      // whereas append modules would duplicate content.
      const wasLive = existing.status === 'shipped' || existing.status === 'verified';
      const mod = getModule(existing.moduleKey);
      const editable = ['generated', 'preview_ready', 'shipped', 'verified'].includes(existing.status);
      if (!existing.generated || !editable) {
        return Response.json({ error: 'Only a draft awaiting review, or a shipped title/meta fix, can be edited.' }, { status: 400 });
      }
      if (wasLive && typeof mod?.revert !== 'function') {
        return Response.json({ error: 'This fix type can’t be edited in place after shipping — Undo it first.' }, { status: 400 });
      }
      if (!body.generated || typeof body.generated !== 'object' || Array.isArray(body.generated)) {
        return Response.json({ error: 'generated must be an object of draft fields' }, { status: 400 });
      }
      const merged = { ...existing.generated };
      const edited: string[] = [];
      for (const [k, v] of Object.entries(body.generated as Record<string, unknown>)) {
        // Only string fields the draft already has — the module's shape is law.
        if (typeof v !== 'string' || typeof merged[k] !== 'string') continue;
        const val = v.slice(0, 20_000);
        if (val !== merged[k]) { merged[k] = val; edited.push(k); }
      }
      if (edited.length) {
        const auto = await getAutomation(id).catch(() => null);
        patch.generated = applyBrandRules(merged, auto?.rules).generated;
        // Editing a live fix re-opens it for review; the site keeps the shipped
        // copy until the edited draft is approved and re-shipped.
        if (wasLive) patch.status = 'generated';
        await logFixEvent(fixId, id, user.id, 'draft.edited', { fields: edited, reopenedFrom: wasLive ? existing.status : undefined });
      }
    }

    if (Object.keys(patch).length === 0) return Response.json({ error: 'Nothing to update' }, { status: 400 });

    await updateFix(fixId, patch);
    const fix = await getFix(fixId, id);
    return Response.json({ fix }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.error('fix_engine.patch_failed', { err: (e as Error).message });
    return Response.json({ error: 'Failed to update fix', message: (e as Error).message }, { status: 500 });
  }
}
