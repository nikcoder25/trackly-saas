import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const { id } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

  const result = await pool.query('SELECT id, brand_id, fact_key, fact_value, category, updated_at FROM brand_facts WHERE brand_id = $1 ORDER BY category, fact_key LIMIT 200', [id]);
  return Response.json({ facts: result.rows });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const { id } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
  if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot edit facts' }, { status: 403 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid request body' }, { status: 400 }); }
  const { facts } = body;
  if (!Array.isArray(facts)) return Response.json({ error: 'Facts must be an array' }, { status: 400 });

  try {
    for (const fact of facts) {
      if (!fact.fact_key || !fact.fact_value) continue;
      await pool.query(
        `INSERT INTO brand_facts (brand_id, fact_key, fact_value, category, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (brand_id, fact_key) DO UPDATE SET fact_value = $3, category = $4, updated_at = NOW()`,
        [id, fact.fact_key, fact.fact_value, fact.category || 'general']
      );
    }
    const result = await pool.query('SELECT id, brand_id, fact_key, fact_value, category, updated_at FROM brand_facts WHERE brand_id = $1 ORDER BY category, fact_key LIMIT 200', [id]);
    return Response.json({ facts: result.rows });
  } catch (e) {
    return Response.json({ error: 'Failed to update facts' }, { status: 500 });
  }
}
