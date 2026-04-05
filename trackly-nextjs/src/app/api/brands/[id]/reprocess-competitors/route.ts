import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { buildBrandMatcher, detectCompetitors } from '@/lib/parser';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const { id } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

  const brand = access.brand;
  const competitors: string[] = brand.competitors || [];

  if (!competitors.length) {
    return Response.json({ error: 'No competitors configured for this brand' }, { status: 400 });
  }

  const matcher = buildBrandMatcher({
    name: brand.name,
    website: brand.website,
    aliases: brand.aliases,
    city: brand.city,
    nearbyAreas: brand.nearbyAreas,
    competitors,
  });

  // Fetch all prompt_runs with stored raw responses for this brand
  const runsResult = await pool.query(
    `SELECT id, response_raw FROM prompt_runs WHERE brand_id = $1 AND response_raw IS NOT NULL`,
    [id]
  );

  let updated = 0;
  const BATCH_SIZE = 100;

  for (let i = 0; i < runsResult.rows.length; i += BATCH_SIZE) {
    const batch = runsResult.rows.slice(i, i + BATCH_SIZE);
    const cases: string[] = [];
    const vals: unknown[] = [];
    let pi = 1;

    for (const row of batch) {
      const newCompetitors = detectCompetitors(row.response_raw, matcher);
      cases.push(`WHEN id = $${pi} THEN $${pi + 1}::jsonb`);
      vals.push(row.id, JSON.stringify(newCompetitors));
      pi += 2;
      updated++;
    }

    if (cases.length > 0) {
      const ids = batch.map((_: unknown, idx: number) => `$${idx * 2 + 1}`).join(',');
      await pool.query(
        `UPDATE prompt_runs SET competitor_mentions = CASE ${cases.join(' ')} END WHERE id IN (${ids})`,
        vals
      );
    }
  }

  // Also update the brand's in-memory mentions data
  const brandRow = await pool.query('SELECT data FROM brands WHERE id = $1', [id]);
  const brandData = typeof brandRow.rows[0]?.data === 'string'
    ? JSON.parse(brandRow.rows[0].data) : brandRow.rows[0]?.data;

  if (brandData?.mentions?.length) {
    const mentionRuns = await pool.query(
      `SELECT prompt, platform, competitor_mentions FROM prompt_runs
       WHERE brand_id = $1 AND success = true AND competitor_mentions != '[]'::jsonb
       ORDER BY created_at DESC LIMIT 500`,
      [id]
    );

    const compLookup = new Map<string, string[]>();
    for (const row of mentionRuns.rows) {
      const key = `${row.platform}|${row.prompt}`;
      const comps = typeof row.competitor_mentions === 'string'
        ? JSON.parse(row.competitor_mentions) : row.competitor_mentions;
      if (comps.length) compLookup.set(key, comps);
    }

    for (const mention of brandData.mentions) {
      const key = `${mention.platform}|${mention.query}`;
      const comps = compLookup.get(key);
      if (comps) mention.competitorMentions = comps;
    }

    await pool.query('UPDATE brands SET data = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(brandData), id]);
  }

  return Response.json({
    success: true,
    runsProcessed: updated,
    totalRuns: runsResult.rows.length,
  });
}
