/**
 * POST /api/brands/[id]/validate-keys
 *
 * Issue #409: validate every key wired to this brand BEFORE the operator
 * can save the setup form. Walks the same resolution chain the run uses
 * (tenant_api_keys → users.api_keys → server env), so the report
 * reflects what would actually be called at run time. Server-only env
 * keys are reported as `source: 'server'` with `ok: true` skipped —
 * the operator can't fix those from the UI, so reporting them as
 * "needs your attention" would be misleading.
 *
 * Each platform validates in parallel with a 5s per-key timeout per
 * the acceptance criteria. The route never logs the plaintext key.
 */
import { pool, ensureColumns } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { getBrandWithAccess, decryptApiKeys } from '@/lib/helpers';
import { getServerKeys } from '@/lib/server-keys';
import { resolveKeysForTenant, PROVIDER_SPECS } from '@/lib/tenant-keys';
import { validateProviderKey } from '@/lib/key-validator';
import { logError, badRequest, serverError, unauthorized, notFound, forbidden } from '@/lib/api-error';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

type Params = { params: Promise<{ id: string }> };

const DEFAULT_PLATFORM_LIST = PROVIDER_SPECS.map(s => s.platform);

interface PerPlatformReport {
  platform: string;
  keyName: string;
  source: 'tenant' | 'user' | 'server' | 'none';
  ok: boolean;
  status: 'ok' | 'invalid' | 'error' | 'no_key';
  error?: string;
  httpStatus?: number;
  latencyMs?: number;
}

export async function POST(request: Request, { params }: Params) {
  const user = verifyRequestAuth(request);
  if (!user) return unauthorized('No token');

  const { id } = await params;

  // Validation hits 5 providers in parallel; per-user 30/hr matches
  // the save endpoints' ceiling.
  const rl = await checkUserIpRateLimit('brand_validate_keys', user.id, getClientIp(request), {
    user: { max: 30, windowMs: 60 * 60 * 1000 },
    ip: { max: 60, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  let body: { platforms?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is allowed — defaults to every supported platform.
  }
  const requested: string[] = Array.isArray(body.platforms)
    ? (body.platforms as unknown[]).filter((x): x is string => typeof x === 'string')
    : DEFAULT_PLATFORM_LIST;
  const platforms = requested.filter(p => DEFAULT_PLATFORM_LIST.includes(p as typeof DEFAULT_PLATFORM_LIST[number]));
  if (!platforms.length) return badRequest('No supported platforms specified');

  try {
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return notFound('Brand not found');
    if (access.role === 'viewer') return forbidden('Viewers cannot validate keys');

    await ensureColumns();
    const ownerId = access.brand.userId || user.id;
    const ownerRow = await pool.query('SELECT api_keys FROM users WHERE id = $1', [ownerId]);
    const legacyUserKeys = decryptApiKeys(ownerRow.rows[0]?.api_keys || {});
    const serverKeys = getServerKeys();

    const reports = await Promise.all(
      platforms.map(async (platform): Promise<PerPlatformReport> => {
        const spec = PROVIDER_SPECS.find(s => s.platform === platform);
        if (!spec) {
          return { platform, keyName: '', source: 'none', ok: false, status: 'no_key', error: 'Unknown platform' };
        }
        const resolved = await resolveKeysForTenant({
          tenantId: ownerId,
          platformKeyName: spec.keyName,
          legacyUserKeys: legacyUserKeys as Record<string, string | null | undefined>,
          serverKeys: serverKeys[spec.keyName] || [],
        });
        if (!resolved) {
          return {
            platform, keyName: spec.keyName, source: 'none',
            ok: false, status: 'no_key',
            error: `No API key configured for ${platform}`,
          };
        }
        const validation = await validateProviderKey(platform, resolved.key, { timeoutMs: 5000 });
        return {
          platform,
          keyName: spec.keyName,
          source: resolved.source,
          ok: validation.ok,
          status: validation.ok ? 'ok' : validation.status,
          error: validation.error,
          httpStatus: validation.httpStatus,
          latencyMs: validation.latencyMs,
        };
      }),
    );

    const allOk = reports.every(r => r.ok);
    return Response.json({ ok: allOk, reports });
  } catch (e) {
    logError('brand.validate_keys_failed', e, { brand_id: id });
    return serverError();
  }
}
