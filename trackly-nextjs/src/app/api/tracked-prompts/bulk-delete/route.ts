import { pool, safeConnect } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { countTrackedPromptsForOwner } from '@/lib/prompt-quota';
import { badRequest, logError, serverError } from '@/lib/api-error';

interface BrandDeletion {
  brandId: string;
  queries: string[];
}

// POST /api/tracked-prompts/bulk-delete
//
// Removes one or more tracked prompts from one or more brands the
// caller owns. Used by /dashboard/prompts so users who downgraded (or
// otherwise overshot the account-wide cap) can trim prompts back into
// their plan limit in a single action.
//
// Body shape:
//   { deletes: [{ brandId: string, queries: string[] }, ...] }
//
// Removal is case-insensitive against the stored query strings so the
// client can send back exactly what was rendered without worrying
// about whitespace/case drift introduced elsewhere. All brand updates
// run inside a single transaction; if any brand fails, none are
// modified.
export async function POST(request: Request) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  let body: { deletes?: unknown };
  try {
    body = (await request.json()) as { deletes?: unknown };
  } catch {
    return badRequest('Invalid JSON body');
  }

  if (!Array.isArray(body.deletes) || body.deletes.length === 0) {
    return badRequest('deletes must be a non-empty array');
  }
  if (body.deletes.length > 200) {
    return badRequest('Too many brands in one request (max 200)');
  }

  // Normalise + validate. Collapse duplicate brandIds in the payload
  // by merging their queries so the per-brand UPDATE only runs once.
  const grouped = new Map<string, Set<string>>();
  for (const raw of body.deletes as unknown[]) {
    if (!raw || typeof raw !== 'object') return badRequest('Invalid delete entry');
    const entry = raw as Partial<BrandDeletion>;
    if (typeof entry.brandId !== 'string' || !entry.brandId) {
      return badRequest('Each delete must include brandId');
    }
    if (!Array.isArray(entry.queries)) {
      return badRequest('Each delete must include queries[]');
    }
    const set = grouped.get(entry.brandId) ?? new Set<string>();
    for (const q of entry.queries) {
      if (typeof q !== 'string') continue;
      const trimmed = q.trim();
      if (trimmed) set.add(trimmed.toLowerCase());
    }
    if (set.size > 0) grouped.set(entry.brandId, set);
  }

  if (grouped.size === 0) return badRequest('No queries to delete');

  const brandIds = Array.from(grouped.keys());

  try {
    const client = await safeConnect();
    let removedTotal = 0;
    try {
      await client.query('BEGIN');

      // Lock the rows we're editing so concurrent saves can't race us
      // into an inconsistent state. The user_id check is the access
      // control gate — anything not owned by the caller is silently
      // dropped (it simply won't be in the row set).
      const result = await client.query(
        `SELECT id, data FROM brands
           WHERE id = ANY($1::text[]) AND user_id = $2
           FOR UPDATE`,
        [brandIds, user.id],
      );

      const foundIds = new Set(result.rows.map((r: { id: string }) => r.id));
      const missing = brandIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        await client.query('ROLLBACK');
        return Response.json(
          { error: 'One or more brands not found or not owned by you', missing },
          { status: 404 },
        );
      }

      for (const row of result.rows as Array<{ id: string; data: Record<string, unknown> | null }>) {
        const targets = grouped.get(row.id);
        if (!targets) continue;

        const data = row.data || {};
        const existing = Array.isArray(data.queries) ? (data.queries as unknown[]) : [];
        const filtered = existing.filter((q) => {
          if (typeof q !== 'string') return true;
          return !targets.has(q.trim().toLowerCase());
        });
        const removed = existing.length - filtered.length;
        if (removed === 0) continue;
        removedTotal += removed;

        const nextData = { ...data, queries: filtered };
        await client.query(
          'UPDATE brands SET data = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
          [JSON.stringify(nextData), row.id, user.id],
        );
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }

    const remainingTotal = await countTrackedPromptsForOwner(user.id);
    return Response.json({
      success: true,
      removed: removedTotal,
      trackedPromptsRemaining: remainingTotal,
    });
  } catch (e) {
    logError('tracked_prompts.bulk_delete_failed', e, { user_id: user.id });
    return serverError({ message: 'Failed to delete tracked prompts' });
  }
}
