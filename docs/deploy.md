# Deployment

This document covers how `trackly-saas` is deployed to DigitalOcean App
Platform, with a focus on the autoscaling configuration introduced for
issue [#408](https://github.com/nikcoder25/trackly-saas/issues/408).

## Production target

| Field | Value |
|---|---|
| Provider | DigitalOcean App Platform |
| App name | `oyster-app` |
| App ID | `6430b14a-cbe5-4476-a4cf-9c4398c15c3e` |
| Service | `trackly-saas` |
| Source | `trackly-nextjs/` (Next.js, Node runtime) |
| Branch | `main` (auto-deploys on push) |
| Region | `nyc` |
| Console | <https://cloud.digitalocean.com/apps/6430b14a-cbe5-4476-a4cf-9c4398c15c3e> |

The canonical app spec is checked in at [`.do/app.yaml`](../.do/app.yaml).

## Applying the spec

```bash
# Preview the diff against what's currently deployed
doctl apps spec get 6430b14a-cbe5-4476-a4cf-9c4398c15c3e > /tmp/current.yaml
diff /tmp/current.yaml .do/app.yaml

# Apply
doctl apps update 6430b14a-cbe5-4476-a4cf-9c4398c15c3e --spec .do/app.yaml
```

Secrets (`DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, AI provider keys,
`REDIS_URL`, `CRON_SECRET`, `ADMIN_SECRET`, `DODO_PAYMENTS_*`,
`EMAIL_API_KEY`, `TURNSTILE_SECRET_KEY`, etc.) are intentionally NOT
mirrored into the spec. Manage them in the DO console under
**Settings → trackly-saas → App-Level Environment Variables**, marked as
SECRET. The spec only carries the non-secret runtime knobs
(`NODE_ENV`, `NODE_OPTIONS`, `NEXT_TELEMETRY_DISABLED`).

## Autoscaling

```yaml
instance_count: 2
autoscaling:
  min_instance_count: 2
  max_instance_count: 4
  metrics:
    cpu:
      percent: 70
```

### Why 2–4

- **Floor of 2.** Eliminates the single-pod outage window during a rolling
  deploy or a pod crash. Before #407 + #408 we were pinned at one pod for
  correctness (in-process cron lock + BullMQ worker liveness assumed a
  single replica). With Redis-backed cron locking the request path is
  stateless and horizontally scalable.
- **Ceiling of 4.** Covers the worst case observed in load tests:
  ~10 brands running in parallel on the top of the hour, each fanning
  out 6 AI providers. Beyond 4 pods we hit Postgres connection-pool and
  upstream AI rate-limit ceilings before we benefit from more compute.
- **CPU target 70%.** Scaling out when sustained CPU exceeds 70% gives
  enough headroom for the next sample interval to land before pods
  saturate. Lower targets (50–60%) caused thrash in synthetic tests
  driven by short cron-tick CPU spikes.

### What does NOT autoscale

- The `worker` dyno (BullMQ consumer for `brand-runs`) stays at 1 pod
  unless `QUEUE_MODE=always` and the queue is provably backlogged.
  Cron-locking + idempotent `active_runs` rows handle dedupe regardless
  of replica count, so adding workers doesn't speed up a single brand;
  it just adds Redis pressure.
- Postgres and Redis are managed services and scale independently in
  the DO console.

## Health check

```yaml
health_check:
  http_path: /api/health
  initial_delay_seconds: 20
  period_seconds: 10
  timeout_seconds: 3
  success_threshold: 1
  failure_threshold: 5
```

`GET /api/health` returns:

```json
{
  "status": "ok",
  "timestamp": "2026-04-27T12:00:00.000Z",
  "uptime_seconds": 1234,
  "checks": {
    "db":    { "ok": true, "latency_ms": 4 },
    "redis": { "ok": true, "configured": true, "latency_ms": 2 }
  }
}
```

- HTTP **200** when both Postgres and Redis pings succeed (or Redis is
  unconfigured, e.g. local dev).
- HTTP **503** with the same JSON shape (and `status: "degraded"`) when
  any required dependency fails. Pings are bounded at 1.5s so a hung
  upstream cannot stall the probe.
- Five consecutive failures (≈50s) before DO replaces the pod. This is
  deliberately lenient: a 10s Redis blip should not roll the fleet.
- The route itself sets `dynamic = 'force-dynamic'` and runs on the
  Node runtime so it isn't cached and so `pg` / `ioredis` are available.

## Graceful shutdown / scale-down

In-flight `executeRunBackgroundInner` calls are kept alive across pod
shutdown via Next's `after()` lifecycle (PR #406). A pod scaled down by
the autoscaler will:

1. Stop accepting new HTTP requests (DO removes it from the LB pool).
2. Drain the `after()` queue before exit.
3. Any orphaned `active_runs` rows are reaped by the cron reconciler
   on the next tick — Redis-backed `cron_locks` ensure only one pod
   reaps at a time.

There are no SSE/WebSocket endpoints on this service, so sticky
sessions are not required.

## Rollout plan (issue #408)

1. **Step 1 — Lock floor at 2.** Apply the spec with
   `min_instance_count: 2`, `max_instance_count: 2`. Watch 24h. Verify:
   - `/api/health` reports `ok` from each pod (curl the public URL
     repeatedly; logs show distinct `INSTANCE_ID`).
   - GitHub Actions cron runs land on different pods over the day
     without duplicate work (look for `cron.lock_acquired` log lines
     with distinct `instance_id` values).
   - No `cron.pileup_detected` Sentry events.
2. **Step 2 — Enable autoscale.** Bump `max_instance_count` to 4.
   Watch 1 week. Confirm:
   - DO autoscaling events fire only under genuine CPU load (top of
     hour during a busy run window, not idle).
   - Postgres `pg_stat_activity` peaks stay under the connection
     ceiling. If it tightens, lower `PG_POOL_MAX` per pod.
   - Cost vs. baseline tracked in the monthly bill (~2× expected).

## Verification checklist

- [ ] `doctl apps spec get $APP_ID` matches `.do/app.yaml` (modulo
  managed secrets).
- [ ] `curl https://livesov.com/api/health` returns 200 with both
  `db.ok` and `redis.ok` true.
- [ ] DO console **Insights → Instance count** shows ≥2 pods at all
  times.
- [ ] A forced redeploy completes with zero failed health checks.
- [ ] Load test (10 parallel brand runs) shows pod IDs distributed
  across the work — grep run logs for the `INSTANCE_ID` env var DO
  injects per pod.
