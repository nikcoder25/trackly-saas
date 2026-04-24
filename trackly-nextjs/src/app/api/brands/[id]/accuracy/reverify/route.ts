import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { runFactCheck } from '@/lib/fact-checker';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  // runFactCheck re-prompts AI providers - keep this stricter than the
  // read-only analysis endpoints.
  const rl = await checkUserIpRateLimit('accuracy_reverify', user.id, getClientIp(request), {
    user: { max: 20, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const { id } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

  const { platform, query, factKey } = await request.json();
  if (!platform || !factKey) return Response.json({ error: 'Missing platform or factKey' }, { status: 400 });

  try {
    // Get the canonical fact to verify
    const factsResult = await pool.query(
      'SELECT fact_key, fact_value, category FROM brand_facts WHERE brand_id = $1',
      [id]
    );
    const facts = factsResult.rows.map((f: { fact_key: string; fact_value: string; category: string }) => ({
      key: f.fact_key, value: f.fact_value, category: f.category || 'general',
    }));

    if (facts.length === 0) {
      return Response.json({ error: 'No canonical facts' }, { status: 400 });
    }

    // Find the most recent run for this platform (optionally matching query)
    let runs: { id: string; platform: string; model: string; response_raw: string; created_at: string; prompt: string; citations: string[] }[] = [];
    try {
      const runsResult = await pool.query(
        `SELECT id, platform, model, response_raw, created_at, prompt, citations
         FROM prompt_runs
         WHERE brand_id = $1 AND platform = $2 AND success = TRUE
           AND response_raw IS NOT NULL AND response_raw != ''
         ORDER BY created_at DESC LIMIT 3`,
        [id, platform]
      );
      runs = runsResult.rows.map((r: Record<string, unknown>) => ({
        ...r,
        citations: Array.isArray(r.citations) ? r.citations as string[] : [],
      })) as typeof runs;
    } catch {
      // table may not have all columns
    }

    if (runs.length === 0) {
      return Response.json({ error: 'No recent responses from this platform' }, { status: 404 });
    }

    // Run fact-check on just this platform's responses
    const result = await runFactCheck(facts, runs);

    // Check if the specific factKey is still inaccurate
    const normalizeKey = (k: string) => k.toLowerCase().replace(/[\s-]+/g, '_').trim();
    const normalizedTarget = normalizeKey(factKey);
    const matchingIssue = result.issues.find(i =>
      normalizeKey(i.fact_key) === normalizedTarget && i.platform === platform
    );

    if (matchingIssue) {
      return Response.json({
        stillInaccurate: true,
        found: matchingIssue.found,
        explanation: matchingIssue.explanation,
        severity: matchingIssue.severity,
      });
    }

    return Response.json({ stillInaccurate: false });
  } catch (e) {
    console.error('[Reverify]', (e as Error).message);
    return Response.json({ error: 'Re-verify failed' }, { status: 500 });
  }
}
