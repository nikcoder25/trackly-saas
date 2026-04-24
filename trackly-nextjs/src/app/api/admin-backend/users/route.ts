import { pool, auditLog } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import bcrypt from 'bcryptjs';
import { logError, serverError } from '@/lib/api-error';

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const url = new URL(request.url);
  const rawLimit = parseInt(url.searchParams.get('limit') || '50', 10);
  const limit = Math.max(1, Math.min(!isNaN(rawLimit) ? rawLimit : 50, 200));
  const rawOffset = parseInt(url.searchParams.get('offset') || '0', 10);
  const offset = !isNaN(rawOffset) ? Math.max(0, rawOffset) : 0;
  const search = (url.searchParams.get('search') || '').slice(0, 100);
  const planFilter = url.searchParams.get('plan') || '';
  const sortBy = url.searchParams.get('sort') || 'created_at';
  const sortDir = url.searchParams.get('dir') === 'asc' ? 'ASC' : 'DESC';

  const allowedSorts = ['created_at', 'email', 'plan', 'name'];
  const sortColumn = allowedSorts.includes(sortBy) ? sortBy : 'created_at';

  try {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (search) {
      conditions.push(`(email ILIKE $${idx} OR name ILIKE $${idx} OR username ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx++;
    }
    if (planFilter) {
      conditions.push(`plan = $${idx}`);
      values.push(planFilter);
      idx++;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const query = `
      SELECT u.id, u.email, u.username, u.name, u.plan, u.role, u.email_verified, u.created_at,
        u.settings->>'dodo_subscription_id' AS subscription_id,
        (SELECT COUNT(*)::int FROM brands WHERE user_id = u.id) AS brand_count,
        (SELECT COUNT(*)::int FROM prompt_runs WHERE brand_id IN (SELECT id FROM brands WHERE user_id = u.id)) AS total_queries
      FROM users u
      ${whereClause}
      ORDER BY ${sortColumn} ${sortDir}
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    values.push(limit, offset);

    const countValues = values.slice(0, idx - 1);
    const countQuery = `SELECT COUNT(*)::int AS total FROM users ${whereClause}`;

    const [result, countResult] = await Promise.all([
      pool.query(query, values),
      pool.query(countQuery, countValues),
    ]);

    return Response.json({
      users: result.rows,
      total: countResult.rows[0].total,
      limit,
      offset,
    });
  } catch (e) {
    logError('admin_backend.users.list_failed', e);
    return serverError({ message: 'Failed to load users' });
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  try {
    const { email, password, name, plan } = await request.json();
    if (!email || !password) {
      return Response.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Match the allowlist enforced on PUT so typos or hostile input can't
    // land an unknown plan value (including 'owner', which confers admin
    // affordances elsewhere in the app).
    const validPlans = ['free', 'starter', 'pro', 'agency', 'enterprise', 'owner'];
    const resolvedPlan = plan || 'free';
    if (!validPlans.includes(resolvedPlan)) {
      return Response.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length) {
      return Response.json({ error: 'Email already exists' }, { status: 409 });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, plan, email_verified, settings)
       VALUES ($1, $2, $3, $4, true, '{}'::jsonb)
       RETURNING id, email, name, plan, role, email_verified, created_at`,
      [email.toLowerCase().trim(), hash, name || null, resolvedPlan]
    );

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    auditLog(admin.id, 'admin_create_user', 'user', result.rows[0].id, { email }, ip);

    return Response.json({ user: result.rows[0] }, { status: 201 });
  } catch (e) {
    logError('admin_backend.users.create_failed', e);
    return serverError({ message: 'Failed to create user' });
  }
}
