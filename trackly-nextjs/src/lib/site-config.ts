/**
 * Site-wide configuration helpers.
 * Reads admin-configured settings from the site_config table.
 */
import { pool } from './db';
import { getDefaultModel } from './ai-platforms';

let modelCache: { models: Record<string, string>; expires: number } | null = null;
const CACHE_TTL = 60_000; // 1 minute

/**
 * Get the admin-selected model for a platform.
 * Falls back to getDefaultModel() if no admin selection exists.
 * Results are cached for 1 minute to avoid DB hits on every query.
 */
export async function getAdminModel(platform: string): Promise<string> {
  const now = Date.now();

  if (modelCache && now < modelCache.expires) {
    return modelCache.models[platform] || getDefaultModel(platform);
  }

  try {
    const result = await pool.query(
      `SELECT value FROM site_config WHERE key = 'platform_models'`
    );
    const models = result.rows[0]?.value || {};
    modelCache = { models, expires: now + CACHE_TTL };
    return models[platform] || getDefaultModel(platform);
  } catch {
    // Table may not exist yet or DB error - fall back to defaults
    return getDefaultModel(platform);
  }
}

/**
 * Get all admin-selected models as a map.
 */
export async function getAdminModels(): Promise<Record<string, string>> {
  const now = Date.now();

  if (modelCache && now < modelCache.expires) {
    return modelCache.models;
  }

  try {
    const result = await pool.query(
      `SELECT value FROM site_config WHERE key = 'platform_models'`
    );
    const models = result.rows[0]?.value || {};
    modelCache = { models, expires: now + CACHE_TTL };
    return models;
  } catch {
    return {};
  }
}
