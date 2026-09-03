import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { logError } from '@/lib/api-error';

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
      // The citations table has no is_brand column (see the CREATE TABLE in
      // src/lib/db.ts) - selecting one threw and this endpoint returned 500
      // for every brand, which broke the Citations and Competitors pages.
      // "Own domain" is derived from the brand's website instead.
      const result = await pool.query(
        `SELECT domain, COUNT(*)::int as total
         FROM citations WHERE brand_id = $1 AND domain IS NOT NULL
         GROUP BY domain
         ORDER BY total DESC LIMIT 100`, [id]
      );

      if (result.rows.length > 0) {
        const domains: Record<string, number> = {};
        let totalCitations = 0;
        let ownDomain = 0;
        let ownDomainName = '';
        const website = String((access.brand as { website?: string }).website || '');
        let brandHost = '';
        if (website) {
          try { brandHost = new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace(/^www\./, '').toLowerCase(); } catch {}
        }

        for (const row of result.rows) {
          const domain = String(row.domain).replace(/^www\./, '').toLowerCase();
          domains[domain] = (domains[domain] || 0) + row.total;
          totalCitations += row.total;
          if (brandHost && (domain === brandHost || domain.endsWith('.' + brandHost))) {
            ownDomain += row.total;
            if (!ownDomainName) ownDomainName = domain;
          }
        }

        return Response.json({ domains, totalCitations, ownDomain, ownDomainName });
      }
    }

    // Fallback: compute from brand runs stored in the brands table
    // brands has no runs/name/website columns - everything lives in the
    // `data` JSONB blob (see /api/brands). Read it once and unwrap.
    const brandResult = await pool.query(
      `SELECT data FROM brands WHERE id = $1`, [id]
    );
    const rawData = brandResult.rows[0]?.data;
    let brandData: { runs?: unknown; website?: string } = {};
    try {
      brandData = typeof rawData === 'string' ? JSON.parse(rawData) : (rawData || {});
    } catch { brandData = {}; }

    const runs = brandData.runs;
    const domains: Record<string, number> = {};
    let ownDomainName = '';

    if (Array.isArray(runs)) {
      // Try to detect own domain from brand data
      const website = brandData.website || '';
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
    logError('brands.citation_analysis_failed', e);
    return Response.json({ error: 'Failed to load citations' }, { status: 500 });
  }
}
