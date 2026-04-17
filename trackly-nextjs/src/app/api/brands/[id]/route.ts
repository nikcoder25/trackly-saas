import { pool, safeConnect } from '@/lib/db';
import { verifyRequestAuth, requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { getPlanLimits } from '@/lib/constants';

// GET /api/brands/:id
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const { id } = await params;
  try {
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    return Response.json({ brand: access.brand });
  } catch {
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}

// PUT /api/brands/:id
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const { id } = await params;
  try {
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot edit brands.' }, { status: 403 });

    const brand = access.brand;
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Plan limit checks — always check against the brand OWNER's plan and count
    const ownerId = brand.userId || user.id;
    const planResult = await pool.query('SELECT plan FROM users WHERE id = $1', [ownerId]);
    const plan = planResult.rows[0]?.plan || 'free';
    const limits = getPlanLimits(plan);

    // Check if this brand is beyond the owner's plan limit (soft-locked after downgrade)
    const countResult = await pool.query(
      `SELECT id FROM brands WHERE user_id = $1 ORDER BY created_at, id`,
      [ownerId]
    );
    const brandIds = countResult.rows.map((r: { id: string }) => r.id);
    const brandIndex = brandIds.indexOf(id);
    if (brandIndex >= limits.brands) {
      return Response.json({
        error: `This brand is locked because the ${plan} plan allows up to ${limits.brands} brand(s). Upgrade the plan or delete unused brands to edit.`,
        planLimit: true,
      }, { status: 403 });
    }

    const allowedFields = ['name', 'industry', 'website', 'description', 'queries', 'platforms', 'selected_platforms', 'competitors', 'aliases', 'locations', 'schedule', 'city', 'goal', 'nearbyAreas', 'webhookUrl'];
    const safeBody: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (body[key] !== undefined) safeBody[key] = body[key];
    }

    if (safeBody.name !== undefined && !(safeBody.name as string).trim()) {
      return Response.json({ error: 'Brand name cannot be empty' }, { status: 400 });
    }

    // String field validation
    const strLimits: Record<string, number> = { name: 100, industry: 100, website: 500, description: 1000, city: 100, webhookUrl: 500 };
    for (const [field, maxLen] of Object.entries(strLimits)) {
      if (safeBody[field] && (typeof safeBody[field] !== 'string' || (safeBody[field] as string).length > maxLen)) {
        return Response.json({ error: `${field} must be ${maxLen} characters or less` }, { status: 400 });
      }
    }

    // Validate webhookUrl is a valid HTTPS URL (prevent SSRF via javascript: or internal URLs)
    if (safeBody.webhookUrl && typeof safeBody.webhookUrl === 'string') {
      try {
        const parsed = new URL(safeBody.webhookUrl as string);
        if (parsed.protocol !== 'https:') {
          return Response.json({ error: 'Webhook URL must use HTTPS' }, { status: 400 });
        }
        // Block private/internal hostnames (comprehensive SSRF protection)
        const host = parsed.hostname.toLowerCase();
        const isPrivate =
          host === 'localhost' ||
          host === '0.0.0.0' ||
          host === '::1' || host === '[::1]' ||
          /^127\.\d+\.\d+\.\d+$/.test(host) ||       // 127.0.0.0/8
          host.startsWith('10.') ||                     // 10.0.0.0/8
          host.startsWith('192.168.') ||                // 192.168.0.0/16
          /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||   // 172.16.0.0/12
          host.startsWith('169.254.') ||                // link-local
          host.startsWith('fc') || host.startsWith('fd') || // IPv6 private
          host.startsWith('fe80') ||                    // IPv6 link-local
          host.endsWith('.local') ||
          host.endsWith('.internal') ||
          host.endsWith('.localhost') ||
          /^0+\d/.test(host);                          // Octal notation
        if (isPrivate) {
          return Response.json({ error: 'Webhook URL must point to a public endpoint' }, { status: 400 });
        }
      } catch {
        return Response.json({ error: 'Webhook URL is not a valid URL' }, { status: 400 });
      }
    }

    // Validate array fields
    if (safeBody.aliases !== undefined) {
      if (!Array.isArray(safeBody.aliases)) return Response.json({ error: 'Aliases must be an array' }, { status: 400 });
      if (safeBody.aliases.length > 50) return Response.json({ error: 'Maximum 50 aliases allowed' }, { status: 400 });
      safeBody.aliases = (safeBody.aliases as string[]).filter((a: unknown) => typeof a === 'string' && (a as string).trim().length >= 2).map((a: string) => a.trim().slice(0, 200));
    }
    if (safeBody.locations !== undefined) {
      if (!Array.isArray(safeBody.locations)) return Response.json({ error: 'Locations must be an array' }, { status: 400 });
      if (safeBody.locations.length > 100) return Response.json({ error: 'Maximum 100 locations allowed' }, { status: 400 });
      safeBody.locations = (safeBody.locations as string[]).filter((l: unknown) => typeof l === 'string').map((l: string) => l.trim().slice(0, 200));
    }
    if (safeBody.goal !== undefined) {
      const goal = Number(safeBody.goal);
      if (isNaN(goal) || goal < 0 || goal > 100) return Response.json({ error: 'Goal must be a number between 0 and 100' }, { status: 400 });
      safeBody.goal = goal;
    }
    if (safeBody.platforms !== undefined) {
      if (!Array.isArray(safeBody.platforms)) return Response.json({ error: 'Platforms must be an array' }, { status: 400 });
      if (safeBody.platforms.length > 20) return Response.json({ error: 'Maximum 20 platforms allowed' }, { status: 400 });
    }
    if (safeBody.selected_platforms !== undefined) {
      if (!Array.isArray(safeBody.selected_platforms)) return Response.json({ error: 'selected_platforms must be an array' }, { status: 400 });
      if (safeBody.selected_platforms.length > 20) return Response.json({ error: 'Maximum 20 platforms allowed' }, { status: 400 });
    }

    // Deduplicate queries
    if (safeBody.queries && Array.isArray(safeBody.queries)) {
      const seen = new Set<string>();
      safeBody.queries = (safeBody.queries as string[]).filter((q) => {
        const lower = q.toLowerCase().trim();
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
      });
    }

    // Per-brand query limit check
    if (safeBody.queries && (safeBody.queries as string[]).length > limits.queries) {
      return Response.json({ error: `Your ${plan} plan allows up to ${limits.queries} total queries. Upgrade for more.`, planLimit: true }, { status: 403 });
    }

    if (safeBody.competitors && (safeBody.competitors as string[]).length > limits.competitors) {
      return Response.json({ error: limits.competitors === 0 ? 'Competitor tracking is available on Pro plans and above.' : `Your plan allows up to ${limits.competitors} competitors.`, planLimit: true }, { status: 403 });
    }

    // Validate schedule against plan limits
    if (safeBody.schedule !== undefined) {
      const scheduleHours = Number(safeBody.schedule);
      if (isNaN(scheduleHours) || scheduleHours < 1) {
        return Response.json({ error: 'Schedule must be a positive number of hours' }, { status: 400 });
      }
      if (!limits.scheduledRuns) {
        return Response.json({ error: 'Scheduled runs are not available on your plan. Upgrade to enable automatic scheduling.', planLimit: true }, { status: 403 });
      }
      if (scheduleHours < limits.minScheduleHours) {
        return Response.json({ error: `Your ${plan} plan allows a minimum schedule interval of ${limits.minScheduleHours} hours. Upgrade for more frequent runs.`, planLimit: true }, { status: 403 });
      }
    }

    const updated = { ...brand, ...safeBody, id: brand.id, userId: brand.userId };
    const { id: _id, userId: _uid, createdAt: _ca, updatedAt: _ua, ...dataOnly } = updated;
    await pool.query('UPDATE brands SET data = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(dataOnly), id]);
    return Response.json({ brand: updated });
  } catch (e) {
    console.error('[Brand PUT]', (e as Error).message);
    return Response.json({ error: 'Failed to update brand' }, { status: 500 });
  }
}

// DELETE /api/brands/:id
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const { id } = await params;
  try {
    // Cascading delete in a transaction to clean up all related data
    const client = await safeConnect();
    try {
      await client.query('BEGIN');
      // Verify ownership first
      const check = await client.query('SELECT id FROM brands WHERE id = $1 AND user_id = $2', [id, user.id]);
      if (!check.rows.length) {
        await client.query('ROLLBACK');
        return Response.json({ error: 'Brand not found' }, { status: 404 });
      }
      await client.query('DELETE FROM accuracy_issues WHERE brand_id = $1', [id]);
      await client.query('DELETE FROM brand_facts WHERE brand_id = $1', [id]);
      await client.query('DELETE FROM prompt_runs WHERE brand_id = $1', [id]);
      await client.query('DELETE FROM active_runs WHERE brand_id = $1', [id]);
      await client.query('DELETE FROM alert_rules WHERE brand_id = $1', [id]);
      await client.query('DELETE FROM brands WHERE id = $1 AND user_id = $2', [id, user.id]);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }
    return Response.json({ success: true });
  } catch (e) {
    console.error('[Brand DELETE]', (e as Error).message);
    return Response.json({ error: 'Failed to delete brand' }, { status: 500 });
  }
}
