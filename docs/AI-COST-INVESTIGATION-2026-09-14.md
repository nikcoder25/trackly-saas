# Anthropic credit drain - 2026-09-14

## What happened

The Anthropic (Claude API) organisation "nik's Individual Org" ran out of
usage credits on 2026-09-14 04:47 UTC and API access was switched off.

Timeline from the billing emails:

| When (UTC) | Event |
|---|---|
| 2026-09-10 06:08 | Auto-recharge, $12.22 credits ($14.42 with GST) |
| 2026-09-10 06:11 | One-time purchase, $20.00 credits ($23.60 with GST) |
| 2026-09-11 02:12 | Auto-reload of $11.88 attempted and declined. The balance was already back under the reload threshold, so most of the $32.22 was spent inside 20 hours. |
| 2026-09-14 04:37 | Auto-reload of $12.15 attempted and declined |
| 2026-09-14 04:47 | "Your Claude API access is turned off" |

The same pattern repeats through August: four auto-recharges on Aug 27
between 06:41 and 08:47 UTC, three on Aug 29, one on Sep 4. Anthropic also
warned on Aug 7 that the org's prompt-cache hit rate was low ("could save
up to 44%"), which only happens when large prefixes are re-sent.

## What the app itself can account for

Numbers from the code and the GitHub Actions cron logs, not from the
production database (not reachable from the session that wrote this).

* The daily tracking cron covers 16 brands. On 2026-09-13 17:31 UTC it
  processed 0 and skipped 16 (`interval_not_elapsed`); the same shape on
  every tick this week.
* A Claude tracking call uses the 150-character system prompt and
  `AI_MAX_OUTPUT_TOKENS=100` on `claude-haiku-4-5-20251001`. That is about
  $0.0006 per call. Even 16 brands x 25 prompts every day is under $0.30.
* Scheduled work that reaches Claude: tracking runs, and Fix Engine
  scheduled scans for brands that enabled them. Nothing else runs on a
  timer.

So the recorded, scheduled Claude workload cannot explain $8-12 a day.
The spend clusters on days with heavy manual or development activity
(Aug 27, Aug 29, Sep 4, Sep 10), during Indian working hours.

## Decisive check (do this first)

Open https://console.anthropic.com -> Usage, set the range to Sep 10-14,
and group by **API key** and by **model**.

* If the spend is on `claude-haiku-4-5-20251001` from the key Trackly
  uses, at all hours, it is Trackly. The caps in this change stop it.
* If the spend is on other models (Sonnet, Opus, Fable, Mythos) or on a
  key that is not Trackly's, it is another consumer of the same org:
  a local Claude Code CLI with `ANTHROPIC_API_KEY` set (the Claude
  subscription was paused for a failed payment on Aug 14, and the CLI
  falls back to the API key), a script, or the admin backlink generator
  run in bulk on a premium model. Then rotate the key.

Either way, give Trackly its own API key (Console -> API keys) so its
usage is attributable, and set a monthly spend limit on the org
(Console -> Limits).

## What this change does

Ranked by expected effect on the invoice.

1. **Global per-platform daily USD cap** (`src/lib/cost-tracker.ts`,
   enforced inside `queryAI` and the two paths that bypass it). Claude
   defaults to $5/day; every other platform is uncapped until
   `AI_DAILY_USD_CAP_<PLATFORM>` is set. Once today's recorded spend on a
   platform reaches the cap, further calls to it are refused until the
   UTC day rolls over. Tracking runs mark that platform failed for the
   run and the other four keep working. This is the brake the account
   never had: the per-tenant caps only saw tenant-attributed spend and
   the $3 alarm only logged.
2. **Cost recorded on the two direct-fetch paths.** The fact-checker
   (`PUT /api/brands/[id]/accuracy`) and the admin backlink generator
   called the providers directly and were invisible to the ledger, the
   alarm and the caps. Both now record every call and check the cap
   first.
3. **Admin backlink generator locked down.** The model id came verbatim
   from the browser; an old saved preference or a hand-edited request
   could point bulk article generation (4,000-8,000 output tokens each)
   at a premium model. Server-side allowlist now (Haiku 4.5 recommended,
   Sonnet 4.6, Opus 4.7, GPT-4o family; extend with
   `BACKLINK_GENERATE_EXTRA_MODELS`), plus 300 requests/hour per admin.
4. **Deferred retry queue deleted.** It re-issued up to four billed calls
   per transient failure from a background timer, bypassed the response
   cache, and discarded every result. During the Claude incidents on
   Sep 10-11 (degraded performance, elevated errors) it multiplied
   attempts exactly when they were most likely to fail.
5. **Anthropic prompt caching.** System prompts of 4,000+ characters
   (the Fix Engine SEO brain plus module prompt, Regional Audit
   instructions) are sent as an `ephemeral` cache block: 1.25x on the
   first call, 0.1x on every call in the next five minutes. The ledger
   prices cache writes and reads correctly (`estimateAnthropicCostUsd`).
   Disable with `ANTHROPIC_PROMPT_CACHE_DISABLED=true`.
6. **Fix Engine autopilot generation capped at 10 per tick**, like
   staging already was. `listFixes` returns up to 500 rows and every
   generation starts on Claude with the full brain as its system prompt.
7. **Accuracy check rate-limited** (10/hour per user, 30/hour per IP).
   One click was up to 15 uncached, unattributed calls; the sibling
   reverify route was already limited.
8. **Fact-checker output ceiling 4096 -> 2048 tokens**, and a capped
   provider is skipped in favour of the next one instead of failing the
   check.
9. **Grounded Gemini gets a daily search budget** (300 grounded
   calls/day, about $10.50, `AI_SEARCH_BUDGET_GEMINI`). Past it Gemini
   keeps answering, ungrounded. The dominant per-call fee in the product
   had no brake while the cheaper ChatGPT `web_search` did.
10. **Ledger pricing uses the longest matching model prefix**, so a dated
    `gpt-5.4-nano-...` id is no longer priced as `gpt-5.4` (12.5x too
    high). `.env.example` no longer halves the response-cache TTL.

## Env knobs added

```
AI_DAILY_USD_CAP_CLAUDE=5          # default; 0 disables
AI_DAILY_USD_CAP_CHATGPT=0
AI_DAILY_USD_CAP_GEMINI=0
AI_DAILY_USD_CAP_DEFAULT=0
AI_SEARCH_BUDGET_GEMINI=300
ANTHROPIC_PROMPT_CACHE_DISABLED=false
BACKLINK_GENERATE_EXTRA_MODELS=
```

## How to verify after deploy

* Admin -> System shows today's per-platform totals from
  `daily_cost_tracker`. Accuracy checks and backlink generation now
  appear there.
* When Claude hits its cap the log line `cost.platform_daily_cap_reached`
  fires once per day and tracking runs report
  `Claude: daily spend cap reached ($5.0000 of $5.00 today)`.
* Compare that number with Console -> Usage for the same day. If the
  console shows more than the app recorded, the difference is not
  Trackly.

## Still open

* Cost is still recorded on the success path only (finding 2 of the
  2026-08-23 investigation). A grounded Gemini reply rejected locally is
  billed and not ledgered.
* Regional Audits still bypass the response cache.
* Credits are counted per call, not per dollar.
