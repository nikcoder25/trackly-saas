import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';

async function handleToggleFixed(request: Request, params: { id: string; issueId: string }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const { id, issueId } = params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
  if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot modify issues' }, { status: 403 });

  try {
    // Toggle the fixed status
    const result = await pool.query(
      `UPDATE accuracy_issues
       SET fixed = NOT fixed, fixed_at = CASE WHEN fixed THEN NULL ELSE NOW() END
       WHERE id = $1 AND brand_id = $2
       RETURNING id, fixed, fixed_at`,
      [issueId, id]
    );

    if (result.rows.length === 0) {
      return Response.json({ error: 'Issue not found' }, { status: 404 });
    }

    return Response.json(result.rows[0]);
  } catch (e) {
    console.error('[Accuracy Issue Toggle]', (e as Error).message);
    return Response.json({ error: 'Failed to update issue' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; issueId: string }> }) {
  return handleToggleFixed(request, await params);
}

// POST fallback for environments where PATCH may be blocked by proxies
export async function POST(request: Request, { params }: { params: Promise<{ id: string; issueId: string }> }) {
  return handleToggleFixed(request, await params);
}
