import { pool, auditLog } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { PLATFORM_MODELS, getDefaultModel } from '@/lib/ai-platforms';
import { logError, serverError } from '@/lib/api-error';

/**
 * GET - Returns available models per platform + current admin selection
 */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  try {
    const result = await pool.query(
      `SELECT value FROM site_config WHERE key = 'platform_models'`
    );
    const currentModels = result.rows[0]?.value || {};

    // Build response with defaults filled in
    const platforms = Object.entries(PLATFORM_MODELS).map(([platform, models]) => ({
      platform,
      models,
      selected: currentModels[platform] || getDefaultModel(platform),
    }));

    return Response.json({ platforms, currentModels });
  } catch (e) {
    // Table might not exist yet - create it
    if ((e as Error).message?.includes('site_config')) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS site_config (
          key TEXT PRIMARY KEY,
          value JSONB DEFAULT '{}',
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      const platforms = Object.entries(PLATFORM_MODELS).map(([platform, models]) => ({
        platform,
        models,
        selected: getDefaultModel(platform),
      }));
      return Response.json({ platforms, currentModels: {} });
    }
    logError('admin_backend.models.get_failed', e);
    return serverError({ message: 'Failed to load models' });
  }
}

/**
 * PUT - Update the selected model for one or more platforms
 * Body: { models: { ChatGPT: "gpt-4o", Claude: "claude-sonnet-4-20250514", ... } }
 */
export async function PUT(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  try {
    const { models } = await request.json();
    if (!models || typeof models !== 'object') {
      return Response.json({ error: 'models object required' }, { status: 400 });
    }

    // Validate each model exists for its platform
    for (const [platform, modelId] of Object.entries(models)) {
      const platformModels = PLATFORM_MODELS[platform];
      if (!platformModels) {
        return Response.json({ error: `Unknown platform: ${platform}` }, { status: 400 });
      }
      if (!platformModels.find(m => m.id === modelId)) {
        return Response.json({ error: `Invalid model ${modelId} for ${platform}` }, { status: 400 });
      }
    }

    // Merge with existing config
    const existing = await pool.query(`SELECT value FROM site_config WHERE key = 'platform_models'`).catch(() => ({ rows: [] }));
    const currentModels = existing.rows[0]?.value || {};
    const updatedModels = { ...currentModels, ...models };

    await pool.query(
      `INSERT INTO site_config (key, value, updated_at)
       VALUES ('platform_models', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify(updatedModels)]
    );

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    auditLog(admin.id, 'admin_update_models', 'site_config', 'platform_models', models, ip);

    return Response.json({ success: true, models: updatedModels });
  } catch (e) {
    logError('admin_backend.models.put_failed', e);
    return serverError({ message: 'Failed to update models' });
  }
}
