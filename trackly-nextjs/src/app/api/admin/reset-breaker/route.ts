/**
 * Reset the platform-wide rate-limit circuit breaker for one AI provider.
 *
 * POST /api/admin/reset-breaker?platform=<gemini|chatgpt|perplexity|claude|grok>
 * Auth: admin role only (see @/lib/admin-auth).
 *
 * Two breaker layers exist (`src/lib/ai-platforms.ts` in-process Map +
 * `src/lib/redis-platform-state.ts` Redis keys); a clean reset has to
 * wipe both. The in-process reset is per-pod and synchronous; the Redis
 * DEL clears `ai-limiter:breaker:open:<Platform>` and
 * `ai-limiter:breaker:failures:<Platform>` so sibling pods stop seeing
 * the open signal.
 *
 * NOT a scheduled job. Intended for on-call use after fixing the root
 * cause of a provider rate-limit incident (e.g. expanding a Gemini
 * quota or rotating in fresh keys) so brand runs resume immediately
 * instead of waiting out the cooldown window.
 */
import { requireAdmin } from '@/lib/admin-auth';
import { resetPlatformBreaker } from '@/lib/ai-platforms';
import { clearBreaker } from '@/lib/redis-platform-state';
import { logger } from '@/lib/logger';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

// Lowercased operator-facing input → canonical TitleCase used by every
// `recordPlatformRateLimit` call site in `ai-platforms.ts`. Explicit map
// rather than `Object.keys(PLATFORM_LIMITS)` so a future limit-config
// change can't silently expand the surface this endpoint can touch.
const PLATFORM_ALIASES: Record<string, string> = {
  gemini: 'Gemini',
  chatgpt: 'ChatGPT',
  perplexity: 'Perplexity',
  claude: 'Claude',
  grok: 'Grok',
};

export async function POST(request: Request): Promise<Response> {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const rl = await checkUserIpRateLimit(
    'admin_reset_breaker',
    admin.id,
    getClientIp(request),
    { user: { max: 10, windowMs: 60 * 60 * 1000 } },
  );
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const url = new URL(request.url);
  const raw = url.searchParams.get('platform');
  if (!raw) {
    return Response.json(
      {
        error: 'Missing platform query param',
        usage: 'POST /api/admin/reset-breaker?platform=<name>',
        allowed: Object.keys(PLATFORM_ALIASES),
      },
      { status: 400 },
    );
  }
  const canonical = PLATFORM_ALIASES[raw.trim().toLowerCase()];
  if (!canonical) {
    return Response.json(
      {
        error: `Unknown platform "${raw}"`,
        allowed: Object.keys(PLATFORM_ALIASES),
      },
      { status: 400 },
    );
  }

  // In-process reset is sync, no failure mode — clears the per-pod
  // `_platformBreaker` Map entry and any cooldown deadline.
  resetPlatformBreaker(canonical);

  // Redis DEL both breaker keys. `clearBreaker` returns `available:false`
  // when there is no Redis client (REDIS_URL unset / distributed limiter
  // off), in which case the in-process reset above is the meaningful
  // action on this pod and the response reflects that.
  let redisAvailable = true;
  let redisDeleted = 0;
  let redisError: string | null = null;
  try {
    const r = await clearBreaker(canonical);
    redisAvailable = r.available;
    redisDeleted = r.deleted;
  } catch (err) {
    // The in-process reset already happened — surface partial state to
    // the operator rather than pretending nothing happened.
    redisError = (err as Error).message;
  }

  logger.info('admin.reset_breaker', {
    admin_id: admin.id,
    platform: canonical,
    in_process_reset: true,
    redis_available: redisAvailable,
    redis_deleted: redisDeleted,
    redis_error: redisError,
  });

  if (redisError) {
    return Response.json(
      {
        ok: false,
        platform: canonical,
        in_process_reset: true,
        redis_available: redisAvailable,
        redis_deleted: 0,
        error: 'redis_del_failed',
        details: redisError,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    platform: canonical,
    in_process_reset: true,
    redis_available: redisAvailable,
    redis_deleted: redisDeleted,
    timestamp: new Date().toISOString(),
  });
}
