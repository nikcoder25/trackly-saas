/**
 * Tenant API key per-platform - update (PUT), delete (DELETE),
 * and re-validate (POST).
 *
 * `[platform]` is the logical key name (`openai`, `claude`, ...) that
 * matches `users.api_keys` and the `tenant_api_keys.platform` column.
 */
import { auditLog } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { logError, badRequest, serverError, unauthorized, notFound } from '@/lib/api-error';
import { logger } from '@/lib/logger';
import {
  upsertTenantKey,
  deleteTenantKey,
  revalidateTenantKey,
  isValidTenantPlatform,
  isPlausibleRawKey,
} from '@/lib/tenant-keys';

type Params = { params: Promise<{ platform: string }> };

export async function PUT(request: Request, { params }: Params) {
  const user = verifyRequestAuth(request);
  if (!user) return unauthorized('No token');

  const { platform } = await params;
  if (!isValidTenantPlatform(platform)) return badRequest('Unknown platform');

  // Same outbound-validation budget as POST /api/tenant-keys.
  const rl = await checkUserIpRateLimit('tenant_keys_save', user.id, getClientIp(request), {
    user: { max: 30, windowMs: 60 * 60 * 1000 },
    ip: { max: 60, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  let body: { apiKey?: unknown; label?: unknown };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON');
  }
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey : '';
  const label = typeof body.label === 'string' ? body.label.slice(0, 100) : null;
  if (!apiKey) return badRequest('apiKey is required');
  if (!isPlausibleRawKey(apiKey)) return badRequest('API key shape is not valid');

  try {
    const { key, validation } = await upsertTenantKey({
      tenantId: user.id,
      platform,
      rawKey: apiKey,
      label,
      actorId: user.id,
    });
    if (!validation.ok) {
      auditLog(
        user.id,
        'tenant_key.validation_failed',
        'tenant_key',
        platform,
        { status: validation.status, http_status: validation.httpStatus, latency_ms: validation.latencyMs },
        getClientIp(request),
      );
      return Response.json(
        {
          error: validation.error || 'Validation failed',
          status: validation.status,
          httpStatus: validation.httpStatus,
          latencyMs: validation.latencyMs,
        },
        { status: validation.status === 'invalid' ? 400 : 502 },
      );
    }
    auditLog(
      user.id,
      'tenant_key.update',
      'tenant_key',
      platform,
      { key_id: key.id, validation_latency_ms: validation.latencyMs },
      getClientIp(request),
    );
    logger.info('tenant_keys.update_ok', {
      tenant_id: user.id,
      platform,
      key_id: key.id,
      validation_latency_ms: validation.latencyMs,
    });
    return Response.json({ key, validation });
  } catch (e) {
    logError('tenant_keys.update_failed', e, { tenant_id: user.id, platform });
    return serverError();
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const user = verifyRequestAuth(request);
  if (!user) return unauthorized('No token');

  const { platform } = await params;
  if (!isValidTenantPlatform(platform)) return badRequest('Unknown platform');

  try {
    const removed = await deleteTenantKey(user.id, platform);
    if (!removed) return notFound('No tenant key configured for that platform');
    auditLog(
      user.id,
      'tenant_key.delete',
      'tenant_key',
      platform,
      {},
      getClientIp(request),
    );
    return Response.json({ ok: true });
  } catch (e) {
    logError('tenant_keys.delete_failed', e, { tenant_id: user.id, platform });
    return serverError();
  }
}

export async function POST(request: Request, { params }: Params) {
  // Manual re-validation - re-runs validateProviderKey against the
  // provider and refreshes last_validated_at. Used by the "re-validate"
  // button on /dashboard/platforms.
  const user = verifyRequestAuth(request);
  if (!user) return unauthorized('No token');

  const { platform } = await params;
  if (!isValidTenantPlatform(platform)) return badRequest('Unknown platform');

  // Tighter than save: revalidate is idempotent and cheap, but each
  // call still hits the provider, so 60/hr per user is a safe ceiling.
  const rl = await checkUserIpRateLimit('tenant_keys_revalidate', user.id, getClientIp(request), {
    user: { max: 60, windowMs: 60 * 60 * 1000 },
    ip: { max: 120, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  try {
    const validation = await revalidateTenantKey(user.id, platform);
    if (validation.status === 'invalid' && (validation as { error?: string }).error === 'No tenant key configured') {
      return notFound('No tenant key configured for that platform');
    }
    auditLog(
      user.id,
      'tenant_key.revalidate',
      'tenant_key',
      platform,
      { ok: validation.ok, status: validation.status },
      getClientIp(request),
    );
    return Response.json({ validation });
  } catch (e) {
    logError('tenant_keys.revalidate_failed', e, { tenant_id: user.id, platform });
    return serverError();
  }
}
