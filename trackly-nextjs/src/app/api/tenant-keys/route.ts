/**
 * Tenant API key configuration — list + create.
 *
 * Tenant === brand owner (the authenticated user) for now. Keys are
 * encrypted at rest, validated against the upstream provider before
 * being persisted, and only ever returned masked. Rate limiting is
 * stricter than typical settings routes because each save fires a
 * real outbound HTTP request to OpenAI/Anthropic/etc.
 */
import { auditLog } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { logError, badRequest, serverError, unauthorized } from '@/lib/api-error';
import { logger } from '@/lib/logger';
import {
  listTenantKeys,
  upsertTenantKey,
  isValidTenantPlatform,
  isPlausibleRawKey,
} from '@/lib/tenant-keys';

export async function GET(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return unauthorized('No token');

  try {
    const keys = await listTenantKeys(user.id);
    return Response.json({ keys });
  } catch (e) {
    logError('tenant_keys.list_failed', e, { tenant_id: user.id });
    return serverError();
  }
}

export async function POST(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return unauthorized('No token');

  // Each save runs an outbound provider validation request. 30/hr per
  // user is generous for legitimate setup flows but bounds the cost of
  // a stolen session being used to enumerate provider behaviour.
  const rl = await checkUserIpRateLimit('tenant_keys_save', user.id, getClientIp(request), {
    user: { max: 30, windowMs: 60 * 60 * 1000 },
    ip: { max: 60, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  let body: { platform?: unknown; apiKey?: unknown; label?: unknown };
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON');
  }
  const platform = typeof body.platform === 'string' ? body.platform.trim() : '';
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey : '';
  const label = typeof body.label === 'string' ? body.label.slice(0, 100) : null;

  if (!platform) return badRequest('platform is required');
  if (!isValidTenantPlatform(platform)) return badRequest('Unknown platform');
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
      // Audit unsuccessful attempts so a brute-forcer leaves a trail.
      // Never log the key itself — the audit row carries platform + status only.
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
      'tenant_key.upsert',
      'tenant_key',
      platform,
      { key_id: key.id, label, validation_latency_ms: validation.latencyMs },
      getClientIp(request),
    );
    logger.info('tenant_keys.upsert_ok', {
      tenant_id: user.id,
      platform,
      key_id: key.id,
      validation_latency_ms: validation.latencyMs,
    });
    return Response.json({ key, validation });
  } catch (e) {
    logError('tenant_keys.upsert_failed', e, { tenant_id: user.id, platform });
    return serverError();
  }
}
