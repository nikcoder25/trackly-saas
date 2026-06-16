import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { uid } from '@/lib/helpers';

// The DB stores alert rules in a normalized shape (condition_type +
// condition_params jsonb, action_type, cooldown_hours), but the Alerts page
// works with a flat shape (condition / threshold / action / cooldown). These
// two views drifted apart: the form POSTed `condition` while the handler
// required `condition_type` (→ 400), and the page read `d.rules` while GET
// returned `{ alerts }` (→ list never populated, counters stuck at 0).
//
// toUiRule() is the single translation point DB row → flat UI rule, so both
// GET and POST return exactly what the page renders. The `/api/alerts/[id]`
// route still reads the normalized columns, so they remain the source of truth.
interface AlertRow {
  id: string;
  name: string;
  condition_type: string;
  condition_params: Record<string, unknown> | null;
  action_type: string | null;
  cooldown_hours: number | null;
  enabled: boolean;
}

function toUiRule(row: AlertRow) {
  const params = (row.condition_params || {}) as Record<string, unknown>;
  const rawThreshold = params.threshold;
  const threshold = typeof rawThreshold === 'number'
    ? rawThreshold
    : Number(rawThreshold) || 0;
  return {
    id: row.id,
    name: row.name,
    condition: row.condition_type,
    threshold,
    action: row.action_type || 'email',
    cooldown: row.cooldown_hours ?? 24,
    enabled: row.enabled,
  };
}

async function listRules(brandId: string) {
  const result = await pool.query(
    'SELECT id, brand_id, user_id, name, condition_type, condition_params, action_type, action_params, cooldown_hours, enabled, created_at FROM alert_rules WHERE brand_id = $1 ORDER BY created_at DESC LIMIT 100',
    [brandId]
  );
  return result.rows as AlertRow[];
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const { id } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

  const rows = await listRules(id);
  // Return both keys: `rules` is what the Alerts page renders; `alerts` is kept
  // for any other/legacy consumer of the raw normalized rows.
  return Response.json({ rules: rows.map(toUiRule), alerts: rows });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const { id: brandId } = await params;
  const access = await getBrandWithAccess(brandId, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
  if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot create alerts' }, { status: 403 });

  const body = await request.json().catch(() => ({}));

  // Accept both the flat UI payload ({ condition, threshold, action, cooldown })
  // and the normalized payload ({ condition_type, condition_params, ... }), so
  // the form no longer 400s on a field-name mismatch.
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const condition_type = body.condition_type || body.condition;
  if (!name || !condition_type) {
    return Response.json({ error: 'Alert name and condition are required.' }, { status: 400 });
  }

  // Fold a flat `threshold` into condition_params; prefer an explicit
  // condition_params object when the caller sends the normalized shape.
  let condition_params: Record<string, unknown>;
  if (body.condition_params && typeof body.condition_params === 'object') {
    condition_params = body.condition_params;
  } else if (body.threshold !== undefined && body.threshold !== null) {
    condition_params = { threshold: Number(body.threshold) || 0 };
  } else {
    condition_params = {};
  }
  const action_type = body.action_type || body.action || 'email';
  const action_params = body.action_params && typeof body.action_params === 'object' ? body.action_params : {};
  const cooldown_hours = Number(body.cooldown_hours ?? body.cooldown ?? 24) || 24;

  try {
    const id = uid();
    await pool.query(
      `INSERT INTO alert_rules (id, brand_id, user_id, name, condition_type, condition_params, action_type, action_params, cooldown_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, brandId, user.id, name, condition_type, JSON.stringify(condition_params), action_type, JSON.stringify(action_params), cooldown_hours]
    );
    // Return the freshly created rule AND the full updated list (flat shape) so
    // the page can repaint the table + counters from one response.
    const rows = await listRules(brandId);
    const created = rows.find(r => r.id === id);
    return Response.json({
      alert: created ? toUiRule(created) : null,
      rules: rows.map(toUiRule),
    });
  } catch {
    return Response.json({ error: 'Failed to create alert' }, { status: 500 });
  }
}
