import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';

interface BillingEventRow {
  event_type: string;
  from_plan: string | null;
  to_plan: string | null;
  subscription_id: string | null;
  source: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

// Map a billing_events row to the user-facing entry the dashboard
// renders. The shape preserves backward-compat with the prior
// audit_logs-derived response (date/event_type/plan/status fields)
// while exposing the new from_plan/to_plan fields the UI uses to
// render "Pro → Agency" arrows.
function toApiEntry(row: BillingEventRow) {
  const status = statusFor(row.event_type);
  return {
    event_type: row.event_type,
    from_plan: row.from_plan,
    to_plan: row.to_plan,
    plan: row.to_plan ?? row.from_plan ?? '',
    subscription_id: row.subscription_id,
    source: row.source,
    status,
    date: row.created_at,
    amount: '',
    details: row.details ?? {},
  };
}

function statusFor(eventType: string): string {
  switch (eventType) {
    case 'plan_upgraded':
      return 'upgraded';
    case 'plan_downgraded':
      return 'downgraded';
    case 'plan_cancelled':
      return 'cancelled';
    case 'plan_renewed':
      return 'renewed';
    case 'subscription_on_hold':
      return 'on_hold';
    case 'subscription_paused':
      return 'paused';
    case 'superseded_sub_cancelled':
      return 'orphan_cancelled';
    case 'payment_succeeded':
      return 'paid';
    default:
      return 'processed';
  }
}

export async function GET(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  try {
    // Source of truth: billing_events. Pre-fix this endpoint queried
    // audit_logs, which (a) only carried the action name (no from/to
    // plan) and (b) silently dropped every webhook-driven plan change
    // because db.ts auditLog() rewrites userId='system' to NULL and the
    // user-scoped WHERE clause filtered them all out. The result was a
    // billing-history view that only ever surfaced "subscription
    // cancelled" rows.
    const result = await pool.query<BillingEventRow>(
      `SELECT event_type, from_plan, to_plan, subscription_id, source, details, created_at
         FROM billing_events
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [user.id],
    );

    return Response.json({ history: result.rows.map(toApiEntry) });
  } catch {
    return Response.json({ history: [] });
  }
}
