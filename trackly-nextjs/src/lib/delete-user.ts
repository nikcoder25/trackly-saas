/**
 * Permanent account deletion, shared by self-service delete
 * (/api/auth/account), the admin panel (/api/admin/users/[id]) and the
 * admin backend (/api/admin-backend/users/[id]).
 *
 * Order matters:
 *   1. Cancel the Dodo subscription first. If that fails with a real error
 *      we abort: deleting the user row would drop settings.subscription_id
 *      and leave the customer billed forever with no account to cancel
 *      from. 404/409/410 from Dodo mean "already gone" and are fine.
 *   2. Delete every user-owned and brand-owned row in ONE transaction, so a
 *      failure halfway never leaves orphans behind.
 *
 * audit_logs rows are intentionally kept: the audit trail must outlive the
 * account it describes.
 *
 * Tables that cascade off users(id) or brands(id) via ON DELETE CASCADE are
 * not listed (user_sessions, billing_events, signup_attribution, report_*,
 * site_connection, fix_automation, fix_seo_brains, fix_batches, fixes,
 * fix_connections, geo_audit_results, rt_groups, rt_keywords, rt_checks).
 * Several tables are created lazily by their own module, so any that do
 * not exist yet on this database are skipped rather than failing the
 * transaction.
 */
import { pool, safeConnect } from '@/lib/db';
import { logger } from '@/lib/logger';
import { cancelDodoSubscription } from '@/lib/dodo-subscriptions';

const OWNED_BRANDS = 'SELECT id FROM brands WHERE user_id = $1';

/**
 * [table, DELETE statement]. Order: children before parents. $1 is always
 * the user id.
 */
export const DELETE_STATEMENTS: ReadonlyArray<readonly [string, string]> = [
  // Brand-owned rows with no FK to brands.
  ['accuracy_issues', `DELETE FROM accuracy_issues WHERE brand_id IN (${OWNED_BRANDS})`],
  ['citations', `DELETE FROM citations WHERE brand_id IN (${OWNED_BRANDS})`],
  ['recommendations', `DELETE FROM recommendations WHERE brand_id IN (${OWNED_BRANDS})`],
  ['brand_facts', `DELETE FROM brand_facts WHERE brand_id IN (${OWNED_BRANDS})`],
  ['prompt_fanout', `DELETE FROM prompt_fanout WHERE brand_id IN (${OWNED_BRANDS})`],
  ['prompt_meta', `DELETE FROM prompt_meta WHERE brand_id IN (${OWNED_BRANDS})`],
  ['prompt_runs', `DELETE FROM prompt_runs WHERE brand_id IN (${OWNED_BRANDS})`],
  ['prompt_discovery_jobs', `DELETE FROM prompt_discovery_jobs WHERE user_id = $1 OR brand_id IN (${OWNED_BRANDS})`],
  ['fix_seen_pages', `DELETE FROM fix_seen_pages WHERE brand_id IN (${OWNED_BRANDS})`],
  ['fix_keyword_metrics', `DELETE FROM fix_keyword_metrics WHERE brand_id IN (${OWNED_BRANDS})`],
  ['fix_serp_cache', `DELETE FROM fix_serp_cache WHERE brand_id IN (${OWNED_BRANDS})`],
  ['fix_page_metrics', `DELETE FROM fix_page_metrics WHERE brand_id IN (${OWNED_BRANDS})`],
  ['fix_connector_handshakes', `DELETE FROM fix_connector_handshakes WHERE user_id = $1 OR brand_id IN (${OWNED_BRANDS})`],
  ['fix_events', `DELETE FROM fix_events WHERE user_id = $1 OR brand_id IN (${OWNED_BRANDS})`],
  ['active_runs', `DELETE FROM active_runs WHERE user_id = $1 OR brand_id IN (${OWNED_BRANDS})`],
  ['alert_rules', `DELETE FROM alert_rules WHERE user_id = $1 OR brand_id IN (${OWNED_BRANDS})`],
  // nap_audits.brand_id is nullable (pre-scoping rows), so the brand
  // cascade alone would miss some.
  ['nap_audits', 'DELETE FROM nap_audits WHERE user_id = $1'],
  ['geo_audits', 'DELETE FROM geo_audits WHERE user_id = $1'],
  ['page_score_snapshots', 'DELETE FROM page_score_snapshots WHERE user_id = $1'],

  // Rank tracking. account_id is the user id and has no FK to users.
  // rt_groups / rt_keywords / rt_checks cascade off rt_websites.
  ['rt_alert_log', 'DELETE FROM rt_alert_log WHERE account_id = $1'],
  ['rt_alert_rules', 'DELETE FROM rt_alert_rules WHERE account_id = $1'],
  ['rt_reports', 'DELETE FROM rt_reports WHERE account_id = $1'],
  ['rt_client_users', 'DELETE FROM rt_client_users WHERE account_id = $1'],
  ['rt_spend', 'DELETE FROM rt_spend WHERE account_id = $1'],
  ['rt_websites', 'DELETE FROM rt_websites WHERE account_id = $1'],

  // User-owned rows.
  ['team_members', 'DELETE FROM team_members WHERE owner_id = $1 OR member_id = $1'],
  ['tenant_api_keys', 'DELETE FROM tenant_api_keys WHERE tenant_id = $1'],
  ['tenant_cost_events', 'DELETE FROM tenant_cost_events WHERE tenant_id = $1'],
  ['api_keys', 'DELETE FROM api_keys WHERE user_id = $1'],
  ['oauth_codes', 'DELETE FROM oauth_codes WHERE user_id = $1'],
  ['oauth_tokens', 'DELETE FROM oauth_tokens WHERE user_id = $1'],
  ['notifications', 'DELETE FROM notifications WHERE user_id = $1'],
  ['api_logs', 'DELETE FROM api_logs WHERE user_id = $1'],
  ['password_reset_tokens', 'DELETE FROM password_reset_tokens WHERE user_id = $1'],
  ['trial_usage', 'DELETE FROM trial_usage WHERE user_id = $1'],
  ['usage_counters', 'DELETE FROM usage_counters WHERE user_id = $1'],
  ['prompt_cooldowns', 'DELETE FROM prompt_cooldowns WHERE user_id = $1'],

  // Parents last. brands cascades report_*, site_connection, fix_* and
  // geo_audit_results.
  ['brands', 'DELETE FROM brands WHERE user_id = $1'],
];

export type DeleteUserResult =
  | { ok: true; email: string | null; cancelledSubscriptionId: string | null }
  | { ok: false; status: 404 | 502 | 503; error: string };

export async function deleteUserAccount(userId: string): Promise<DeleteUserResult> {
  const found = await pool.query(
    `SELECT email, settings->>'subscription_id' AS subscription_id FROM users WHERE id = $1`,
    [userId]
  );
  if (!found.rows.length) return { ok: false, status: 404, error: 'User not found' };
  const email: string | null = found.rows[0].email ?? null;
  const subscriptionId: string | null = found.rows[0].subscription_id || null;

  // 1. Stop billing before anything is deleted.
  if (subscriptionId) {
    const cancel = await cancelDodoSubscription(subscriptionId);
    if (!cancel.ok) {
      logger.error('account.delete.subscription_cancel_failed', {
        userId,
        subscriptionId,
        reason: cancel.reason,
        status: cancel.reason === 'provider_error' ? cancel.status : undefined,
      });
      if (cancel.reason === 'not_configured') {
        return { ok: false, status: 503, error: 'Payment system not configured; the subscription could not be cancelled, so the account was not deleted.' };
      }
      return { ok: false, status: 502, error: 'Could not cancel the subscription with the payment provider, so the account was not deleted. Please try again or contact support.' };
    }
    if (cancel.alreadyCancelled) {
      logger.info('account.delete.subscription_already_cancelled', { userId, subscriptionId, status: cancel.status });
    }
  }

  // 2. Delete everything in one transaction.
  const client = await safeConnect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
      [DELETE_STATEMENTS.map(([t]) => t)]
    );
    const present = new Set((existing.rows as Array<{ table_name: string }>).map((r) => r.table_name));
    for (const [table, sql] of DELETE_STATEMENTS) {
      if (!present.has(table)) continue;
      await client.query(sql, [userId]);
    }
    // Databases bootstrapped by the old Express app can carry an FK from
    // audit_logs.user_id to users(id) (auditLog() handles its violation).
    // Keep those rows: detach them from the user and record who they
    // belonged to, so deleting the users row neither fails nor cascades.
    const auditFk = await client.query(
      `SELECT 1 FROM pg_constraint
        WHERE contype = 'f' AND conrelid = to_regclass('audit_logs') AND confrelid = to_regclass('users')
        LIMIT 1`
    );
    if (auditFk.rows.length) {
      await client.query(
        `UPDATE audit_logs
            SET details = COALESCE(details, '{}'::jsonb) || jsonb_build_object('deleted_user_id', user_id),
                user_id = NULL
          WHERE user_id = $1`,
        [userId]
      );
    }
    const del = await client.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);
    if (!del.rows.length) {
      await client.query('ROLLBACK');
      return { ok: false, status: 404, error: 'User not found' };
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (subscriptionId) {
      // The subscription is already cancelled at Dodo but the account still
      // exists. Retrying the delete is safe (Dodo answers 404/409/410).
      logger.error('account.delete.db_failed_after_cancel', { userId, subscriptionId, error: (e as Error).message });
    }
    throw e;
  } finally {
    client.release();
  }

  return { ok: true, email, cancelledSubscriptionId: subscriptionId };
}
