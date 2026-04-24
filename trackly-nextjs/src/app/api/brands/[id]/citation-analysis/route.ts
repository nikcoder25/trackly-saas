import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const rl = await checkUserIpRateLimit('citation_analysis', user.id, getClientIp(request), {
    user: { max: 60, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const { id } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

  try {
    // Try the citations table first
    const tableCheck = await pool.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'citations') AS exists`
    );

    if (tableCheck.rows[0]?.exists) {
      const result = await pool.query(
        `SELECT domain, is_brand, COUNT(*)::int as total
         FROM citations WHERE brand_id = $1
         GROUP BY domain, is_brand
         ORDER BY total DESC LIMIT 100`, [id]
      );

      if (result.rows.length > 0) {
        const domains: Record<string, number> = {};
        let totalCitations = 0;
        let ownDomain = 0;
        let ownDomainName = '';

        for (const row of result.rows) {
          domains[row.domain] = row.total;
          totalCitations += row.total;
          if (row.is_brand) {
            ownDomain += row.total;
            if (!ownDomainName) ownDomainName = row.domain;
          }
        }

        return Response.json({ domains, totalCitations, ownDomain, ownDomainName });
      }
    }

    // Fallback: compute from brand runs stored in the brands table
    const brandResult = await pool.query(
      `SELECT runs FROM brands WHERE id = $1`, [id]
    );

    const runs = brandResult.rows[0]?.runs;
    const domains: Record<string, number> = {};
    let ownDomainName = '';

    if (Array.isArray(runs)) {
      // Try to detect own domain from brand data
      const brandInfo = await pool.query(`SELECT name, website FROM brands WHERE id = $1`, [id]);
      const website = brandInfo.rows[0]?.website || '';
      if (website) {
        try { ownDomainName = new URL(website).hostname.replace(/^www\./, ''); } catch {}
      }

      for (const run of runs) {
        const results = run?.allResults || run?.results || [];
        for (const r of results) {
          const citations = r?.citations || [];
          for (const citation of citations) {
            try {
              const d = new URL(citation).hostname.replace(/^www\./, '');
              domains[d] = (domains[d] || 0) + 1;
            } catch {}
          }
        }
      }
    }

    const totalCitations = Object.values(domains).reduce((s, n) => s + n, 0);
    const ownDomain = ownDomainName ? (domains[ownDomainName] || 0) : 0;

    return Response.json({ domains, totalCitations, ownDomain, ownDomainName });
  } catch (e) {
    return Response.json({ error: 'Failed to load citations' }, { status: 500 });
  }
}
