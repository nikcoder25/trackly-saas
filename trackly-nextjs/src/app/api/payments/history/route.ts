import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';

export async function GET(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  try {
    // Payment history from audit logs (webhook_events table has no user_id column)
    const result = await pool.query(
      `SELECT action, details, created_at AS processed_at
       FROM audit_logs
       WHERE user_id = $1 AND action IN ('webhook_plan_change', 'plan_change', 'subscription_cancelled')
       ORDER BY created_at DESC LIMIT 50`,
      [user.id]
    );

    const history = result.rows.map((row: { action: string; details: Record<string, unknown>; processed_at: string }) => ({
      event_type: row.action,
      plan: (row.details?.plan as string) || '',
      status: 'processed',
      date: row.processed_at,
      amount: '',
    }));

    return Response.json({ history });
  } catch {
    return Response.json({ history: [] });
  }
}
