import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';

/**
 * GET /api/brands/:id/competitor-stats
 * Returns competitor mention data aggregated from prompt_runs table
 * across all runs (last 30 days by default).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const { id } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

  const brand = access.brand;
  const competitors: string[] = brand.competitors || [];

  if (!competitors.length) {
    return Response.json({ competitors: [], platforms: {}, totalQueries: 0, brandMentions: 0 });
  }

  try {
    // Get all successful prompt_runs for this brand in last 30 days
    const result = await pool.query(
      `SELECT prompt, platform, mentioned, competitor_mentions, batch_id, created_at
       FROM prompt_runs
       WHERE brand_id = $1 AND success = true AND created_at >= NOW() - INTERVAL '30 days'
       ORDER BY created_at DESC`,
      [id]
    );

    const rows = result.rows;
    const totalQueries = rows.length;
    const brandMentions = rows.filter((r: { mentioned: boolean }) => r.mentioned).length;

    // Aggregate competitor mentions across all runs
    const competitorCounts: Record<string, number> = {};
    const platformCompCounts: Record<string, Record<string, number>> = {};
    const platformTotals: Record<string, number> = {};

    for (const comp of competitors) {
      competitorCounts[comp] = 0;
    }

    // Build case-insensitive lookup: lowercase name -> original name
    const compLookup = new Map<string, string>();
    for (const comp of competitors) {
      compLookup.set(comp.toLowerCase(), comp);
    }

    for (const row of rows) {
      const plat = row.platform;
      platformTotals[plat] = (platformTotals[plat] || 0) + 1;

      if (!platformCompCounts[plat]) {
        platformCompCounts[plat] = {};
        for (const comp of competitors) {
          platformCompCounts[plat][comp] = 0;
        }
      }

      let mentions: string[];
      try {
        mentions = typeof row.competitor_mentions === 'string'
          ? JSON.parse(row.competitor_mentions)
          : Array.isArray(row.competitor_mentions) ? row.competitor_mentions : [];
      } catch {
        mentions = [];
      }

      for (const rawComp of mentions) {
        // Case-insensitive match: resolve stored name -> canonical competitor name
        const canonical = compLookup.get(rawComp.toLowerCase()) ?? (competitorCounts[rawComp] !== undefined ? rawComp : null);
        if (canonical) {
          competitorCounts[canonical]++;
          if (platformCompCounts[plat]?.[canonical] !== undefined) {
            platformCompCounts[plat][canonical]++;
          }
        }
      }
    }

    // Build response
    const competitorStats = competitors.map(comp => ({
      name: comp,
      mentions: competitorCounts[comp] || 0,
      percentage: totalQueries > 0 ? Math.round(((competitorCounts[comp] || 0) / totalQueries) * 100) : 0,
    }));

    const platforms: Record<string, { total: number; competitors: Record<string, number> }> = {};
    for (const [plat, counts] of Object.entries(platformCompCounts)) {
      platforms[plat] = {
        total: platformTotals[plat] || 0,
        competitors: counts,
      };
    }

    return Response.json({
      competitors: competitorStats,
      platforms,
      totalQueries,
      brandMentions,
      brandPercentage: totalQueries > 0 ? Math.round((brandMentions / totalQueries) * 100) : 0,
      hasData: totalQueries > 0,
    });
  } catch (err) {
    console.error('[competitor-stats]', (err as Error).message);
    return Response.json({ error: 'Failed to fetch competitor stats' }, { status: 500 });
  }
}
