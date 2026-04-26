# Operator handoff — unfreezing scheduled runs

## 0. Prerequisite: merge and deploy this branch first

* Branch: `claude/fix-critical-issues-WDplp` (+307 / -19)
* Action: open PR, review, merge to `main`. DigitalOcean App Platform auto-deploys `main` on push (confirmed via the Recent Activity panel on the oyster-app overview).
* Wait for the deploy to finish (≈3-5 min) and for `trackly-saas` to go back to Healthy before step 2.

Setting the env vars below BEFORE the merge is pointless - the currently deployed commit `07d536a` does not read any of them.

## 1. Google Cloud — Gemini API quota (root cause, do this even if defaults are fine)

Sign in to https://console.cloud.google.com with the project that owns `GEMINI_API_KEY` (and `GEMINI_API_KEY_1..10` if you use round-robin).

1. Navigate: APIs & Services → Generative Language API → Quotas & System Limits.
1. For each key's project, check these quotas over the last 24h:
   * `generativelanguage.googleapis.com/generate_content_requests_per_minute_per_project_per_model` for model `gemini-2.5-flash`
   * Same metric for `gemini-2.5-flash-lite`
   * `..._tokens_per_minute_per_project_per_model` for both models
1. If any of those four are pinned at 100% for sustained windows, that confirms the log signature ("Rate limited (429) - retries exhausted. Sleeping 11s/17s").

Pick ONE of these remediations:

* a) Request a quota increase via the pencil icon on the saturated row. Fill in expected RPM/TPM based on: (brands_on_paid_plans) × (queries_per_brand) × (6 runs/day ÷ 60 min). Add 3x headroom.
* b) Create a second Google Cloud project + new API key, add it as `GEMINI_API_KEY_2` (or next free slot) in DigitalOcean env vars. The existing code already does multi-key round-robin when multiple `GEMINI_API_KEY_N` vars are set - no code change needed.
* c) Temporarily disable Gemini for affected brands via the admin panel so the other 5 platforms can complete and the dashboard unfreezes today. Re-enable once (a) or (b) lands.

Do NOT paste API keys into chat with Claude. Enter them directly in DigitalOcean → App → Settings → trackly-saas component → App-Level Environment Variables, marked as encrypted (Secret).

## 2. DigitalOcean App Platform — env vars (optional; only if you want non-default values)

Path: https://cloud.digitalocean.com/apps/6430b14a-cbe5-4476-a4cf-9c4398c15c3e → Settings → trackly-saas → App-Level Environment Variables → Edit.

The values the operator listed in chat ARE the code defaults, so if you're happy with defaults you can skip this entire section and the branch merge alone is enough. Only set these explicitly if you want to override:

| Key | Default | When to override |
|---|---|---|
| AI_DEEP_RETRY_RATELIMIT_MAX | 1 | Raise to 2 only if a provider is flapping and you have quota headroom. |
| AI_PLATFORM_CB_THRESHOLD | 8 | Lower (e.g. 5) if you want the circuit breaker to trip faster. |
| AI_PLATFORM_CB_WINDOW_MS | 60000 | |
| AI_PLATFORM_CB_COOLDOWN_MS | 300000 | Raise to 900000 (15min) if a provider stays down for long stretches. |
| CRON_CRASH_BACKOFF_THRESHOLD | 3 | |
| CRON_CRASH_BACKOFF_BASE_MINUTES | 30 | |
| CRON_CRASH_BACKOFF_MAX_MINUTES | 1440 | |
| AI_REQUEST_TIMEOUT_MS | 150000 | Per-call HTTP timeout for an individual provider request inside `fetchAI`. Raised from 60s to 150s so search-class models (e.g. `gpt-4o-mini-search-preview`) finish before the call is aborted. Lower only if you've also lowered `AI_PER_PLATFORM_TIMEOUT_MS`. |
| AI_PER_PLATFORM_TIMEOUT_MS | 180000 | Per-task budget enforced by `/api/brands/[id]/run` around the entire provider attempt, including retries. Raised from 60s to 180s to stop healthy ChatGPT search-preview calls from being killed as `platform timeout`. Must be ≥ `AI_REQUEST_TIMEOUT_MS`. |
| CHATGPT_SMART_MODEL_ROUTING | (on) | Now ON by default. ChatGPT calls with clear non-search intent get routed from the constrained `gpt-4o-mini-search-preview` pool down to `gpt-4o`. Set to `false` to keep every query on the admin-selected search model. Freshness/local/comparison queries continue to use the search model regardless. |

After saving, DigitalOcean will redeploy (~3-5 min). All of these are Plain-text (not secrets), scope: Run and Build Time.

## 3. Verification (after merge + deploy + any quota changes)

Wait for the next top-of-hour GitHub Actions `Scheduled cron` run (https://github.com/nikcoder25/trackly-saas/actions/workflows/cron.yml). Open the latest run → Hourly cron → Call /api/cron and look at the JSON response body. You want to see:

* `reconciled` dropping toward 0 over consecutive ticks (currently 9/9 every tick)
* `processed` > 0 with `reconciled` << `processed`
* `skipReasons.interval_not_elapsed` growing (means runs are actually completing and the 24h gate is working as intended)
* No new `cron.pileup_detected` errors in Sentry

Then open https://livesov.com/dashboard, switch between brands in the selector, and confirm "Last Run" shows minutes/hours-ago, not days-ago, on each.

## 4. Guardrail I'd add while you're in there

In Sentry (or whatever alerting you use), create an alert on the log event `cron.pileup_detected` (emitted by the branch when `reconciled >= processed` for 2 consecutive ticks). That's the exact signature that went silent for 3+ days this time. Route to the same channel as deploy failures.
