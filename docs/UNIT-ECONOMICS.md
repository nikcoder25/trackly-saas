# Unit economics and pricing

Measured 2026-08-15. This is the reference for "what does a customer actually
cost us" and "what should we charge". Re-derive it whenever model pricing,
default models, or plan limits change — every number below is computed from
source, not quoted from a vendor page, so it can be rebuilt exactly.

## Where the inputs live

| Input | Source |
|---|---|
| Per-token model pricing | `MODEL_PRICING` in `trackly-nextjs/src/lib/ai-platforms.ts` |
| Default model per platform | `PLATFORM_MODELS` (`default: true`) in the same file |
| ChatGPT web-search surcharge | `CHATGPT_WEB_SEARCH_CALL_USD` in `src/lib/cost-tracker.ts` |
| Gemini grounding surcharge | `GEMINI_GROUNDING_CALL_USD` in `src/lib/cost-tracker.ts` |
| Plan limits | `PLAN_LIMITS` in `src/lib/constants.ts` |
| Plan prices | `PLANS` in `src/lib/constants.ts` |
| Actual spend (ground truth) | `tenant_cost_events` / `daily_cost_tracker` tables |

Prefer `tenant_cost_events` over this document once there is real traffic. The
tables record what was actually billed; this document is a model.

## Assumptions

- **~150 input tokens, ~800 output tokens per measurement call.** Taken from a
  real grounded Gemini call ("Who are the best HVAC companies in Auburn, WA?"),
  which returned 89 in / 926 out. Answers that list companies are long; short
  answers cost proportionally less on the token component only.
- **Full plan utilisation, zero cache hits.** These are ceilings, not expected
  bills. The response cache (24h on search paths, cross-tenant) reduces this
  for prompts shared between tenants, but brand- and city-specific prompts
  rarely collide, so do not plan around it.
- **AI costs only.** Hosting, Postgres, Redis, email and DataForSEO are
  excluded.

## Per-call cost by engine

| Engine | Default model | Token cost | Per-call fee | **Total** |
|---|---|---|---|---|
| Grok | grok-3-mini | $0.00045 | — | **$0.00045** |
| Perplexity | sonar | $0.00095 | see caveat | **$0.00095** |
| ChatGPT | gpt-5.4-mini | $0.0037 | none today | **$0.0037** |
| Claude | Fable 5 | $0.0125 | — | **$0.0125** |
| Gemini | gemini-2.5-flash | $0.00034 | $0.035 grounding | **$0.0353** |

Grounded Gemini is **78× Grok** and **9.5× ChatGPT**. It is the single
dominant cost in the product, and for a grounded Gemini call the fee is ~99%
of the total — tokens are a rounding error.

Cross-check: DataForSEO resells the same grounded Gemini endpoint at
$0.037942 per call, against ~$0.0354 direct. Their resale is ~7% dearer, so
routing through them is not a cost saving — the fee is Google's either way.

## The cost model

```
monthly cost = prompts × platforms × runs_per_month × avg_cost_per_call
```

All three multipliers compound. Cost per prompt-run across all five engines is
**$0.0529**.

## What the current plans cost

At each plan's own limits, with Gemini among the selected platforms:

| Plan | Price | Limits | Cost/mo | Margin |
|---|---|---|---|---|
| Free | $0 | 5 × 2 × 4 | ~$0.19 | — |
| Starter | $9 | 15 × 2 × 15 | $10.76 | **negative** |
| Pro | $29 | 25 × 3 × 30 | $29.97 | **~break-even** |
| Agency | $89 | 100 × 5 × 30 | $158.70 | **−$70** |

Agency's cap is 150 runs/month; used fully that is **$793/mo** against $89.

Without Gemini the same plans are cheap — Starter on ChatGPT + Perplexity is
$1.05/mo. Engine selection, not plan size, is what decides profitability.

## The cadence lever

`minScheduleHours: 24` on Pro and Agency means daily measurement. Moving to
weekly cuts cost ~7× and makes the **current** prices work:

| Plan | Daily | Weekly | COGS at today's price |
|---|---|---|---|
| Pro $29 | $29.97 | **$4.00** | 14% |
| Agency $89 | $158.70 | **$21.16** | 24% |

This is a config change to `PLAN_LIMITS.minScheduleHours`, not a repricing.
Weekly is the norm for this category, and it avoids telling early customers
their price went up.

## Recommendation

**Now, without changing any price:**

1. Set Pro and Agency to weekly (`minScheduleHours: 168`).
2. Gate grounded Gemini to Pro and above. Starter then runs
   ChatGPT + Perplexity at ~$1.05/mo on $9 — an 88% margin and a genuinely
   cheap acquisition tier.
3. Sell daily refresh as an upgrade rather than shipping it as the default.
   Daily genuinely costs ~$30/customer, so "Pro Daily $99" is honest pricing.

**At ~10 paying customers, revisit with real `tenant_cost_events` data:**

| Plan | Now | Proposed | Shape | COGS |
|---|---|---|---|---|
| Starter | $9 | **$19** | 20 prompts, 3 engines, no Gemini, weekly | ~3% |
| Pro | $29 | **$49** | 30 prompts, 5 engines, 2×/week | ~26% |
| Agency | $89 | **$199** | 150 prompts, 5 engines, weekly | ~16% |

Target 75–95% gross margin.

## Known gaps in these numbers

- **ChatGPT is not grounded.** `isSearch = useModel.includes('search')` and the
  default model is `gpt-5.4-mini`, so `web_search` never attaches
  (`ai-platforms.ts`, ChatGPT branch). ChatGPT answers from training memory —
  the same correctness problem that was fixed for Gemini. Fixing it adds
  **$0.030/call**, which roughly doubles every figure above. Price with that
  headroom.
- **Perplexity request fees are untracked.** Sonar bills per request on top of
  tokens on some tiers, and nothing in `cost-tracker.ts` accounts for it — the
  same blind spot Gemini had before `GEMINI_GROUNDING_CALL_USD`. Confirm
  against an invoice and add a constant if it applies.
- **Claude's Fable 5 pricing is a placeholder.** `MODEL_PRICING` carries a
  comment saying so. Claude is the second most expensive engine at $0.0125/call,
  so confirm it.
- **Infrastructure is excluded**, as noted in Assumptions.

## Guardrails already in place

| Guardrail | Default | Env var |
|---|---|---|
| Per-tenant daily cost cap | $10 | `TENANT_DAILY_COST_CAP_USD` |
| Per-tenant monthly cost cap | $200 | `TENANT_MONTHLY_COST_CAP_USD` |
| Per-platform daily alarm | $3 | `COST_DAILY_ALARM_USD` |

A Pro brand on daily grounded runs costs ~$0.89/day, so it clears the daily
cap; an Agency brand at 100 prompts/day costs ~$3.54/day and would cross the
$200 monthly cap around day 56. The $3 platform alarm is roughly a
"3–4 active Pro brands" tripwire and will now fire correctly, since grounding
is billed into the ledger rather than being invisible to it.
