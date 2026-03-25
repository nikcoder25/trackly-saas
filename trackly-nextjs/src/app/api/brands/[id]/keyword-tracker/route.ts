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
    const result = await pool.query(
      `SELECT prompt, platform, total_runs, mention_count, mention_rate, avg_rank,
              avg_sentiment_score, last_run_at
       FROM prompt_run_stats
       WHERE brand_id = $1
       ORDER BY mention_rate DESC, total_runs DESC`,
      [id]
    );
    return Response.json({ keywords: result.rows });
  } catch (e) {
    console.error('[KeywordTracker]', (e as Error).message);
    return Response.json({ error: 'Failed to load keyword data' }, { status: 500 });
  }
}
