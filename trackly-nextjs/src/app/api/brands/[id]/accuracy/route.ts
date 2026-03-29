import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });
  const { id } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

  try {
    const facts = await pool.query('SELECT * FROM brand_facts WHERE brand_id = $1 ORDER BY category, fact_key', [id]);
    // Get recent prompt runs to check for hallucinations
    let runs = { rows: [] as Record<string, unknown>[] };
    try {
      runs = await pool.query(
        `SELECT id, prompt, platform, model, mentioned, sentiment, recommended, created_at
         FROM prompt_runs WHERE brand_id = $1 AND success = TRUE
         ORDER BY created_at DESC LIMIT 50`, [id]
      );
    } catch {
      // prompt_runs table may not have all columns — return empty
    }
    return Response.json({ facts: facts.rows, recentRuns: runs.rows });
  } catch (e) {
    console.error('[Accuracy]', (e as Error).message);
    return Response.json({ error: 'Failed to load accuracy data' }, { status: 500 });
  }
}
