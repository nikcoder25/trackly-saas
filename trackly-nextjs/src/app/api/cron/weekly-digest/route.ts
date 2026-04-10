/**
 * Cron endpoint for weekly digest emails.
 * Call via: external cron service every Monday at 8 AM UTC.
 * Secured by CRON_SECRET environment variable.
 *
 * Example: curl -H "Authorization: Bearer $CRON_SECRET" https://livesov.com/api/cron/weekly-digest
 */
import crypto from 'crypto';
import { pool } from '@/lib/db';
import { sendWeeklyDigestEmail, type DigestData } from '@/lib/email';

export const maxDuration = 300; // 5 minutes max

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token || token.length !== cronSecret.length ||
      !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(cronSecret))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Find all users with paid plans and at least one brand
    const usersResult = await pool.query(`
      SELECT DISTINCT u.id, u.email, u.plan
      FROM users u
      JOIN brands b ON b.user_id = u.id
      WHERE u.plan NOT IN ('free')
        AND u.email_verified = true
        AND (u.data->>'digestEnabled' IS NULL OR u.data->>'digestEnabled' != 'false')
    `);

    let sent = 0;
    let skipped = 0;

    for (const user of usersResult.rows) {
      try {
        // Get all brands for this user
        const brandsResult = await pool.query(
          'SELECT id, data FROM brands WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 5',
          [user.id]
        );

        for (const brandRow of brandsResult.rows) {
          const brand = typeof brandRow.data === 'string' ? JSON.parse(brandRow.data) : brandRow.data;
          if (!brand?.name) continue;

          // Get this week's prompt_runs
          const runsResult = await pool.query(
            `SELECT platform, mentioned, competitor_mentions
             FROM prompt_runs
             WHERE brand_id = $1 AND success = true
               AND created_at >= NOW() - INTERVAL '7 days'`,
            [brandRow.id]
          );

          if (runsResult.rows.length === 0) {
            skipped++;
            continue;
          }

          const rows = runsResult.rows;
          const totalQueries = rows.length;
          const brandMentions = rows.filter((r: { mentioned: boolean }) => r.mentioned).length;
          const currentSov = totalQueries > 0 ? Math.round((brandMentions / totalQueries) * 100) : 0;

          // Get last week's data for comparison
          const prevResult = await pool.query(
            `SELECT mentioned FROM prompt_runs
             WHERE brand_id = $1 AND success = true
               AND created_at >= NOW() - INTERVAL '14 days'
               AND created_at < NOW() - INTERVAL '7 days'`,
            [brandRow.id]
          );
          const prevTotal = prevResult.rows.length;
          const prevMentions = prevResult.rows.filter((r: { mentioned: boolean }) => r.mentioned).length;
          const previousSov = prevTotal > 0 ? Math.round((prevMentions / prevTotal) * 100) : null;

          // Platform breakdown
          const platStats: Record<string, { total: number; mentions: number }> = {};
          for (const row of rows) {
            const p = row.platform;
            if (!platStats[p]) platStats[p] = { total: 0, mentions: 0 };
            platStats[p].total++;
            if (row.mentioned) platStats[p].mentions++;
          }
          let topPlatform: string | null = null;
          let topPlatformSov = 0;
          for (const [plat, stats] of Object.entries(platStats)) {
            const sov = stats.total > 0 ? Math.round((stats.mentions / stats.total) * 100) : 0;
            if (sov > topPlatformSov) { topPlatform = plat; topPlatformSov = sov; }
          }

          // Competitor data
          const competitors: string[] = brand.competitors || [];
          const compCounts: Record<string, number> = {};
          for (const c of competitors) compCounts[c] = 0;
          for (const row of rows) {
            const mentions: string[] = Array.isArray(row.competitor_mentions) ? row.competitor_mentions
              : typeof row.competitor_mentions === 'string' ? JSON.parse(row.competitor_mentions) : [];
            for (const c of mentions) { if (compCounts[c] !== undefined) compCounts[c]++; }
          }

          // Count unique runs (by date)
          const runDates = new Set<string>();
          const runs = brand.runs || [];
          for (const run of runs) {
            const runDate = run.date || run.time?.split('T')[0];
            if (runDate) {
              const d = new Date(runDate);
              const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
              if (d >= weekAgo) runDates.add(runDate);
            }
          }

          const digest: DigestData = {
            brandName: brand.name,
            currentSov,
            previousSov,
            totalRuns: runDates.size || 1,
            brandMentions,
            totalQueries,
            topPlatform,
            topPlatformSov,
            competitorChanges: competitors.slice(0, 5).map(c => ({
              name: c,
              mentions: compCounts[c] || 0,
              change: 0, // TODO: compare with previous week
            })),
          };

          await sendWeeklyDigestEmail(user.email, digest);
          sent++;
        }
      } catch (e) {
        console.error(`[WeeklyDigest] Error for user ${user.id}:`, (e as Error).message);
        skipped++;
      }
    }

    return Response.json({
      sent,
      skipped,
      totalUsers: usersResult.rows.length,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[WeeklyDigest]', (e as Error).message);
    return Response.json({ error: 'Weekly digest failed' }, { status: 500 });
  }
}
