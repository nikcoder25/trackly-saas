import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const { id } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '20', 10) || 20, 100);
  const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0', 10) || 0;
  const platform = request.nextUrl.searchParams.get('platform');

  try {
    let query = 'SELECT id, prompt, platform, model, mentioned, sentiment, list_position, success, error_message, created_at FROM prompt_runs WHERE brand_id = $1';
    const values: unknown[] = [id];
    let idx = 2;

    if (platform) {
      query += ` AND platform = $${idx}`;
      values.push(platform);
      idx++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);
    return Response.json({ promptRuns: result.rows, limit, offset });
  } catch (e) {
    console.error('[PromptRuns]', (e as Error).message);
    return Response.json({ error: 'Failed to load prompt runs' }, { status: 500 });
  }
}
