import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { runFactCheck, autoDiscoverFacts } from '@/lib/fact-checker';

interface FactRow {
  id: string;
  brand_id: string;
  fact_key: string;
  fact_value: string;
  category: string;
  updated_at: string;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const { id } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

  try {
    const factsResult = await pool.query('SELECT * FROM brand_facts WHERE brand_id = $1 ORDER BY category, fact_key', [id]);
    const facts = (factsResult.rows as FactRow[]).map(f => ({ key: f.fact_key, value: f.fact_value, category: f.category || 'general' }));

    // Get count of recent runs for display
    let runCount = 0;
    let lastChecked: string | null = null;
    try {
      const countResult = await pool.query(
        `SELECT COUNT(*)::int as count, MAX(created_at) as latest
         FROM prompt_runs WHERE brand_id = $1 AND success = TRUE AND response_raw IS NOT NULL`,
        [id]
      );
      runCount = countResult.rows[0]?.count || 0;
      lastChecked = countResult.rows[0]?.latest || null;
    } catch {
      // table may not exist
    }

    // Build basic trend from runs
    let trend: { date: string; rate: number }[] = [];
    try {
      const trendResult = await pool.query(
        `SELECT DATE(created_at) as date, COUNT(*)::int as total,
                SUM(CASE WHEN mentioned THEN 1 ELSE 0 END)::int as mentioned_count
         FROM prompt_runs WHERE brand_id = $1 AND success = TRUE
         GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 14`,
        [id]
      );
      trend = trendResult.rows.reverse().map((r: { date: string; total: number; mentioned_count: number }) => ({
        date: r.date,
        rate: r.total > 0 ? Math.round((r.mentioned_count / r.total) * 100) : 100,
      }));
    } catch {
      // fine if table missing
    }

    return Response.json({
      facts,
      issues: [],
      accuracyRate: null,
      platformStats: {},
      categoryStats: {},
      trend,
      lastChecked,
      runCount,
      aiPowered: true,
    });
  } catch (e) {
    console.error('[Accuracy]', (e as Error).message);
    return Response.json({ error: 'Failed to load accuracy data' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const { id } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
  if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot edit facts' }, { status: 403 });

  const { facts } = await request.json();
  if (!Array.isArray(facts)) return Response.json({ error: 'Facts must be an array' }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM brand_facts WHERE brand_id = $1', [id]);
    for (const fact of facts) {
      const key = fact.key || fact.fact_key;
      const value = fact.value || fact.fact_value;
      if (!key || !value) continue;
      await client.query(
        `INSERT INTO brand_facts (brand_id, fact_key, fact_value, category, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (brand_id, fact_key) DO UPDATE SET fact_value = $3, category = $4, updated_at = NOW()`,
        [id, key, value, fact.category || 'general']
      );
    }
    await client.query('COMMIT');
    return Response.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[Accuracy POST]', (e as Error).message);
    return Response.json({ error: 'Failed to save facts' }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const { id } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

  const body = await request.json();

  // ── Auto-Discover Facts ──────────────────────────────────────
  if (body.action === 'auto-discover') {
    try {
      // Get brand info (name, website)
      const brandResult = await pool.query('SELECT name, website FROM brands WHERE id = $1', [id]);
      if (brandResult.rows.length === 0) {
        return Response.json({ error: 'Brand not found' }, { status: 404 });
      }
      const brand = brandResult.rows[0] as { name: string; website: string | null };

      // Get recent AI responses about this brand
      let aiResponses: string[] = [];
      try {
        const runsResult = await pool.query(
          `SELECT response_raw FROM prompt_runs
           WHERE brand_id = $1 AND success = TRUE AND response_raw IS NOT NULL AND response_raw != ''
           ORDER BY created_at DESC LIMIT 10`,
          [id]
        );
        aiResponses = runsResult.rows.map((r: { response_raw: string }) => r.response_raw);
      } catch {
        // table may not exist
      }

      const result = await autoDiscoverFacts(brand.name, brand.website || '', aiResponses);

      return Response.json({
        suggestedFacts: result.facts,
        ...(result.error ? { error: result.error } : {}),
      });
    } catch (e) {
      console.error('[AutoDiscover]', (e as Error).message);
      return Response.json({ error: 'Failed to auto-discover facts' }, { status: 500 });
    }
  }

  // ── Check Accuracy ───────────────────────────────────────────
  try {
    // Get canonical facts
    const factsResult = await pool.query('SELECT * FROM brand_facts WHERE brand_id = $1 ORDER BY category, fact_key', [id]);
    const facts = (factsResult.rows as FactRow[]).map(f => ({
      key: f.fact_key,
      value: f.fact_value,
      category: f.category || 'general',
    }));

    if (facts.length === 0) {
      return Response.json({
        issues: [],
        accuracyRate: null,
        platformStats: {},
        categoryStats: {},
        checkedRuns: 0,
        message: 'No canonical facts defined. Add facts first to check accuracy.',
      });
    }

    // Get recent prompt runs with response text
    let runs: { id: string; platform: string; model: string; response_raw: string; created_at: string; prompt: string }[] = [];
    try {
      const runsResult = await pool.query(
        `SELECT id, platform, model, response_raw, created_at, prompt
         FROM prompt_runs
         WHERE brand_id = $1 AND success = TRUE AND response_raw IS NOT NULL AND response_raw != ''
         ORDER BY created_at DESC LIMIT 30`,
        [id]
      );
      runs = runsResult.rows;
    } catch {
      // table may not have all columns
    }

    if (runs.length === 0) {
      return Response.json({
        issues: [],
        accuracyRate: null,
        platformStats: {},
        categoryStats: {},
        checkedRuns: 0,
        message: 'No AI responses found. Run some queries first from the Dashboard, then check accuracy.',
      });
    }

    // Run AI-powered fact-checking
    const result = await runFactCheck(facts, runs);

    return Response.json({
      issues: result.issues,
      accuracyRate: result.accuracyRate,
      platformStats: result.platformStats,
      categoryStats: result.categoryStats,
      checkedRuns: result.checkedRuns,
      aiPowered: true,
      ...(result.error ? { message: result.error } : {}),
    });
  } catch (e) {
    console.error('[Accuracy PUT]', (e as Error).message);
    return Response.json({ error: 'Failed to run accuracy check' }, { status: 500 });
  }
}
