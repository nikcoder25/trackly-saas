import { pool } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { logError, serverError } from '@/lib/api-error';

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const url = new URL(request.url);
  const rawLimit = parseInt(url.searchParams.get('limit') || '50', 10);
  const limit = Math.max(1, Math.min(!isNaN(rawLimit) ? rawLimit : 50, 200));
  const rawOffset = parseInt(url.searchParams.get('offset') || '0', 10);
  const offset = !isNaN(rawOffset) ? Math.max(0, rawOffset) : 0;
  const action = url.searchParams.get('action') || '';
  const userId = url.searchParams.get('user_id') || '';

  try {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (action) {
      conditions.push(`al.action = $${idx}`);
      values.push(action);
      idx++;
    }
    if (userId) {
      conditions.push(`al.user_id = $${idx}`);
      values.push(userId);
      idx++;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const [result, countResult, actionTypes] = await Promise.all([
      pool.query(`
        SELECT al.id, al.user_id, al.action, al.target_type, al.target_id,
          al.details, al.ip, al.created_at,
          u.email AS user_email, u.name AS user_name
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        ${whereClause}
        ORDER BY al.created_at DESC
        LIMIT $${idx} OFFSET $${idx + 1}
      `, [...values, limit, offset]),
      pool.query(`SELECT COUNT(*)::int AS total FROM audit_logs al ${whereClause}`, values),
      // All distinct action types for filtering
      pool.query(`SELECT DISTINCT action FROM audit_logs ORDER BY action`),
    ]);

    return Response.json({
      logs: result.rows,
      total: countResult.rows[0].total,
      actionTypes: actionTypes.rows.map((r: { action: string }) => r.action),
      limit,
      offset,
    });
  } catch (e) {
    logError('admin_backend.audit_logs.failed', e);
    return serverError({ message: 'Failed to load audit logs' });
  }
}
