import { pool } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { logError, serverError } from '@/lib/api-error';
import { __cacheStats } from '@/lib/response-cache';
import { getTodayPlatformTotals, COST_DAILY_ALARM_USD } from '@/lib/cost-tracker';

export async function GET(request: Request) {
    const admin = await requireAdmin(request);
    if (admin instanceof Response) return admin;

  try {
        const [
                dbStats,
                tableStats,
                cacheStats,
                cacheHitRate,
                cacheSchema,
                apiKeyStatus,
                recentErrors,
                todayCostByPlatform,
              ] = await Promise.all([
                // Database health
                                          pool.query(`
                                                  SELECT
                                                            (SELECT COUNT(*)::int FROM pg_stat_activity WHERE state = 'active') AS active_connections,
                                                                      (SELECT COUNT(*)::int FROM pg_stat_activity WHERE state = 'idle') AS idle_connections,
                                                                                pg_database_size(current_database())::bigint AS db_size_bytes,
                                                                                          current_database() AS db_name,
                                                                                                    version() AS pg_version
                                                                                                          `),
                // Table row counts
                pool.query(`
                        SELECT relname AS table_name, n_live_tup::int AS row_count
                                FROM pg_stat_user_tables
                                        ORDER BY n_live_tup DESC
                                                LIMIT 20
                                                      `),
                // Cache stats
                pool.query(`
                        SELECT
                                  COUNT(*)::int AS total_entries,
                                            COUNT(*) FILTER (WHERE expires_at < NOW())::int AS expired_entries,
                                                      COUNT(*) FILTER (WHERE expires_at > NOW())::int AS active_entries
                                                              FROM response_cache
                                                                    `).catch(() => ({ rows: [{ total_entries: 0, expired_entries: 0, active_entries: 0 }] })),
                // 24h cache hit rate from prompt_runs. Returns null on tables without
                // the cache_hit column yet (first deploy before runMigrations runs).
                pool.query(`
                        SELECT
                                  COUNT(*) FILTER (WHERE cache_hit) * 100.0 / NULLIF(COUNT(*), 0) AS hit_rate_pct,
                                            COUNT(*) FILTER (WHERE cache_hit)::int AS hits,
                                                      COUNT(*)::int AS total_runs
                                                              FROM prompt_runs
                                                                      WHERE created_at > NOW() - interval '24 hours'
                                                                            `).catch(() => ({ rows: [{ hit_rate_pct: null, hits: 0, total_runs: 0 }] })),
                // DEBUG: Introspect response_cache schema to diagnose set_failed errors
                // in production. Read-only, hardcoded table name (no SQL injection vector),
                // already gated by requireAdmin above. Remove after diagnosis.
                pool.query(`
                        SELECT column_name, data_type, is_nullable, column_default
                                FROM information_schema.columns
                                        WHERE table_schema = 'public' AND table_name = 'response_cache'
                                                ORDER BY ordinal_position
                                                      `).catch(() => ({ rows: [] })),
                // Which API keys are configured (check base key OR numbered variants like _1, _2, etc.)
                pool.query(`SELECT 1`).then(() => {
                          function hasKey(base: string): boolean {
                                      if (process.env[base]) return true;
                                      for (let i = 1; i <= 10; i++) {
                                                    if (process.env[`${base}_${i}`]) return true;
                                      }
                                      return false;
                          }
                          const keys = {
                                      OPENAI_API_KEY: hasKey('OPENAI_API_KEY'),
                                      CLAUDE_API_KEY: hasKey('CLAUDE_API_KEY'),
                                      GEMINI_API_KEY: hasKey('GEMINI_API_KEY'),
                                      GROK_API_KEY: hasKey('GROK_API_KEY'),
                                      PERPLEXITY_API_KEY: hasKey('PERPLEXITY_API_KEY'),
                                      DODO_PAYMENTS_API_KEY: !!process.env.DODO_PAYMENTS_API_KEY,
                                      EMAIL_API_KEY: !!process.env.EMAIL_API_KEY,
                                      ADMIN_SECRET: !!process.env.ADMIN_SECRET,
                          };
                          return keys;
                }),
                // Recent failed API calls
                pool.query(`
                        SELECT platform, model, error, created_at
                                FROM api_logs
                                        WHERE status != 'ok'
                                                ORDER BY created_at DESC
                                                        LIMIT 15
                                                              `).catch(() => ({ rows: [] })),
                // Today's per-platform cost rollup from daily_cost_tracker.
                // Empty array on first deploy (no rows yet for current UTC day).
                getTodayPlatformTotals().catch(() => []),
              ]);

      const dbInfo = dbStats.rows[0];
        const dbSizeMb = Math.round(Number(dbInfo.db_size_bytes) / 1024 / 1024);

      return Response.json({
              database: {
                        name: dbInfo.db_name,
                        version: dbInfo.pg_version,
                        sizeMb: dbSizeMb,
                        activeConnections: dbInfo.active_connections,
                        idleConnections: dbInfo.idle_connections,
              },
              tables: tableStats.rows,
              cache: {
                        ...cacheStats.rows[0],
                        hitRate24h: cacheHitRate.rows[0],
                        schema: cacheSchema.rows,
                        inProcessStats: __cacheStats,
              },
              apiKeys: apiKeyStatus,
              recentErrors: recentErrors.rows,
              costsToday: {
                alarmThresholdUsd: COST_DAILY_ALARM_USD,
                byPlatform: todayCostByPlatform,
              },
              environment: {
                        nodeEnv: process.env.NODE_ENV || 'development',
                        appUrl: process.env.APP_URL || 'not set',
                        hasEncryptionKey: !!process.env.ENCRYPTION_KEY,
              },
      });
  } catch (e) {
        logError('admin_backend.system.failed', e);
        return serverError({ message: 'Failed to load system info' });
  }
}
