import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';

// GDPR Article 20 — Right to data portability.
// Returns every row tied to the caller's user_id as a single JSON document.
// Marked noindex + attachment filename so it downloads directly and never
// gets cached by a CDN. Does not expose other users' data.

export async function GET(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  try {
    const bundle: Record<string, unknown> = { exported_at: new Date().toISOString(), user_id: user.id };

    const tables = [
      { key: 'user', sql: 'SELECT id, email, name, plan, role, created_at, verified, trial_ends_at FROM users WHERE id = $1' },
      { key: 'brands', sql: 'SELECT id, data, created_at, updated_at FROM brands WHERE user_id = $1' },
      { key: 'prompt_runs', sql: 'SELECT * FROM prompt_runs WHERE brand_id IN (SELECT id FROM brands WHERE user_id = $1)' },
      { key: 'active_runs', sql: 'SELECT id, brand_id, status, started_at, completed_at, total_expected, received, found_count, error_count FROM active_runs WHERE user_id = $1' },
      { key: 'alert_rules', sql: 'SELECT * FROM alert_rules WHERE user_id = $1' },
      { key: 'notifications', sql: 'SELECT * FROM notifications WHERE user_id = $1' },
      { key: 'team_members', sql: 'SELECT * FROM team_members WHERE owner_id = $1 OR member_id = $1' },
      { key: 'audit_logs', sql: 'SELECT id, action, target_type, target_id, details, ip, created_at FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1000' },
    ];

    for (const t of tables) {
      try {
        const r = await pool.query(t.sql, [user.id]);
        bundle[t.key] = r.rows;
      } catch (e) {
        // A missing optional table shouldn't block the whole export.
        bundle[t.key] = { error: 'table unavailable', detail: (e as Error).message };
      }
    }

    const body = JSON.stringify(bundle, null, 2);
    const filename = `livesov-data-export-${user.id}-${new Date().toISOString().slice(0, 10)}.json`;

    logger.info('gdpr.export', { user_id: user.id, bytes: body.length });

    return new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  } catch (e) {
    logger.error('gdpr.export.failed', { user_id: user.id, error: (e as Error).message });
    return Response.json({ error: 'Export failed' }, { status: 500 });
  }
}
