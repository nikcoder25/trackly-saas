/**
 * Admin read model for signup attribution.
 *
 * Returns three things, in increasing detail:
 *   summary   - counts per attribution class (the self-report vs click-data gap)
 *   bySource  - counts per dropdown answer, with how many had click evidence
 *   recent    - the raw rows, joined to the user, for eyeballing
 *
 * Classification runs in JS rather than SQL because the referrer matching
 * lives in src/lib/attribution.ts and is shared with the signup form. Keeping
 * one implementation matters more here than pushing the work into Postgres:
 * the period query only selects four narrow columns, so the rows are cheap.
 */
import { pool } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { logError, serverError } from '@/lib/api-error';
import {
  classifyAttribution,
  hasClickEvidence,
  sourceLabel,
  isAiSource,
  type AttributionClass,
  type AttributionRow,
} from '@/lib/attribution';

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const url = new URL(request.url);
  const rawDays = parseInt(url.searchParams.get('days') || '30', 10);
  const days = Math.min(Math.max(isNaN(rawDays) ? 30 : rawDays, 1), 365);
  const rawLimit = parseInt(url.searchParams.get('limit') || '100', 10);
  const limit = Math.min(Math.max(isNaN(rawLimit) ? 100 : rawLimit, 1), 500);

  try {
    const [periodRes, recentRes, promoRes, totalRes] = await Promise.all([
      // Narrow projection - only what classifyAttribution reads.
      pool.query(
        `SELECT source, referrer_domain, utm_source, gclid
           FROM signup_attribution
          WHERE created_at >= NOW() - INTERVAL '1 day' * $1`,
        [days]
      ),
      pool.query(
        `SELECT a.user_id, u.email, u.plan,
                a.source, a.source_detail, a.signup_method,
                a.referrer, a.referrer_domain, a.landing_path,
                a.utm_source, a.utm_medium, a.utm_campaign,
                a.gclid, a.promo_code, a.created_at
           FROM signup_attribution a
           JOIN users u ON u.id = a.user_id
          WHERE a.created_at >= NOW() - INTERVAL '1 day' * $1
          ORDER BY a.created_at DESC
          LIMIT $2`,
        [days, limit]
      ),
      // Which signups cited the offer we publish to AI crawlers. This is the
      // only direct read on whether the agent-facing offer does anything.
      pool.query(
        `SELECT promo_code, COUNT(*)::int AS signups
           FROM signup_attribution
          WHERE created_at >= NOW() - INTERVAL '1 day' * $1
            AND promo_code IS NOT NULL
          GROUP BY promo_code
          ORDER BY signups DESC`,
        [days]
      ),
      // Signups in the same window that have NO attribution row at all -
      // accounts created before this feature shipped, or by paths that do
      // not collect it. Without this the percentages silently mislead.
      pool.query(
        `SELECT COUNT(*)::int AS total
           FROM users u
          WHERE u.created_at >= NOW() - INTERVAL '1 day' * $1
            AND NOT EXISTS (SELECT 1 FROM signup_attribution a WHERE a.user_id = u.id)`,
        [days]
      ),
    ]);

    const rows = periodRes.rows as AttributionRow[];

    const summary: Record<AttributionClass, number> = {
      ai_invisible: 0, ai_corroborated: 0, ai_conflicting: 0,
      tracked: 0, untracked: 0, unknown: 0,
    };
    const bySource = new Map<string, { source: string; label: string; ai: boolean; total: number; withClickData: number }>();

    for (const row of rows) {
      summary[classifyAttribution(row)]++;

      const key = row.source || 'unknown';
      let entry = bySource.get(key);
      if (!entry) {
        entry = { source: key, label: sourceLabel(key), ai: isAiSource(key), total: 0, withClickData: 0 };
        bySource.set(key, entry);
      }
      entry.total++;
      if (hasClickEvidence(row)) entry.withClickData++;
    }

    const aiTotal = summary.ai_invisible + summary.ai_corroborated + summary.ai_conflicting;

    return Response.json({
      period: days,
      answered: rows.length,
      unattributedSignups: totalRes.rows[0].total,
      summary,
      // The headline number: of everyone who named an AI assistant, what
      // share left no click trail whatsoever.
      aiTotal,
      aiInvisibleShare: aiTotal > 0 ? Math.round((summary.ai_invisible / aiTotal) * 100) : 0,
      bySource: [...bySource.values()].sort((a, b) => b.total - a.total),
      promoCodes: promoRes.rows,
      recent: recentRes.rows,
    });
  } catch (e) {
    logError('admin.attribution.failed', e);
    return serverError({ message: 'Failed to load attribution' });
  }
}
