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

  try {
    // Get per-prompt aggregated stats from prompt_run_stats
    const result = await pool.query(
      `SELECT prompt, platform, total_runs, mention_count, mention_rate, avg_rank,
              avg_sentiment_score, last_run_at
       FROM prompt_run_stats
       WHERE brand_id = $1
       ORDER BY mention_rate DESC, total_runs DESC`,
      [id]
    );

    // Get historical mention rates per prompt per batch (for sparkline/change)
    const historyResult = await pool.query(
      `SELECT prompt, batch_id,
              COUNT(*)::int AS total,
              SUM(CASE WHEN mentioned THEN 1 ELSE 0 END)::int AS mentions,
              MIN(created_at) AS run_date
       FROM prompt_runs
       WHERE brand_id = $1 AND success = true AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY prompt, batch_id
       ORDER BY prompt, MIN(created_at)`,
      [id]
    );

    // Build sparkline data per keyword
    const sparklineMap: Record<string, number[]> = {};
    for (const row of historyResult.rows) {
      const kw = row.prompt;
      if (!sparklineMap[kw]) sparklineMap[kw] = [];
      const rate = row.total > 0 ? Math.round((row.mentions / row.total) * 100) : 0;
      sparklineMap[kw].push(rate);
    }

    // Aggregate per-keyword rows (DB returns per-prompt-per-platform)
    const keywordMap: Record<string, {
      keyword: string;
      totalRuns: number;
      mentionCount: number;
      platformCount: number;
      platforms: Record<string, number>;
      posSum: number;
      posCount: number;
      lastUpdated: string;
    }> = {};

    for (const row of result.rows) {
      const kw = row.prompt;
      if (!keywordMap[kw]) {
        keywordMap[kw] = {
          keyword: kw,
          totalRuns: 0,
          mentionCount: 0,
          platformCount: 0,
          platforms: {},
          posSum: 0,
          posCount: 0,
          lastUpdated: '',
        };
      }
      const entry = keywordMap[kw];
      const runs = parseInt(row.total_runs, 10) || 0;
      const mentions = parseInt(row.mention_count, 10) || 0;
      entry.totalRuns += runs;
      entry.mentionCount += mentions;
      entry.platformCount++;
      entry.platforms[row.platform] = runs > 0 ? Math.round((mentions / runs) * 100) : 0;
      if (row.avg_rank != null) {
        entry.posSum += parseFloat(row.avg_rank);
        entry.posCount++;
      }
      const lastRun = row.last_run_at ? new Date(row.last_run_at).toISOString() : '';
      if (lastRun > entry.lastUpdated) entry.lastUpdated = lastRun;
    }

    const keywords = Object.values(keywordMap).map(entry => {
      const sparkline = sparklineMap[entry.keyword];
      // Compute change from last two runs
      let change: number | null = null;
      if (sparkline && sparkline.length >= 2) {
        change = sparkline[sparkline.length - 1] - sparkline[sparkline.length - 2];
      }

      return {
        keyword: entry.keyword,
        mentionRate: entry.totalRuns > 0 ? Math.round((entry.mentionCount / entry.totalRuns) * 100) : 0,
        change,
        totalRuns: entry.totalRuns,
        platformCount: entry.platformCount,
        avgPosition: entry.posCount > 0 ? Math.round(entry.posSum / entry.posCount) : null,
        lastUpdated: entry.lastUpdated,
        platforms: entry.platforms,
        sparkline: sparkline && sparkline.length > 1 ? sparkline.slice(-7) : undefined,
      };
    });

    // Sort by mention rate descending
    keywords.sort((a, b) => b.mentionRate - a.mentionRate);

    return Response.json({ keywords });
  } catch (e) {
    console.error('[KeywordTracker]', (e as Error).message);
    return Response.json({ error: 'Failed to load keyword data' }, { status: 500 });
  }
}
