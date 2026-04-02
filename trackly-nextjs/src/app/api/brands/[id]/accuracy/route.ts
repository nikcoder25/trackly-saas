import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess, decryptApiKeys } from '@/lib/helpers';
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

    // Load persisted accuracy issues with expected values resolved via JOIN
    let issues: Record<string, unknown>[] = [];
    try {
      const issuesResult = await pool.query(
        `SELECT ai.id, ai.platform, ai.model, ai.fact_key, ai.expected, ai.found,
                ai.severity, ai.category, ai.explanation, ai.run_id, ai.source_url,
                ai.query, ai.date, ai.count, ai.fixed, ai.fixed_at,
                bf.fact_value AS canonical_expected
         FROM accuracy_issues ai
         LEFT JOIN brand_facts bf
           ON bf.brand_id = ai.brand_id
           AND LOWER(REPLACE(REPLACE(bf.fact_key, ' ', '_'), '-', '_'))
             = LOWER(REPLACE(REPLACE(ai.fact_key, ' ', '_'), '-', '_'))
         WHERE ai.brand_id = $1
         ORDER BY ai.fixed ASC, ai.created_at DESC`,
        [id]
      );
      issues = issuesResult.rows.map((row: Record<string, unknown>) => ({
        ...row,
        expected: row.canonical_expected || row.expected || '',
        canonical_expected: undefined,
      }));
    } catch {
      // table may not exist yet
    }

    return Response.json({
      facts,
      issues,
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
      // Use brand info already fetched by getBrandWithAccess (name/website are in the JSONB data column)
      const brand = access.brand as { name: string; website?: string | null; userId?: string };

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

      // Fetch the brand owner's API keys so the checker can use them as fallback
      let userApiKeys: Record<string, string | null> = {};
      try {
        const ownerId = brand.userId || user.id;
        const keysResult = await pool.query('SELECT api_keys FROM users WHERE id = $1', [ownerId]);
        if (keysResult.rows[0]?.api_keys) {
          userApiKeys = decryptApiKeys(keysResult.rows[0].api_keys);
        }
      } catch {
        // non-critical
      }

      const result = await autoDiscoverFacts(brand.name, brand.website || '', aiResponses, userApiKeys);

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
    let runs: { id: string; platform: string; model: string; response_raw: string; created_at: string; prompt: string; citations: string[] }[] = [];
    try {
      const runsResult = await pool.query(
        `SELECT id, platform, model, response_raw, created_at, prompt, citations
         FROM prompt_runs
         WHERE brand_id = $1 AND success = TRUE AND response_raw IS NOT NULL AND response_raw != ''
         ORDER BY created_at DESC LIMIT 30`,
        [id]
      );
      runs = runsResult.rows.map((r: Record<string, unknown>) => ({
        ...r,
        citations: Array.isArray(r.citations) ? r.citations as string[] : [],
      })) as typeof runs;
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

    // Persist issues to DB: remove old unfixed issues, keep fixed ones, insert new
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM accuracy_issues WHERE brand_id = $1 AND fixed = FALSE', [id]);
        for (const issue of result.issues) {
          await client.query(
            `INSERT INTO accuracy_issues (brand_id, platform, model, fact_key, expected, found,
              severity, category, explanation, run_id, source_url, query, date, count)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [id, issue.platform, issue.model, issue.fact_key, issue.expected, issue.found,
             issue.severity, issue.category, issue.explanation, issue.run_id,
             issue.source_url, issue.query, issue.date, issue.count || 1]
          );
        }
        await client.query('COMMIT');
      } catch (dbErr) {
        await client.query('ROLLBACK');
        console.error('[Accuracy] Failed to persist issues:', (dbErr as Error).message);
      } finally {
        client.release();
      }
    } catch {
      // table may not exist yet — continue without persisting
    }

    // Reload all issues (including fixed ones) with expected values via JOIN
    let allIssues: Record<string, unknown>[] = [];
    try {
      const issuesResult = await pool.query(
        `SELECT ai.id, ai.platform, ai.model, ai.fact_key, ai.expected, ai.found,
                ai.severity, ai.category, ai.explanation, ai.run_id, ai.source_url,
                ai.query, ai.date, ai.count, ai.fixed, ai.fixed_at,
                bf.fact_value AS canonical_expected
         FROM accuracy_issues ai
         LEFT JOIN brand_facts bf
           ON bf.brand_id = ai.brand_id
           AND LOWER(REPLACE(REPLACE(bf.fact_key, ' ', '_'), '-', '_'))
             = LOWER(REPLACE(REPLACE(ai.fact_key, ' ', '_'), '-', '_'))
         WHERE ai.brand_id = $1
         ORDER BY ai.fixed ASC, ai.created_at DESC`,
        [id]
      );
      allIssues = issuesResult.rows.map((row: Record<string, unknown>) => ({
        ...row,
        expected: row.canonical_expected || row.expected || '',
        canonical_expected: undefined,
      }));
    } catch {
      // fallback to in-memory issues
      allIssues = result.issues.map(i => ({ ...i, fixed: false, fixed_at: null }));
    }

    return Response.json({
      issues: allIssues,
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
