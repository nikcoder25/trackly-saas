/**
 * Per-platform daily web-search budget.
 *
 * Counts how many search-enabled provider calls (Perplexity, ChatGPT
 * search-preview / search-api) have been issued cluster-wide per UTC day,
 * and lets callers atomically reserve a slot. When the budget is
 * exhausted the caller can ask for a non-search fallback model — for
 * ChatGPT that's `gpt-5.4`; Perplexity has no non-search variant, so the
 * caller logs and proceeds (fail-open at the platform level).
 *
 * Design decisions:
 *   - Daily reset is wall-clock UTC (key embeds YYYY-MM-DD). The TTL is
 *     90_000s (~25h) so a key from "yesterday" auto-evicts.
 *   - Reservation is an atomic Lua check-then-INCR; concurrent callers
 *     can't race past the limit even across pods.
 *   - Fail-open: when REDIS_URL is unset, Redis is down, or the feature
 *     flag is off, `tryConsumeSearchBudget` resolves with `allowed=true`.
 *     Search budgeting is a quota-saver, not a safety mechanism, so a
 *     telemetry outage must never block customer traffic. Operators who
 *     want fail-closed on Redis loss already have AI_REDIS_REQUIRED.
 *   - Enabled by default. The web_search tool bills $25/1k calls on
 *     gpt-4o-search-preview / $50/1k on gpt-5-search-api and dominates
 *     OpenAI spend; the May 11 incident (~$48/day on web_search alone)
 *     showed that "off-by-default + unset" is the wrong posture. Set
 *     `AI_SEARCH_BUDGET_ENABLED=false` to opt out.
 *   - ChatGPT default cap is 150 calls/day (~$3.75/day at $25/1k). Other
 *     platforms have no default cap (set the env override to add one).
 *     Perplexity is search-native and fail-opens on exhaustion, so a
 *     default cap there would only produce log noise.
 */
import { getLimiterRedis, type RedisLikeClient } from './redis';
import { logger } from './logger';

const KEY_TTL_SECONDS = 90_000;

// Per-platform default daily caps. Only ChatGPT has a default — it's
// the platform with billable web_search tool calls AND a useful
// non-search fallback. Perplexity charges per query, not per tool
// invocation, and Claude/Gemini/Grok don't have a billable tool. An
// env override (AI_SEARCH_BUDGET_<PLATFORM>) always takes precedence.
const PLATFORM_DEFAULT_DAILY_CAP: Record<string, number> = {
  ChatGPT: 150,
};

export type SearchBudgetReason =
  | 'disabled'
  | 'no-redis'
  | 'redis-error'
  | 'over-limit'
  | 'consumed';

export interface BudgetCheckResult {
  /** True when the caller is cleared to make the search call. */
  allowed: boolean;
  /** Daily counter value AFTER this call (or current value when denied). */
  used: number;
  /** Resolved daily limit for the platform. 0 means "no limit". */
  limit: number;
  /** Math.max(limit - used, 0) for caller convenience. */
  remaining: number;
  reason: SearchBudgetReason;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function budgetKey(platform: string, date: string): string {
  return `search-budget:${platform}:${date}`;
}

function envInt(name: string): number | undefined {
  const raw = process.env[name];
  if (raw == null || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

/**
 * Resolve the daily limit for a platform. Precedence (first hit wins):
 *   1. AI_SEARCH_BUDGET_<PLATFORM> env override
 *   2. AI_SEARCH_BUDGET_DEFAULT env override
 *   3. PLATFORM_DEFAULT_DAILY_CAP (ChatGPT: 150)
 *   4. 0 (no limit)
 * Set the platform-specific env var to 0 to opt that platform out
 * without disabling the feature globally.
 */
export function getSearchBudgetLimit(platform: string): number {
  const platformKey = `AI_SEARCH_BUDGET_${platform.toUpperCase()}`;
  const platformOverride = envInt(platformKey);
  if (platformOverride != null) return platformOverride;
  const defaultLimit = envInt('AI_SEARCH_BUDGET_DEFAULT');
  if (defaultLimit != null) return defaultLimit;
  return PLATFORM_DEFAULT_DAILY_CAP[platform] ?? 0;
}

/**
 * For platforms that can usefully fall back to a non-search model, return
 * the fallback model id. Returns null when no in-house alternative is
 * meaningful (e.g. Perplexity is search-native — there's nothing to fall
 * back to). Mirrors `resolveChatGPTModel` but is budget-driven, not
 * intent-driven, so it kicks in even for queries the smart router decided
 * to keep on the search tier.
 */
export function getSearchFallbackModel(
  platform: string,
  model: string,
): string | null {
  if (platform === 'ChatGPT' && model.includes('search')) return 'gpt-5.4';
  return null;
}

// Atomic check-then-INCR. Returns `[allowed, used, limit]`.
//   KEYS[1] = daily counter key
//   ARGV[1] = limit (>= 1; the caller short-circuits limit==0)
//   ARGV[2] = ttl seconds applied on first set
const CONSUME_LUA = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local limit = tonumber(ARGV[1])
if current >= limit then
  return {0, current, limit}
end
local newVal = redis.call('INCR', KEYS[1])
if newVal == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end
return {1, newVal, limit}
`;

function parseConsumeResult(raw: unknown, limit: number): {
  allowed: boolean; used: number; limit: number;
} {
  if (!Array.isArray(raw) || raw.length < 3) {
    return { allowed: true, used: 0, limit };
  }
  const [allowed, used, parsedLimit] = raw as [unknown, unknown, unknown];
  return {
    allowed: Number(allowed) === 1,
    used: Number(used) || 0,
    limit: Number(parsedLimit) || limit,
  };
}

export interface ConsumeOptions {
  /**
   * When true, peek at the counter without incrementing. Useful for
   * status endpoints that want to surface "remaining" without reserving
   * a slot. Default false.
   */
  dryRun?: boolean;
}

/**
 * Atomically reserve one search-call slot for `platform` for the current
 * UTC day. Enabled by default; the resolved per-platform limit (0 →
 * always allowed) still gates per-platform behaviour. Set
 * AI_SEARCH_BUDGET_ENABLED=false to bypass the budget globally.
 */
export async function tryConsumeSearchBudget(
  platform: string,
  opts: ConsumeOptions = {},
): Promise<BudgetCheckResult> {
  // Kill switch: opt-out only. Any value other than the literal string
  // "false" leaves the budget engaged.
  if (process.env.AI_SEARCH_BUDGET_ENABLED === 'false') {
    return { allowed: true, used: 0, limit: 0, remaining: 0, reason: 'disabled' };
  }
  const limit = getSearchBudgetLimit(platform);
  if (limit <= 0) {
    return { allowed: true, used: 0, limit: 0, remaining: 0, reason: 'disabled' };
  }
  const client = getLimiterRedis();
  if (!client) {
    return { allowed: true, used: 0, limit, remaining: limit, reason: 'no-redis' };
  }
  const key = budgetKey(platform, todayUtc());
  if (opts.dryRun) {
    try {
      const raw = await (client as RedisLikeClient).get(key);
      const used = raw == null ? 0 : Number(raw) || 0;
      const remaining = Math.max(limit - used, 0);
      const allowed = used < limit;
      return {
        allowed,
        used,
        limit,
        remaining,
        reason: allowed ? 'consumed' : 'over-limit',
      };
    } catch (err) {
      logger.warn('search_budget.peek_failed', {
        platform, errorMessage: (err as Error).message,
      });
      return { allowed: true, used: 0, limit, remaining: limit, reason: 'redis-error' };
    }
  }
  try {
    const raw = await (client as RedisLikeClient).eval(
      CONSUME_LUA,
      1,
      key,
      String(limit),
      String(KEY_TTL_SECONDS),
    );
    const parsed = parseConsumeResult(raw, limit);
    const remaining = Math.max(parsed.limit - parsed.used, 0);
    return {
      allowed: parsed.allowed,
      used: parsed.used,
      limit: parsed.limit,
      remaining,
      reason: parsed.allowed ? 'consumed' : 'over-limit',
    };
  } catch (err) {
    logger.warn('search_budget.consume_failed', {
      platform, errorMessage: (err as Error).message,
    });
    // Fail-open: a Redis hiccup must never block paid traffic.
    return { allowed: true, used: 0, limit, remaining: limit, reason: 'redis-error' };
  }
}

export interface ResolvedSearchModel {
  /** Model the caller should actually send to the provider. */
  model: string;
  /** True iff the resolved model still hits the provider's search path. */
  searchEnabled: boolean;
  /** True when budget exhaustion forced a downgrade from the original. */
  downgraded: boolean;
  budget: BudgetCheckResult;
}

/**
 * Combined helper for callers: given a platform + the model the caller
 * intends to use, decide whether the budget allows the search call. When
 * the budget is exhausted AND a non-search fallback exists (ChatGPT
 * search-preview → gpt-4o), return that fallback with `searchEnabled=false`
 * so the caller's cache key, prompt shape, and post-processing all flip
 * onto the non-search path. When no fallback exists, the caller is left
 * on the original search model — fail-open, never block traffic.
 *
 * `isSearchEnabled` from response-cache.ts is the source of truth for
 * "does this (platform, model) pair hit the search path", so we accept
 * it as a parameter to avoid an import cycle (response-cache → ai-platforms
 * → search-budget → response-cache would close the loop).
 */
export async function resolveSearchModelWithBudget(params: {
  platform: string;
  model: string;
  isSearch: boolean;
}): Promise<ResolvedSearchModel> {
  const { platform, model, isSearch } = params;
  if (!isSearch) {
    return {
      model,
      searchEnabled: false,
      downgraded: false,
      budget: { allowed: true, used: 0, limit: 0, remaining: 0, reason: 'disabled' },
    };
  }
  const budget = await tryConsumeSearchBudget(platform);
  if (budget.allowed) {
    return { model, searchEnabled: true, downgraded: false, budget };
  }
  const fallback = getSearchFallbackModel(platform, model);
  if (fallback) {
    logger.warn('search_budget.exhausted_fallback', {
      platform, fromModel: model, toModel: fallback,
      used: budget.used, limit: budget.limit,
    });
    return { model: fallback, searchEnabled: false, downgraded: true, budget };
  }
  // No useful fallback — fail-open at the platform level. Operators see
  // the warning and can either raise the limit or accept the overage.
  logger.warn('search_budget.exhausted_no_fallback', {
    platform, model, used: budget.used, limit: budget.limit,
  });
  return { model, searchEnabled: true, downgraded: false, budget };
}

/**
 * Test-only helpers. Exposed via __test__ rather than as a top-level
 * export so the production surface stays small.
 */
export const __test__ = {
  budgetKey,
  todayUtc,
  CONSUME_LUA,
  KEY_TTL_SECONDS,
};
