import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { runFactCheck } from '@/lib/fact-checker';

interface FactRow {
  id: string;
  brand_id: string;
  fact_key: string;
  fact_value: string;
  category: string;
  updated_at: string;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });
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
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });
  const { id } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
  if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot edit facts' }, { status: 403 });

  const { facts } = await request.json();
  if (!Array.isArray(facts)) return Response.json({ error: 'Facts must be an array' }, { status: 400 });

  try {
    await pool.query('DELETE FROM brand_facts WHERE brand_id = $1', [id]);
    for (const fact of facts) {
      const key = fact.key || fact.fact_key;
      const value = fact.value || fact.fact_value;
      if (!key || !value) continue;
      await pool.query(
        `INSERT INTO brand_facts (brand_id, fact_key, fact_value, category, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (brand_id, fact_key) DO UPDATE SET fact_value = $3, category = $4, updated_at = NOW()`,
        [id, key, value, fact.category || 'general']
      );
    }
    return Response.json({ ok: true });
  } catch (e) {
    console.error('[Accuracy POST]', (e as Error).message);
    return Response.json({ error: 'Failed to save facts' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });
  const { id } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

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
