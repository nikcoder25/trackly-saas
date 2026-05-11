# Observability

Reference for the structured logs and Prometheus metrics emitted by
Livesov. See issue #412 for the original spec.

## Quick start

- Logs: every server-side log goes through `src/lib/logger.ts`. In
  production, set `LOG_FORMAT=json` to emit one JSON object per stdout
  line (pino-compatible shape). Without it, the legacy
  `[prefix] message {attrs}` style is preserved so existing greps
  (`grok.boot`, `grok.fetch`, `chatgpt.ratelimit`, …) keep working.
- Metrics: scrape `GET /api/metrics` with header
  `Authorization: Bearer $METRICS_ADMIN_TOKEN`. Returns the Prometheus
  text exposition format (version 0.0.4).
- Request id: every request gets `x-request-id` (UUID v4) stamped by
  the edge middleware. The same id is echoed on the response and
  threaded into every structured log record under `requestId`.

## Structured log fields

The logger merges the bindings on a child logger with the per-call
`attrs`. Field names are stable; downstream alerting / log queries can
rely on them.

| Field | Type | When present | Description |
|---|---|---|---|
| `time` | epoch ms | always (json mode) | Emit time. |
| `level` | string | always | `debug`, `info`, `warn`, `error`. |
| `msg` | string | always | Event name, e.g. `ai.call.success`, `run.task_timeout`. |
| `tenantId` | string | request handlers, AI calls | Brand-owner user id. Never the team-member's id - billing context. |
| `brandId` | string | request handlers, AI calls | Brand row id. |
| `runId` | string | run/route lifecycle | `active_runs.id` for the in-flight run. |
| `platform` | string | AI platform code paths | One of `ChatGPT`, `Claude`, `Gemini`, `Grok`, `Perplexity`. |
| `requestId` | string | every request that passes the middleware | UUID v4. Echoed on the HTTP response as `x-request-id`. |
| `outcome` | string | AI calls, run tasks | One of the bounded outcomes: `success`, `timeout`, `rate_limited`, `circuit_open`, `key_invalid`, `server_error`. |
| `latencyMs` | number | AI calls, fetch lifecycle | Wall-clock duration of the operation. |
| `errorClass` | string | error paths | JS error name (`AiError`, `AbortError`, `Error`, …). |
| `errorMessage` | string | error paths | First 240 chars of the underlying message. PII-scrubbing is applied via Sentry's `beforeSend`. |

### Common events

| Event (`msg`) | Level | Notes |
|---|---|---|
| `ai.call.success` | info | Emitted from `queryAI` on a successful provider response. Includes `model`, `tokensIn`, `tokensOut`. |
| `ai.call.failure` | warn | Emitted from `queryAI` on any thrown error. `outcome` is set from `classifyOutcome`. |
| `run.task_start` | info | A worker is about to call a provider. Includes `queryIndex`. |
| `run.query_ai_before` | info | Right before `queryAI` await; `model` is the resolved model (post-smart-routing). |
| `run.query_ai_resolved` | info | Provider returned successfully; `textLen` for sanity-checking. |
| `run.task_timeout` | warn | Per-platform timeout fired (`PER_PLATFORM_TIMEOUT_MS`, default 180s). |
| `run.task_rejected` | warn | Provider call surfaced a non-timeout error. |
| `run.superseded` | warn | A newer run took over before this one could finalise. |
| `run.background_failed` | error | The background worker crashed; the active_runs row was marked `error`. |
| `metrics.endpoint_unconfigured` | warn | `/api/metrics` was hit but `METRICS_ADMIN_TOKEN` was not set. |
| `[<platform>.boot]` | warn | Provider key boot probe outcome (`probe_ok` / `probe_failed` / `no_key_configured`). Preserved verbatim from the pre-#412 logs so existing dashboards keep working. |
| `[<platform>.fetch]` | warn | Provider fetch lifecycle (`start` / `headers` / `abort`). Preserved verbatim. |
| `[chatgpt.ratelimit]` | warn | ChatGPT 429 / Retry-After behaviour. Preserved verbatim. |

## Prometheus metrics

Scraped from `GET /api/metrics`. Counters monotonically increase across
the lifetime of the process; histograms accumulate samples. There is
no reset between scrapes - that's the standard Prometheus contract.

### `trackly_ai_calls_total`

Counter. Total AI provider calls.

Labels: `tenant`, `platform`, `outcome`.

- `tenant`: brand-owner user id, or `unknown` when not threaded
  through (e.g. background deferred-retry queue).
- `platform`: one of `ChatGPT`, `Claude`, `Gemini`, `Grok`,
  `Perplexity`.
- `outcome`: one of:
  - `success` – provider returned 2xx with usable content.
  - `timeout` – per-task or per-call abort signal fired.
  - `rate_limited` – 429 / 529 / quota exhausted; includes
    deep-retry budget exhaustion.
  - `circuit_open` – platform breaker open; we fast-failed without
    hitting the provider.
  - `key_invalid` – auth failure (401/403) on the API key.
  - `server_error` – any other failure (5xx, parse error, …).

### `trackly_ai_call_latency_ms`

Histogram of wall-clock latency (in ms) for every AI provider call.
Same label set as `trackly_ai_calls_total`.

Bucket boundaries (ms): `50, 100, 250, 500, 1000, 2500, 5000, 10000,
30000, 60000, 120000, 180000`. The `+Inf` bucket holds samples larger
than the per-task timeout.

Standard derived series:
- `rate(trackly_ai_call_latency_ms_sum[5m]) / rate(trackly_ai_call_latency_ms_count[5m])`
  — average latency over a 5-minute window.
- `histogram_quantile(0.95, rate(trackly_ai_call_latency_ms_bucket[5m]))`
  — p95 latency.

### `trackly_http_requests_total`

Counter. Total HTTP requests served, labelled by `route` and `status`.
Recorded at the route handler boundary so it does not include
middleware-rejected requests.

## Suggested alerts

These are starting points - adjust thresholds to your traffic.

- Sustained rate-limit storm:
  ```
  sum by (platform) (rate(trackly_ai_calls_total{outcome="rate_limited"}[5m]))
    /
  sum by (platform) (rate(trackly_ai_calls_total[5m]))
    > 0.3
  ```
- Circuit breaker open:
  ```
  increase(trackly_ai_calls_total{outcome="circuit_open"}[10m]) > 0
  ```
- Provider latency regression:
  ```
  histogram_quantile(0.95,
    sum by (platform, le) (rate(trackly_ai_call_latency_ms_bucket[5m]))
  ) > 60000
  ```

## Configuration

| Env var | Default | Effect |
|---|---|---|
| `LOG_FORMAT` | (unset) | Set to `json` to emit pino-compatible JSON lines. |
| `SENTRY_LOGS_ENABLED` | `true` | Set to `false` to stop forwarding to Sentry without redeploying. |
| `METRICS_ADMIN_TOKEN` | (unset) | Required for `/api/metrics` to return 200. Must be ≥16 chars. |

## Operational notes

- **Cardinality:** the AI metric labels are bounded:
  `platform` × `outcome` ≤ 5 × 6 = 30 series per tenant. With ~10k
  tenants the registry stays under 300k active series, well within a
  single-instance Prometheus.
- **Reset semantics:** counters do NOT reset on /metrics scrape -
  they reset only on process restart, which is the Prometheus
  standard. App Platform deploys cycle the process; alerting on
  `increase()` over a window > deploy interval is fine.
- **Edge runtime:** `logger.ts` and `metrics.ts` are both edge-safe
  (only `process.env`, `console.*`, and `@sentry/nextjs` edge
  exports). The /api/metrics route runs on Node.js because it uses
  `crypto.timingSafeEqual` for token comparison.
