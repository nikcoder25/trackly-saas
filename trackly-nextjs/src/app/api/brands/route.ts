import { pool, ensureColumns } from '@/lib/db';
import { verifyRequestAuth, requireVerifiedAuth } from '@/lib/auth';
import { uid } from '@/lib/helpers';
import { getPlanLimits, getEffectivePlan } from '@/lib/constants';
import { countTrackedPromptsForOwner } from '@/lib/prompt-quota';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logError, serverError } from '@/lib/api-error';

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
          // Latest run: keep allResults with snippet, strip only raw/full response text
          runs[ri] = { ...run, allResults: (run.allResults as Record<string, unknown>[]).map(r => {
            const { raw, response, context, ...rest } = r;
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
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  try {
    const result = await pool.query('SELECT * FROM brands WHERE user_id = $1 ORDER BY created_at, id', [user.id]);
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
        ownerName: row.owner_name,
      };
    });

    // Query plan from database (not JWT) so upgrades are reflected immediately
    await ensureColumns();
    const planResult = await pool.query('SELECT plan, trial_ends_at FROM users WHERE id = $1', [user.id]);
    const plan = getEffectivePlan(planResult.rows[0]?.plan, planResult.rows[0]?.trial_ends_at);
    const limits = getPlanLimits(plan);
    const brandLimit = limits.brands;
    const overLimit = brands.length > brandLimit;

    // Mark excess brands (oldest brands stay active, newest are locked)
    const brandsWithStatus = brands.map((b: Record<string, unknown>, i: number) => ({
      ...b,
      lockedByPlan: overLimit && i >= brandLimit,
    }));

    return Response.json({ brands: brandsWithStatus, sharedBrands, plan, brandLimit, overLimit });
  } catch (e) {
    logError('brands.list_failed', e);
    return serverError({ message: 'Failed to load brands' });
  }
}

// POST /api/brands - Create brand
export async function POST(request: Request) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const { allowed, retryAfter } = await rateLimit(`brand_create:${user.id}`, 60 * 60 * 1000, 20);
  if (!allowed) return rateLimitResponse(retryAfter);

  const body = await request.json();
  const { name, industry, website, city, country, goal, competitors, queries, nearbyAreas } = body;

  if (!name) return Response.json({ error: 'Brand name required' }, { status: 400 });
  if (typeof name !== 'string' || name.length > 100) return Response.json({ error: 'Brand name must be 100 characters or less' }, { status: 400 });
  if (industry && (typeof industry !== 'string' || industry.length > 100)) return Response.json({ error: 'Industry must be 100 characters or less' }, { status: 400 });
  if (website && (typeof website !== 'string' || website.length > 500)) return Response.json({ error: 'Website URL too long' }, { status: 400 });
  if (country && (typeof country !== 'string' || country.length > 100)) return Response.json({ error: 'Country must be 100 characters or less' }, { status: 400 });

  try {
    await ensureColumns();
    const planResult = await pool.query('SELECT plan, trial_ends_at FROM users WHERE id = $1', [user.id]);
    const plan = getEffectivePlan(planResult.rows[0]?.plan, planResult.rows[0]?.trial_ends_at);
    const limits = getPlanLimits(plan);

    const safeComps = Array.isArray(competitors) ? competitors.filter((c: unknown) => typeof c === 'string').map((c: string) => c.trim()).filter(Boolean).slice(0, limits.competitors) : [];
    const safeNearby = Array.isArray(nearbyAreas) ? nearbyAreas.filter((a: unknown) => typeof a === 'string').map((a: string) => a.trim()).filter(Boolean).slice(0, 100) : [];

    const defaultQueries = city
      ? [`What is the best ${industry || 'service'} company in ${city}?`, `Who are the top ${industry || 'service'} providers in ${city}?`, `Best ${industry || 'service'} recommendations in ${city}`]
      : [`What is the best ${industry || 'service'} company?`, `Who are the top ${industry || 'service'} providers?`, `Best ${industry || 'service'} recommendations`];

    const safeQueries = Array.isArray(queries) && queries.length > 0
      ? queries.filter((q: unknown) => typeof q === 'string').map((q: string) => q.trim()).filter(Boolean).slice(0, 300)
      : defaultQueries;

    // Account-wide tracked-prompt cap (v3 spec). The new brand's
    // initial queries are added to the existing total across all the
    // owner's brands; reject if the sum would exceed the plan cap.
    // Belt-and-braces server-side check — the setup form clamps too,
    // but never trust client input.
    if (limits.trackedPromptsPerAccount < 9999) {
      const existingPromptCount = await countTrackedPromptsForOwner(user.id);
      if (existingPromptCount + safeQueries.length > limits.trackedPromptsPerAccount) {
        const remaining = Math.max(0, limits.trackedPromptsPerAccount - existingPromptCount);
        return Response.json({
          error: `Your ${plan} plan allows up to ${limits.trackedPromptsPerAccount} tracked prompts across all brands. You have ${existingPromptCount} configured and ${remaining} slot${remaining === 1 ? '' : 's'} left. Upgrade to add more.`,
          planLimit: true,
          trackedPromptsUsed: existingPromptCount,
          trackedPromptsLimit: limits.trackedPromptsPerAccount,
        }, { status: 403 });
      }
    }

    // Auto-generate aliases from brand name & website
    const autoAliases = new Set<string>();
    const trimmedName = (name as string).trim();
    const lowerName = trimmedName.toLowerCase();
    const nameWords = trimmedName.split(/\s+/);
    const lowerWords = lowerName.split(/\s+/);
    autoAliases.add(lowerName);
    if (nameWords.length > 1) {
      autoAliases.add(nameWords.join(''));
      autoAliases.add(lowerWords.join(''));
      autoAliases.add(lowerWords.join('-'));
    }
    // Possessive
    const mainWord = nameWords.length >= 2 ? nameWords.slice(0, -1).join(' ') : trimmedName;
    if (!mainWord.endsWith("'s") && !mainWord.endsWith("s'")) {
      autoAliases.add(mainWord + "'s");
    }
    // Website domain variations
    if (website) {
      const domain = (website as string).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      if (domain) {
        autoAliases.add(domain);
        autoAliases.add(domain.split('.')[0]);
        autoAliases.add('www.' + domain);
      }
    }
    const safeAliases = [...autoAliases].filter(a => a.length >= 2);

    const id = uid();
    const data = {
      name, industry: industry || '', website: website || '', city: city || '', country: country || '',
      goal: goal || 70,
      competitors: safeComps,
      nearbyAreas: safeNearby,
      aliases: safeAliases,
      queries: safeQueries,
      runs: [], mentions: [], queryStats: {}, sovHistory: [],
      citations: {}, notes: {}, schedule: 24,
    };

    // Atomic insert with plan limit check to prevent race conditions
    const insertResult = await pool.query(
      `INSERT INTO brands (id, user_id, data)
       SELECT $1, $2, $3::jsonb
       WHERE (SELECT COUNT(*) FROM brands WHERE user_id = $2) < $4
       RETURNING id`,
      [id, user.id, JSON.stringify(data), limits.brands]
    );
    if (insertResult.rows.length === 0) {
      return Response.json({ error: `Your ${plan} plan allows up to ${limits.brands} brand(s). Upgrade to add more.`, planLimit: true }, { status: 403 });
    }
    const brand = { id, userId: user.id, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    return Response.json({ brand });
  } catch (e) {
    logError('brands.create_failed', e);
    return serverError({ message: 'Failed to create brand' });
  }
}
