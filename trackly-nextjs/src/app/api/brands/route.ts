import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { uid } from '@/lib/helpers';
import { getPlanLimits } from '@/lib/constants';

// Trim heavy fields from brand data for list responses
function trimBrandData(data: Record<string, unknown>) {
  const d = { ...data };

  // Keep only last 10 runs, aggressively strip heavy data
  if (Array.isArray(d.runs)) {
    const runs = (d.runs as Record<string, unknown>[]).slice(-10);
    for (let ri = 0; ri < runs.length; ri++) {
      const run = runs[ri];
      const isLatest = ri === runs.length - 1;
      // Remove mentions array from all runs (heavy)
      delete run.mentions;
      if (run.allResults) {
        if (!isLatest) {
          // Non-latest: remove allResults entirely, keep summary stats
          delete run.allResults;
        } else {
          // Latest run: keep allResults but strip text fields
          runs[ri] = { ...run, allResults: (run.allResults as Record<string, unknown>[]).map(r => {
            const { raw, response, context, snippet, ...rest } = r;
            return rest;
          })};
        }
      }
    }
    d.runs = runs;
  }

  // Keep only last 20 SOV history entries
  if (Array.isArray(d.sovHistory)) {
    d.sovHistory = (d.sovHistory as unknown[]).slice(-20);
  }

  // Strip raw from top-level mentions
  if (Array.isArray(d.mentions)) {
    for (const m of d.mentions as Record<string, unknown>[]) {
      if (m.raw) delete m.raw;
    }
  }
  return d;
}

// GET /api/brands - List all brands
export async function GET(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  try {
    const result = await pool.query('SELECT * FROM brands WHERE user_id = $1 ORDER BY created_at', [user.id]);
    const brands = result.rows.map((row: Record<string, unknown>) => {
      const data = trimBrandData({ ...((row.data as Record<string, unknown>) || {}) });
      return { id: row.id, userId: row.user_id, ...data, createdAt: row.created_at, updatedAt: row.updated_at };
    });

    // Team-shared brands
    const teamResult = await pool.query(
      `SELECT b.*, tm.role AS team_role, u.name AS owner_name, u.email AS owner_email
       FROM brands b
       JOIN team_members tm ON b.user_id = tm.owner_id
       JOIN users u ON u.id = tm.owner_id
       WHERE tm.member_id = $1
       ORDER BY b.created_at`,
      [user.id]
    );
    const sharedBrands = teamResult.rows.map((row: Record<string, unknown>) => {
      const data = trimBrandData({ ...((row.data as Record<string, unknown>) || {}) });
      return {
        id: row.id, userId: row.user_id, ...data,
        createdAt: row.created_at, updatedAt: row.updated_at,
        shared: true, teamRole: row.team_role,
        ownerName: row.owner_name, ownerEmail: row.owner_email,
      };
    });

    return Response.json({ brands, sharedBrands });
  } catch (e) {
    console.error('[Brands GET]', (e as Error).message);
    return Response.json({ error: 'Failed to load brands' }, { status: 500 });
  }
}

// POST /api/brands - Create brand
export async function POST(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  const body = await request.json();
  const { name, industry, website, city, goal, competitors, queries, nearbyAreas } = body;

  if (!name) return Response.json({ error: 'Brand name required' }, { status: 400 });
  if (typeof name !== 'string' || name.length > 100) return Response.json({ error: 'Brand name must be 100 characters or less' }, { status: 400 });
  if (industry && (typeof industry !== 'string' || industry.length > 100)) return Response.json({ error: 'Industry must be 100 characters or less' }, { status: 400 });
  if (website && (typeof website !== 'string' || website.length > 500)) return Response.json({ error: 'Website URL too long' }, { status: 400 });

  try {
    const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM brands WHERE user_id = $1', [user.id]);
    const planResult = await pool.query('SELECT plan FROM users WHERE id = $1', [user.id]);
    const plan = planResult.rows[0]?.plan || 'free';
    const limits = getPlanLimits(plan);
    const brandCount = parseInt(countResult.rows[0]?.count, 10) || 0;

    if (brandCount >= limits.brands) {
      return Response.json({ error: `Your ${plan} plan allows up to ${limits.brands} brand(s). Upgrade to add more.`, planLimit: true }, { status: 403 });
    }

    const safeComps = Array.isArray(competitors) ? competitors.filter((c: unknown) => typeof c === 'string').map((c: string) => c.trim()).filter(Boolean).slice(0, 100) : [];
    const safeNearby = Array.isArray(nearbyAreas) ? nearbyAreas.filter((a: unknown) => typeof a === 'string').map((a: string) => a.trim()).filter(Boolean).slice(0, 100) : [];

    const defaultQueries = city
      ? [`What is the best ${industry || 'service'} company in ${city}?`, `Who are the top ${industry || 'service'} providers in ${city}?`, `Best ${industry || 'service'} recommendations in ${city}`]
      : [`What is the best ${industry || 'service'} company?`, `Who are the top ${industry || 'service'} providers?`, `Best ${industry || 'service'} recommendations`];

    const safeQueries = Array.isArray(queries) && queries.length > 0
      ? queries.filter((q: unknown) => typeof q === 'string').map((q: string) => q.trim()).filter(Boolean).slice(0, 300)
      : defaultQueries;

    const id = uid();
    const data = {
      name, industry: industry || '', website: website || '', city: city || '',
      goal: goal || 70,
      competitors: safeComps,
      nearbyAreas: safeNearby,
      queries: safeQueries,
      runs: [], mentions: [], queryStats: {}, sovHistory: [],
      citations: {}, notes: {}, schedule: null,
    };

    await pool.query('INSERT INTO brands (id, user_id, data) VALUES ($1, $2, $3)', [id, user.id, JSON.stringify(data)]);
    const brand = { id, userId: user.id, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    return Response.json({ brand });
  } catch (e) {
    console.error('[Brand POST]', (e as Error).message);
    return Response.json({ error: 'Failed to create brand' }, { status: 500 });
  }
}
