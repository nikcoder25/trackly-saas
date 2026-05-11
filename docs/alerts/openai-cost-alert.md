# OpenAI daily-spend anomaly alert

## Trigger

Fire when **today's** OpenAI spend (sum of `daily_cost_tracker.cost_usd`
where `day = CURRENT_DATE`, all platforms) exceeds **1.3×** the trailing
7-day rolling average (excluding today).

## Data source

Postgres table `daily_cost_tracker` (see
`trackly-nextjs/src/lib/cost-tracker.ts`). Surface via the existing
endpoint: `GET /api/admin-backend/system` → `costsToday.byPlatform` and
a new `costs7dAvg` field.

## SQL the alert evaluator runs

```sql
WITH today AS (
  SELECT COALESCE(SUM(cost_usd), 0) AS usd
    FROM daily_cost_tracker
   WHERE day = CURRENT_DATE
),
baseline AS (
  SELECT COALESCE(AVG(daily), 0) AS avg_usd
    FROM (
      SELECT day, SUM(cost_usd) AS daily
        FROM daily_cost_tracker
       WHERE day >= CURRENT_DATE - INTERVAL '7 days'
         AND day <  CURRENT_DATE
       GROUP BY day
    ) d
)
SELECT today.usd,
       baseline.avg_usd,
       CASE WHEN baseline.avg_usd > 0
            THEN today.usd / baseline.avg_usd
            ELSE NULL END AS ratio
  FROM today, baseline;
```

Alert when `ratio >= 1.3` **AND** `today.usd >= $5` (the floor avoids
paging on $0.50 → $1 noise early in the day).

## CloudWatch (if metrics are shipped)

- Metric: `OpenAI/DailySpendUsd` (custom, dimension `Platform`)
- Period: 1 day, Statistic: Sum, single datapoint
- Alarm math: `IF(m1 / AVG(m1, 7d-prior, 1d-prior) >= 1.3 AND m1 >= 5, 1, 0)`
- Action: SNS → Slack `#alerts-billing`

## Sentry (if preferred)

Add a metric alert on custom metric `openai.cost.daily_usd` (tag
`platform`), condition `value` greater than `percent_change(7d) >= 30%`,
threshold `$5` floor, environment `production`.

## Severity

- **Warning** at `ratio >= 1.3`
- **Page** at `ratio >= 2.0` or `today.usd >= alarmThresholdUsd × 2`
  (currently `$3 × 2 = $6`)

## Runbook

1. Hit `/api/admin-backend/system` — check `__cacheStats` hit rate and
   `costsToday.byPlatform`.
2. If hit rate `< 50%`, suspect a cache/schema regression — see
   `trackly-nextjs/src/lib/response-cache.ts` and the May 6-8 incident
   (commits `4dc4299` / `a5b64c1` / `b25a952`).
3. If a single platform dominates, check rate-limit / retry logs in
   `trackly-nextjs/src/lib/ai-platforms.ts` (`withDeepRetry`) for a 429
   storm amplifying call counts.
4. Kill switch: confirm `RESPONSE_CACHE_DISABLED` is not accidentally
   set to `true`. Per-platform throttle: lower the daily web-search
   budget introduced in `df8c220`.

## Related changes

- `fix(cache): bump search TTL 6h→24h` — aligns cache TTL with daily
  cron cadence so search-enabled rows survive between runs.
- Follow-up (separate PR after 24h soak): add `city` to the cache key
  and add a cross-tenant dedup regression test.
