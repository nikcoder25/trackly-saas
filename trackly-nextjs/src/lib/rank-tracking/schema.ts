/**
 * Rank tracking - tables.
 *
 * Every table is created lazily and idempotently on first use (the same
 * per-module CREATE TABLE IF NOT EXISTS pattern as nap_audits / geo_audits),
 * so a deploy needs no separate migrate step.
 *
 *   rt_websites      one tracked domain per row, owned by an account
 *   rt_groups        keyword groups inside a website
 *   rt_keywords      a keyword checked from one city on one device; holds
 *                    the schedule (next_check_at) and the state of a check
 *                    that is in flight on a queued provider (pending_*)
 *   rt_checks        one finished check: rank (NULL = not in the depth
 *                    checked), ranking URL, pages paid for, provider, cost,
 *                    credits charged. The credit ledger for rank tracking.
 *   rt_spend         every paid data call (SERP pages, search volume),
 *                    for the admin daily spend view
 *   rt_locations     the provider's location list, cached for the city
 *                    autocomplete
 *   rt_alert_rules / rt_alert_log
 *   rt_reports
 *   rt_client_users  read-only client logins and share links
 */
import { pool } from '@/lib/db';
import { schemaOnce } from '@/lib/schema-once';

export const ensureRankSchema: () => Promise<void> = schemaOnce(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rt_websites (
      id          TEXT PRIMARY KEY,
      account_id  TEXT NOT NULL,
      domain      TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (account_id, domain)
    );
    CREATE TABLE IF NOT EXISTS rt_groups (
      id          TEXT PRIMARY KEY,
      website_id  TEXT NOT NULL REFERENCES rt_websites(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (website_id, name)
    );
    CREATE TABLE IF NOT EXISTS rt_keywords (
      id                TEXT PRIMARY KEY,
      website_id        TEXT NOT NULL REFERENCES rt_websites(id) ON DELETE CASCADE,
      group_id          TEXT REFERENCES rt_groups(id) ON DELETE SET NULL,
      keyword           TEXT NOT NULL,
      location_code     INTEGER,
      location_name     TEXT NOT NULL DEFAULT '',
      device            TEXT NOT NULL DEFAULT 'desktop' CHECK (device IN ('desktop','mobile')),
      language          TEXT NOT NULL DEFAULT 'en',
      frequency         TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('weekly','daily')),
      depth             INTEGER NOT NULL DEFAULT 30 CHECK (depth IN (30,100)),
      starred           BOOLEAN NOT NULL DEFAULT FALSE,
      volume            INTEGER,
      next_check_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      fail_count        INTEGER NOT NULL DEFAULT 0,
      last_error        TEXT,
      pending_provider  TEXT,
      pending_task_id   TEXT,
      pending_page      INTEGER,
      pending_since     TIMESTAMPTZ,
      pending_cost      NUMERIC(10,5) NOT NULL DEFAULT 0,
      pending_pages     INTEGER NOT NULL DEFAULT 0,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (website_id, keyword, location_code, device)
    );
    CREATE INDEX IF NOT EXISTS rt_keywords_due_idx ON rt_keywords(next_check_at) WHERE pending_task_id IS NULL;
    CREATE INDEX IF NOT EXISTS rt_keywords_pending_idx ON rt_keywords(pending_provider) WHERE pending_task_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS rt_keywords_website_idx ON rt_keywords(website_id);
    CREATE TABLE IF NOT EXISTS rt_checks (
      id             BIGSERIAL PRIMARY KEY,
      keyword_id     TEXT NOT NULL REFERENCES rt_keywords(id) ON DELETE CASCADE,
      checked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      rank           INTEGER,
      url            TEXT,
      pages_fetched  INTEGER NOT NULL DEFAULT 0,
      provider       TEXT NOT NULL,
      cost_usd       NUMERIC(10,5) NOT NULL DEFAULT 0,
      credits        INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS rt_checks_keyword_checked_idx ON rt_checks(keyword_id, checked_at);
    CREATE INDEX IF NOT EXISTS rt_checks_checked_idx ON rt_checks(checked_at);
    CREATE TABLE IF NOT EXISTS rt_spend (
      id         BIGSERIAL PRIMARY KEY,
      at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      account_id TEXT,
      provider   TEXT NOT NULL,
      kind       TEXT NOT NULL,
      units      INTEGER NOT NULL DEFAULT 1,
      cost_usd   NUMERIC(10,5) NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS rt_spend_at_idx ON rt_spend(at);
    CREATE TABLE IF NOT EXISTS rt_locations (
      code          INTEGER PRIMARY KEY,
      name          TEXT NOT NULL,
      country_iso   TEXT,
      type          TEXT,
      name_lc       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS rt_locations_name_idx ON rt_locations(name_lc text_pattern_ops);
    CREATE TABLE IF NOT EXISTS rt_alert_rules (
      id            TEXT PRIMARY KEY,
      account_id    TEXT NOT NULL,
      type          TEXT NOT NULL,
      threshold     INTEGER,
      website_id    TEXT REFERENCES rt_websites(id) ON DELETE CASCADE,
      group_id      TEXT REFERENCES rt_groups(id) ON DELETE CASCADE,
      starred_only  BOOLEAN NOT NULL DEFAULT FALSE,
      channels      TEXT[] NOT NULL DEFAULT ARRAY['email'],
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS rt_alert_rules_account_idx ON rt_alert_rules(account_id);
    CREATE TABLE IF NOT EXISTS rt_alert_log (
      id          BIGSERIAL PRIMARY KEY,
      account_id  TEXT NOT NULL,
      rule_id     TEXT REFERENCES rt_alert_rules(id) ON DELETE SET NULL,
      keyword_id  TEXT REFERENCES rt_keywords(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL DEFAULT 'alert',
      message     TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS rt_alert_log_account_idx ON rt_alert_log(account_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS rt_reports (
      id            TEXT PRIMARY KEY,
      account_id    TEXT NOT NULL,
      title         TEXT NOT NULL,
      format        TEXT NOT NULL,
      website_id    TEXT REFERENCES rt_websites(id) ON DELETE CASCADE,
      group_id      TEXT REFERENCES rt_groups(id) ON DELETE SET NULL,
      starred_only  BOOLEAN NOT NULL DEFAULT FALSE,
      include_ai    BOOLEAN NOT NULL DEFAULT TRUE,
      use_logo      BOOLEAN NOT NULL DEFAULT TRUE,
      start_date    DATE,
      end_date      DATE,
      schedule      TEXT CHECK (schedule IN ('weekly','monthly')),
      recipients    TEXT[] NOT NULL DEFAULT '{}',
      token_hash    TEXT,
      file_url      TEXT,
      last_sent_at  TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS rt_reports_account_idx ON rt_reports(account_id);
    CREATE TABLE IF NOT EXISTS rt_client_users (
      id            TEXT PRIMARY KEY,
      account_id    TEXT NOT NULL,
      name          TEXT NOT NULL DEFAULT '',
      email         TEXT,
      scope         TEXT NOT NULL CHECK (scope IN ('websites','groups','starred')),
      website_ids   TEXT[] NOT NULL DEFAULT '{}',
      group_ids     TEXT[] NOT NULL DEFAULT '{}',
      status        TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','revoked')),
      token_hash    TEXT NOT NULL UNIQUE,
      last_login_at TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS rt_client_users_account_idx ON rt_client_users(account_id);
  `);
});
