import { pool } from '@/lib/db';
import { verifyRequestAuth, requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { getPlanLimits } from '@/lib/constants';

// GET /api/brands/:id
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const { id } = await params;
  try {
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    return Response.json({ brand: access.brand });
  } catch {
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}

// PUT /api/brands/:id
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const { id } = await params;
  try {
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot edit brands.' }, { status: 403 });

    const brand = access.brand;
    const body = await request.json();

    // Plan limit checks — always check against the brand OWNER's plan and count
    const ownerId = brand.userId || user.id;
    const planResult = await pool.query('SELECT plan FROM users WHERE id = $1', [ownerId]);
    const plan = planResult.rows[0]?.plan || 'free';
    const limits = getPlanLimits(plan);

    // Check if this brand is beyond the owner's plan limit (soft-locked after downgrade)
    const countResult = await pool.query(
      `SELECT id FROM brands WHERE user_id = $1 ORDER BY created_at, id`,
      [ownerId]
    );
    const brandIds = countResult.rows.map((r: { id: string }) => r.id);
    const brandIndex = brandIds.indexOf(id);
    if (brandIndex >= limits.brands) {
      return Response.json({
        error: `This brand is locked because the ${plan} plan allows up to ${limits.brands} brand(s). Upgrade the plan or delete unused brands to edit.`,
        planLimit: true,
      }, { status: 403 });
    }

    const allowedFields = ['name', 'industry', 'website', 'description', 'queries', 'platforms', 'competitors', 'aliases', 'locations', 'schedule', 'city', 'goal', 'nearbyAreas', 'webhookUrl'];
    const safeBody: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (body[key] !== undefined) safeBody[key] = body[key];
    }

    if (safeBody.name !== undefined && !(safeBody.name as string).trim()) {
      return Response.json({ error: 'Brand name cannot be empty' }, { status: 400 });
    }

    // String field validation
    const strLimits: Record<string, number> = { name: 100, industry: 100, website: 500, description: 1000, city: 100, webhookUrl: 500 };
    for (const [field, maxLen] of Object.entries(strLimits)) {
      if (safeBody[field] && (typeof safeBody[field] !== 'string' || (safeBody[field] as string).length > maxLen)) {
        return Response.json({ error: `${field} must be ${maxLen} characters or less` }, { status: 400 });
      }
    }

    // Deduplicate queries
    if (safeBody.queries && Array.isArray(safeBody.queries)) {
      const seen = new Set<string>();
      safeBody.queries = (safeBody.queries as string[]).filter((q) => {
        const lower = q.toLowerCase().trim();
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
      });
    }

    // Total prompts check across all brands
    if (safeBody.queries) {
      const allBrandsResult = await pool.query(
        `SELECT COALESCE(SUM(jsonb_array_length(CASE WHEN data->'queries' IS NOT NULL THEN data->'queries' ELSE '[]'::jsonb END)), 0) as total
         FROM brands WHERE user_id = $1 AND id != $2`,
        [ownerId, id]
      );
      const otherBrandPrompts = parseInt(allBrandsResult.rows[0].total) || 0;
      const newTotal = otherBrandPrompts + (safeBody.queries as string[]).length;
      if (newTotal > limits.prompts) {
        return Response.json({ error: `Your ${plan} plan allows ${limits.prompts} total prompts. Upgrade for more.`, planLimit: true }, { status: 403 });
      }
    }

    if (safeBody.competitors && (safeBody.competitors as string[]).length > limits.competitors) {
      return Response.json({ error: limits.competitors === 0 ? 'Competitor tracking is available on Pro plans and above.' : `Your plan allows up to ${limits.competitors} competitors.`, planLimit: true }, { status: 403 });
    }

    const updated = { ...brand, ...safeBody, id: brand.id, userId: brand.userId };
    const { id: _id, userId: _uid, createdAt: _ca, updatedAt: _ua, ...dataOnly } = updated;
    await pool.query('UPDATE brands SET data = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(dataOnly), id]);
    return Response.json({ brand: updated });
  } catch (e) {
    console.error('[Brand PUT]', (e as Error).message);
    return Response.json({ error: 'Failed to update brand' }, { status: 500 });
  }
}

// DELETE /api/brands/:id
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const { id } = await params;
  try {
    const result = await pool.query('DELETE FROM brands WHERE id = $1 AND user_id = $2 RETURNING id', [id, user.id]);
    if (!result.rows.length) return Response.json({ error: 'Brand not found' }, { status: 404 });
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: 'Failed to delete brand' }, { status: 500 });
  }
}
