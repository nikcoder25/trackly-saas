/**
 * Resolve an AI key for the platform's own "generator" work - the
 * background LLM calls that produce suggestions rather than measurements
 * (prompt generation, topic classification, page binding).
 *
 * This walks the same key-resolution chain the measurement path uses
 * (tenant_api_keys -> users.api_keys -> server env), preferring the
 * cheapest capable provider first. It was previously inlined in
 * /api/ai-generate-queries; it lives here because topic classification
 * needs exactly the same chain, and two copies of a key-resolution order
 * is the kind of thing that drifts silently until one feature starts
 * telling tenants they have no keys while the rest of the app works fine.
 */

import { pool } from './db';
import { decryptApiKeys } from './helpers';
import { getServerKeys } from './server-keys';
import { resolveKeysForTenant, PROVIDER_SPECS } from './tenant-keys';

/**
 * Cheapest / fastest generator first, then fall back. Names match
 * `ProviderSpec.keyName`.
 */
export const GENERATOR_PLATFORM_ORDER: Array<'claude' | 'openai' | 'gemini' | 'grok' | 'perplexity'> = [
  'claude', 'openai', 'gemini', 'grok', 'perplexity',
];

export interface GeneratorKey {
  /** Display platform name, e.g. "Claude" - what queryAI expects. */
  platform: string;
  apiKey: string;
}

/**
 * Find the first usable generator key for a tenant, or null when the
 * tenant has configured none and the server has no fallback either.
 */
export async function resolveGeneratorKey(tenantId: string): Promise<GeneratorKey | null> {
  let legacyUserKeys: Record<string, string | null | undefined> = {};
  try {
    const userResult = await pool.query('SELECT api_keys FROM users WHERE id = $1', [tenantId]);
    legacyUserKeys = decryptApiKeys(userResult.rows[0]?.api_keys || {}) as Record<string, string | null | undefined>;
  } catch {
    // A missing/unreadable legacy blob is not fatal - the tenant may keep
    // their keys in tenant_api_keys, or the server may supply one.
  }
  const serverKeys = getServerKeys();

  for (const keyName of GENERATOR_PLATFORM_ORDER) {
    const spec = PROVIDER_SPECS.find(s => s.keyName === keyName);
    if (!spec) continue;
    const resolved = await resolveKeysForTenant({
      tenantId,
      platformKeyName: keyName,
      legacyUserKeys,
      serverKeys: serverKeys[keyName] || [],
    });
    if (resolved) return { platform: spec.platform, apiKey: resolved.key };
  }
  return null;
}
