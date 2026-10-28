# AI provider cost investigation — 2026-08-23

Why the AI provider bill has risen faster than the product's own cost
dashboard says it should, what is driving it, and what to change.

Scope: the five LLM providers reached through `src/lib/ai-platforms.ts`
plus the paths that reach providers *without* going through it.
Infrastructure (DO, Postgres, Redis) and DataForSEO are out of scope.

Method: static reading of the call paths. Every claim below cites the
source it came from so it can be re-checked. Nothing here was measured
against production tables — where a number is an estimate it says so,
and `tenant_cost_events` / `daily_cost_tracker` remain the ground truth
for what was actually billed.

---

## Summary

The spend itself is mostly *explainable*: grounded Gemini at $0.035 per
call is 78× Grok and, as `docs/UNIT-ECONOMICS.md` already says, decides
the margin on every plan. That is not new.

What is new — and what makes this feel like an unexplained spike — is
that the guardrails built to contain retrieval fees were built around
ChatGPT's `web_search` and never extended to Gemini grounding, and that
the cost ledger only records **successful** calls. So the two things
that grow fastest under load (grounded Gemini, and retry storms) are
precisely the two things the in-app cost numbers cannot see.

Ranked by expected dollar impact:

| # | Finding | Impact |
|---|---|---|
| 1 | Grounded Gemini has no daily search budget; ChatGPT does | High |
| 2 | Failed and retried calls are billed but recorded as $0 | High (visibility) |
| 3 | Deferred retry queue makes up to 4 billed calls per failure and throws every result away | High under load |
| 4 | Fact-checker bypasses the entire cost/cache/cap layer, and its route has no rate limit | Medium–High |
| 5 | Regional Audits never touch the response cache | Medium |
| 6 | Gemini's model-fallback chain can re-bill grounding on a call that already grounded | Medium |
| 7 | Fix Engine autopilot generation is uncapped per tick (staging next to it is capped) | Medium |
| 8 | Credits are counted per call, not per dollar — the same credit costs $0.00045 or $0.037 | Structural |
| 9 | `.env.example` sets a 7-day cache TTL, halving the code's 14-day default | Low–Medium |

Findings 1, 3 and 5 are config-or-few-lines changes. Finding 2 is the
one that explains "the invoice and the dashboard disagree".

---

## 1. Grounded Gemini has no daily search budget

`src/lib/search-budget.ts:42` — the per-platform daily cap table:

```ts
// Per-platform default daily caps. Only ChatGPT has a default - it's
// the platform with billable web_search tool calls AND a useful
// non-search fallback. Perplexity charges per query, not per tool
// invocation, and Claude/Gemini/Grok don't have a billable tool.
const PLATFORM_DEFAULT_DAILY_CAP: Record<string, number> = {
  ChatGPT: 50,
};
```

That comment is no longer true. Grounded Gemini **is** a billable
retrieval tool, and this repo says so itself in two other places:

- `src/lib/cost-tracker.ts:55` — `GEMINI_GROUNDING_CALL_USD = 0.035`,
  with a comment noting the fee is ~99% of a grounded call.
- `docs/UNIT-ECONOMICS.md` — "Grounded Gemini is 78× Grok … the single
  dominant cost in the product."

So the mechanism built specifically to stop a retrieval-fee runaway
caps the $0.030 engine at 50 calls/day and leaves the $0.035 engine —
the one that dominates the bill — completely unlimited. The header
comment on the same file cites a May 11 incident at ~$48/day on
`web_search` as the reason the budget exists at all; Gemini has no
equivalent brake.

The plumbing is already there. `resolveSearchModelWithBudget` is called
on the Gemini path (`src/app/api/brands/[id]/run/route.ts:1088`, and
`src/lib/run-worker.ts:262`) with `isSearch: true`, because
`isSearchEnabled('Gemini', model)` returns true whenever grounding is
on. It resolves to "unlimited" only because `getSearchBudgetLimit`
falls through to `PLATFORM_DEFAULT_DAILY_CAP[platform] ?? 0`.

**Fix:** set `AI_SEARCH_BUDGET_GEMINI` in the environment today (no
deploy), then add a `Gemini` default to the table. A cap of 300/day is
~$10.50/day. Note the caveat in §5/§7 below: Regional Audits and the
Fix Engine call `queryAI` directly and never consult the budget, so the
cap only covers tracking runs.

Grounding also defaults **on**: `geminiGroundingEnabled()` in
`src/lib/response-cache.ts:167` returns true unless
`GEMINI_GROUNDING_DISABLED === 'true'`, and that var is commented out in
`.env.example:231`. That is a deliberate accuracy decision, documented
there, and this note is not arguing against it — only that an on-by-
default $0.035 fee needs the same brake its cheaper sibling has.

## 2. Failed and retried calls are billed, but recorded as $0

In `queryAI`, both ledger writes sit on the success path:

- `src/lib/ai-platforms.ts:2247` — `recordCostEvent` (per-tenant ledger,
  the table `enforceCostCap` reads).
- `src/lib/ai-platforms.ts:2263` — `recordCall` (the `daily_cost_tracker`
  rollup behind the admin dashboard and the $3 per-platform alarm).

The `catch` at `src/lib/ai-platforms.ts:2273` writes metrics and a log
line, and no cost row at all. The comment above `recordCall` states the
intent plainly — *"Only fires on the success path; the failure branch
below does not call this, so retries cannot double-count."*

Avoiding double-counting is right, but the current shape does not just
avoid double-counting — it counts **zero** for calls providers do
charge for:

- Google bills grounding per grounded prompt. A response that comes
  back grounded and is then rejected locally (`Gemini empty response`,
  `Gemini returned no candidates`, a `finishReason` we refuse) has
  already incurred the $0.035.
- OpenAI bills tokens on a completed response. A response that arrives
  after our per-attempt timer fired, or that we reject on parse, is
  billed.
- Every `web_search` invocation OpenAI completed is billed even if the
  surrounding response never reaches us.

Consequence: the failure modes that make an invoice spike are exactly
the ones invisible to `tenant_cost_events`, `daily_cost_tracker`, the
per-tenant daily/monthly caps, and the $3 alarm. A tenant can sit under
a $10/day cap while generating well over $10/day of real spend, because
the cap only counts what succeeded.

This is very likely the reason the bill "came out of nowhere" — the
in-app numbers are not wrong about what they measure, they are just
measuring the happy path.

**Fix:** record a cost event on the failure path too, for the cases
where the provider is known to have charged: any Gemini response that
carried `groundingMetadata`, and any ChatGPT failure that carried a
`usage` block. Tag those rows (e.g. `outcome='failed'`) so they are
distinguishable in the ledger and so the "no double-counting" property
is kept explicit rather than implied by omission.

## 3. The deferred retry queue pays for calls and discards the results

`src/lib/ai-platforms.ts:1435-1495` (queue at 1449, drain at 1471). When a call exhausts its deep-retry
budget on a transient error, `enqueueDeferredRetry` parks it for a later
background attempt — up to `DEFERRED_MAX_ATTEMPTS = 4`, with a queue
capacity of 500.

Two problems, both in `_drainDeferredQueue` at line 1480:

```ts
await queryAI(item.platform, item.query, item.apiKey, item.model, item.brand,
              { ...item.options, silent: true });
```

1. **The result is discarded.** Nothing assigns it, and `queryAI` does
   not write to `response_cache` — only `withCacheAndRetry` does. So the
   answer is paid for, parsed, ledgered, and thrown on the floor.
2. **The cache is never read either.** The deferred retry calls
   `queryAI` directly, so if the next cron tick already warmed that
   exact prompt, the deferred retry still pays for a fresh call.

The block comment above the queue says *"On success, the response cache
(DB layer) is warmed so the next cron tick / manual re-run returns
instantly."* That is what it was supposed to do; it is not what the code
does. As written the queue is pure cost with no product effect.

It also amplifies exactly when things are worst: rate-limit errors count
as transient (`isTransientError`), so during a provider 429 storm every
failing call enqueues up to 4 further billed attempts.

**Fix:** route the retry through `withCacheAndRetry` with the same key
the original call used, so a hit costs nothing and a miss warms the row
for the next tick. If that is more surgery than wanted right now,
deleting the queue outright is strictly cheaper than leaving it.

## 4. The fact-checker bypasses the whole cost layer

`src/lib/fact-checker.ts` does not use `queryAI`. It defines its own
`API_ENDPOINTS` (lines 7-11), its own `parseKeys` (line 69), and calls
OpenAI / Anthropic / Google directly from `callChecker` (line 181).

Everything the platform layer provides is therefore absent on this
path: no response cache, no `tenant_cost_events` row, no
`daily_cost_tracker` row, no per-tenant cost cap, no credit
reservation, no circuit breaker, no fairness slot, no platform rate
limiting. This spend is invisible to every cost surface in the product.

Volume per invocation (`runFactCheck`, line 357):

- up to 3 recent runs per platform × 5 platforms = **15 calls**;
- each with `max_tokens: 4096` and ~3,000 characters of response text
  plus the full canonical-fact list in the prompt;
- `MAX_RETRIES = 2` inside `callChecker`, **and** an outer fallback that
  walks every configured key across every provider on a transient error
  (`getAllAvailableCheckers`, line 108). Worst case is 3 attempts ×
  (number of keys) per run, × 15 runs.

And the route that triggers it, `PUT /api/brands/[id]/accuracy`
(`src/app/api/brands/[id]/accuracy/route.ts:179`), has **no rate limit
and no cooldown** — a signed-in user can click "Check Accuracy"
repeatedly, and each click is another ~15 untracked calls. The sibling
route `accuracy/reverify/route.ts:17` *does* rate-limit, so this looks
like an oversight rather than a decision. The same PUT also serves
`action: 'auto-discover'` (`autoDiscoverFacts`, line 633), which sends
up to 8,000 characters of site content plus five 1,500-character
responses, equally unguarded.

**Fix, in order of value:** add a rate limit to the PUT to match
`reverify`; then migrate `callChecker` onto `queryAI` so this path
inherits the cache, ledger and caps like everything else. The model
choices are already sensible (`gpt-5.4-nano`, `gemini-2.5-flash`,
`claude-haiku-4-5`) and no grounding is attached, so the per-call cost
is low — it is the volume and the invisibility that matter.

## 5. Regional Audits never touch the response cache

`src/lib/geo-audits.ts:415` calls `queryAI` directly.
`withCacheAndRetry` appears nowhere in the file. Every
(region × prompt × platform) cell is a live billed call, on every audit,
even when the identical cell ran yesterday.

The shape multiplies: `MAX_REGIONS_PER_AUDIT = 5` and
`MAX_PROMPTS_PER_AUDIT = 100` (`src/app/api/geo-audits/route.ts:31-32`)
against `GEO_AUDIT_PLATFORMS` (5), so a single audit tops out at
**2,500 uncached calls**. With Gemini among them and grounding on,
the 500 Gemini cells alone are ~$17.50 — for one audit, repeated in
full on every re-run.

Monthly volume is bounded by plan credits (`reserveAuditCredits` draws
on the same pool as tracking runs, `geo-audits.ts:696`), so this is not
unbounded — but it consumes that budget at the most expensive possible
rate.

Note the region prompt is built by `buildRegionUserPrompt(region, ...)`,
so a cache key would need `city`/region in it — which
`buildCacheKey` already supports via its `city` field
(`src/lib/response-cache.ts:118`). This is a small change.

**Fix:** wrap the `queryAI` call in `withCacheAndRetry`, passing the
region as `city`. Regional audit prompts are generic
("best X in <region>") and collide across tenants, so this is the
single highest-hit-rate cache opportunity in the product.

## 6. Gemini's fallback chain can re-bill grounding

`src/lib/ai-platforms.ts:1587` and `callGemini` at 1644. On a transient
error the chain drops a tier (`gemini-2.5-flash` →
`gemini-2.5-flash-lite`) and issues a second grounded call.

Some of the conditions that trigger the fallback happen *after* Google
has already grounded and billed:

- `Gemini empty response` (line 1677) — tagged transient;
- `Gemini returned no candidates` (line 1672) — tagged transient.

Both are raised on a 200 response. If that response carried
`groundingMetadata`, the $0.035 is already spent, and the fallback
spends another. Layer `withDeepRetry` above it (up to the 75s budget)
and the deferred queue above that (§3), and one logical measurement can
cost several grounding fees while — per §2 — the ledger records at most
one, or none.

**Fix:** do not treat an empty/candidate-less 200 as transient on the
grounded path, or at minimum record the grounding fee before falling
through (see §2).

## 7. Fix Engine autopilot generation has no per-tick cap

`src/lib/fix-engine/automation.ts:240-247`:

```ts
if (auto.autopilotGenerate) {
  const detected = await listFixes(brandId, { status: 'detected' });
  for (const f of detected) {
    try { await generateFix(f.id, brandId); generated++; }
    ...
```

`listFixes` caps at `LIMIT 500` (`src/lib/fix-engine/schema.ts:339`), so
this can fire **500 generations in one scheduled tick** for one brand.

The step immediately below it — staging previews — *is* throttled at
`MAX_AUTOPILOT_STAGES_PER_RUN = 10`, with a comment explaining the
reasoning ("so a big backlog arrives as a reviewable trickle rather than
fifty previews at once"). The same reasoning applies more strongly to
generation, because generation is the step that costs money and staging
does not.

Each generation goes through `generateContent`
(`src/lib/fix-engine/generate.ts:86`), which tries **Claude first** —
the second most expensive engine at $0.0125/call in the unit-economics
table — with `maxTokens: 1500` and the SEO brain prepended to the system
prompt. On an empty reply it falls through to ChatGPT and then Gemini,
so one logical generation can be up to 3 billed calls.

Credits do bound the monthly total, but see §8 for why that bound is not
a dollar bound. The scheduler processes up to `MAX_PER_TICK = 5` brands
per 15-minute tick (`src/app/api/cron/fix-engine-scheduler/route.ts:18`).

Mitigating: autopilot is opt-in and defaults false
(`automation.ts:104`), and #760 parked the Fix Engine off the sidebar.
If no brand has `autopilot_generate = true` this is latent rather than
active — worth checking against the `fix_automation` table before
prioritising.

**Fix:** give generation a per-tick cap the way staging has one.

## 8. Credits are counted per call, not per dollar

`src/lib/plan-config.ts:8` states the model: *"One LLM call = one
credit."* Every spend path draws on that one pool — tracking runs,
Regional Audits (`reserveAuditCredits`), and Fix Engine generations
(`generateCost`, 0–3 credits per module).

But a credit's real cost varies by roughly **80×** depending on what
spends it:

| What spends the credit | Real cost |
|---|---|
| Grok tracking call | $0.00045 |
| ChatGPT tracking call (no search) | $0.0037 |
| Grounded Gemini tracking call | $0.0353 |
| Fix Engine generation on Claude (~5k in / 1.5k out) | ~$0.037 (est.) |

So Pro's 2,500 monthly credits are worth anywhere from ~$1 to ~$90 of
provider spend on a $29 plan, decided entirely by which features the
customer happens to use. `docs/UNIT-ECONOMICS.md` already makes this
point for engine selection ("Engine selection, not plan size, is what
decides profitability") — the part that is *not* yet modelled is that
Regional Audits, Fix Engine generations, prompt discovery, NAP audits
and the public tools are all outside that document's cost model
entirely, which is only `prompts × platforms × runs_per_month`.

**Fix (design, not a quick change):** weight credits by measured cost,
or at minimum make the per-tenant USD cap the real ceiling by closing
§2 — a cost-weighted cap is what the ledger already wants to be.

## 9. `.env.example` halves the cache TTL the code intends

`src/lib/response-cache.ts:36-40` defaults to 14 days for non-search and
7 days for search, with a long comment explaining that the 14-day
non-search TTL was chosen deliberately in the June cost pass ("~14
repeat hits per entry vs ~7 at 7d").

`.env.example:244` then sets `RESPONSE_CACHE_TTL_NO_SEARCH_S=604800` —
7 days — and its comment says *"search-enabled stays at 24h"*, which
also no longer matches the code's 7-day search default.

If the production `.env` was seeded from `.env.example` (the documented
quick-start does exactly that), non-search prompts are re-asked twice as
often as the cost pass intended.

**Fix:** delete the override from `.env.example` (or raise it to
1209600) and correct the stale comment, then confirm what production
actually has set.

---

## Smaller notes

- **Model-price prefix matching can mis-price.** `estimateCostUsd`
  (`src/lib/cost-tracker.ts:115`) falls back to
  `Object.entries(MODEL_PRICING).find(([k]) => model.startsWith(k))`.
  Key order is insertion order, and `'gpt-5.4'` is inserted before
  `'gpt-5.4-nano'`, so a dated model id like `gpt-5.4-nano-2026-01-01`
  matches `gpt-5.4` and is priced at $2.50/$15.00 instead of
  $0.20/$1.25 — 12.5× too high. This over-reports (caps trip early), so
  it is not a spend bug, but it makes the ledger untrustworthy in the
  other direction. Sort candidates by key length descending.
- **Public tools are unattributed but reasonably contained.**
  `/api/free-check` and `/api/tools/*` use server keys with no
  `tenantId`, so they are outside the ledger and the caps — but they are
  IP rate-limited (1–3/day) against the Postgres-backed limiter and
  read through `withCacheAndRetry`. The residual risk is an attacker
  rotating IPs with *distinct* inputs, which defeats the cache; worth a
  global daily ceiling on these routes rather than per-IP only.
- **`ChatGPT` is still not grounded**, as `docs/UNIT-ECONOMICS.md`
  already flags. Fixing that adds ~$0.030/call and roughly doubles every
  figure in that document. Do §1 and §2 before considering it.
- **Trial exposure.** `trial` gets 5 platforms, daily scheduled runs and
  500 monthly credits (`plan-config.ts:97`). Spent entirely on grounded
  Gemini that is ~$17.50 per free trial signup. The `free` tier's 150
  credits are ~$5.25 on the same basis. Worth gating grounded Gemini to
  paid tiers, which `docs/UNIT-ECONOMICS.md` already recommends.

---

## Recommended order

1. **Set `AI_SEARCH_BUDGET_GEMINI`** in the environment now (§1). No
   deploy, immediate ceiling on the dominant cost.
2. **Rate-limit `PUT /api/brands/[id]/accuracy`** (§4). One line, closes
   the only user-triggerable unbounded loop found.
3. **Record cost on the failure path** (§2). Until this lands, no number
   in the app can be trusted against the invoice — including any
   before/after measurement of the other fixes.
4. **Fix or delete the deferred retry queue** (§3).
5. **Cache Regional Audits** (§5) and **cap autopilot generation** (§7).
6. Then reprice / re-weight credits (§8) with a ledger that is finally
   telling the truth.

Steps 1–2 are config-and-one-line. Step 3 is the one that turns this
from a guess into a measurement, and it should land before anyone
concludes the problem is solved.

---

# Addendum — Claude specifically (2026-08-23)

Follow-up after the report above: the operator reports that **Claude**
spend in particular has gone wild. That is a narrowing signal, and it
points somewhere the original ranking did not — the report above ranked
grounded Gemini first on per-call fees. For Claude the mechanism is
different: it is **output tokens on a reasoning model**, and three
commits landed within eight days that compound into it.

Claude's default model is `claude-fable-5` at **$3/1M in, $15/1M out**
(`MODEL_PRICING`, `src/lib/ai-platforms.ts:835`) — the highest output
price of any default model in the lineup. Everything below multiplies
against that number.

## A. The output budget on JSON generations went up 7.5×–22× on Aug 18

`#756` (c334954, Aug 18) rewrote `generateJson`
(`src/lib/fix-engine/generate.ts:212`). Before, it was one call at the
module's own budget:

```ts
const out = await generateContent(args);          // before #756
```

After, it floors the budget and adds a doubled retry:

```ts
export const JSON_MIN_BUDGET = 3000;
const budget = Math.max(args.maxTokens ?? 1500, JSON_MIN_BUDGET);
let out = await generateContent({ ...args, maxTokens: budget });
if (data === null) {
  out = await generateContent({ ...args, maxTokens: budget * 2 });
}
```

**21 of the 22 Fix Engine modules use `generateJson`.** Their declared
content budgets are mostly far below the new floor:

| Module | Declared | Floored to | Ceiling change |
|---|---|---|---|
| `title-rewrite`, `meta-rewrite`, `og-cards` | 400 | 3,000 | **7.5×** |
| `content-freshness`, `hallucination-correction` | 500 | 3,000 | **6×** |
| `internal-linking` | 800 | 3,000 | 3.75× |
| `image-alt`, `schema-markup`, `external-citations` | 900 | 3,000 | 3.3× |
| `comparison-pages`, `content-gap` | 2,600 | 3,000 | 1.15× |

Add the parse-failure retry at `budget * 2` and a single `title-rewrite`
generation can now emit up to **9,000 output tokens** (3,000 + 6,000)
where it was previously capped at 400. At $15/1M that is a ceiling of
$0.135 against $0.006 — a **22× worst case**.

The commit's reasoning is sound as far as it goes, and its header states
it:

> *max_tokens is a CEILING, not a spend: providers bill the tokens
> actually produced, so a small cap saves nothing - what it does is cut
> a reasoning model off mid-object once its thinking has eaten the
> budget.*

That is true of a **non-reasoning** model. It is not true of this one.
On a reasoning model the thinking tokens are billed as output tokens and
they expand to fill the headroom they are given. The commit's own
diagnosis proves the point: the failure it was fixing was thinking
alone exceeding a 400-token cap. Raising the cap to 3,000 does not just
*permit* a longer reply — it *licenses* up to 3,000 tokens of billed
thinking on every generation, on the most expensive output-priced model
in the product.

This is not an argument that #756 was wrong. The generations genuinely
were failing, and a floor was the right shape of fix. The problem is
that it was applied to the model least able to absorb it, with no knob
to tune it and no cost model updated to match.

## B. Aug 17 turned Claude from "billed and discarded" into "billed and used"

`#754` (76b80e9, Aug 17) fixed `extractAnthropicText`. Its own commit
message describes the prior state exactly:

> *A reasoning model puts a `thinking` block first … In both cases the
> request had succeeded, **tokens were spent and billed**, and the
> caller was handed an empty string.*

Before that fix, `generateContent`
(`src/lib/fix-engine/generate.ts:86`) saw the empty string, pushed
`"Claude: empty response"`, and fell through to ChatGPT and then Gemini.
So Claude was being paid for and then bypassed — the visible work was
done by the cheaper platforms.

After the fix, Claude succeeds. And Claude is **first in line
everywhere**:

- `GENERATION_PLATFORMS = ['Claude', 'ChatGPT', 'Gemini']`
  (`generate.ts:62`) — every Fix Engine generation.
- `GENERATOR_PLATFORM_ORDER = ['claude', 'openai', …]`
  (`src/lib/generator-key.ts:24`) — prompt discovery
  (`prompt-discovery.ts:563`) and prompt map (`prompt-map.ts:235`).

So Claude's *request* count barely moved, but its share of completed,
full-length generations went from near zero to near everything — one day
before its output ceiling was raised 7.5×.

## C. `jsonMode` is silently ignored on Claude

`options.jsonMode` is honoured by exactly one platform. The only two
references in the call layer are both in the Gemini branch
(`src/lib/ai-platforms.ts:1659`, `1660`). The Claude request body is:

```ts
body: JSON.stringify({ model: useModel, max_tokens: maxTok,
                       system: sysPrompt, messages: [...] })
```

No structured-output enforcement of any kind. ChatGPT, Perplexity and
Grok ignore it too — no `response_format: {type:'json_object'}`.

The consequence is circular, and it lands on Claude because Claude is
first: the callers that ask for JSON (`prompt-discovery.ts:583` at
3,000 tokens, `prompt-map.ts:257` at 4,000, and all 21 `generateJson`
modules) get no enforcement, so parse failures are more likely, so the
doubled-budget retry in §A fires more often. Each of those retries is a
second full-price Claude call.

`prompt-discovery` has its own version of the same loop — two attempts
at `maxTokens: 3000` (`prompt-discovery.ts:578-597`) — for the same
reason.

## D. Claude's retry budget is 2.5× what its own comment claims

The Claude branch passes no `retryConfig` to `fetchAI`
(`ai-platforms.ts:2142-2147`), so it takes the defaults:

```ts
const MAX_RETRIES = retryConfig?.maxRetries ?? (Number(process.env.AI_MAX_RETRIES) || 5);
const CALL_MAX_RETRY_SLEEP_MS = retryConfig?.maxSleepMs ?? MAX_RETRY_SLEEP_MS;  // 90000
```

The `FetchAiRetryConfig` doc-comment immediately above says
*"Overrides AI_MAX_RETRIES (default 2)"* and *"(default 15000)"*, and
`MAX_RETRY_SLEEP_MS`'s own comment says *"15s default mirrors the 'two
short backoffs' intent of MAX_RETRIES=2"* — while the constant is
actually `90000`. The comments describe an older configuration.

ChatGPT was given explicit per-call retry caps during the cost work
(1 attempt on the search path, 3 otherwise). Claude never was, so it
retries up to 5 times with a 90-second sleep budget. Anthropic's 529
"overloaded" is treated as a 5xx and retried; each retry that reaches
the model is billed.

## E. Claude tracking calls are probably being paid for and discarded

Separate from the spend spike, and worth checking while you are in here.

Tracking runs pass no `maxTokens`, so they take
`MAX_OUTPUT_TOKENS = 100` (`ai-platforms.ts:67`). A reasoning model
given a 100-token ceiling spends the whole ceiling on thinking, returns
`stop_reason: "max_tokens"`, and produces no text block — so
`extractAnthropicText` correctly returns `''`.

That empty string is then treated as a successful measurement: the
Claude branch does not throw on empty text, so the run records "brand
not mentioned" and `withCacheAndRetry` **caches the empty result for 14
days**. You would be paying for Claude tracking and storing a false
negative from it.

`#754` added exactly the log line needed to confirm this — grep for
`[claude] empty_text_response` and look at `stopReason` and
`blockTypes`. If `stopReason` is `max_tokens` with no `text` block, this
is happening.

## How to confirm all of this in one query

The token counts in the ledger are recorded from
`d.usage.output_tokens` and are trustworthy even where the USD figure is
not (`MODEL_PRICING` carries an in-code comment that `claude-fable-5`
pricing is a **placeholder** — `ai-platforms.ts:833`). Look for a step
change in `avg_out` on Aug 17–18:

```sql
SELECT date_trunc('day', created_at)::date AS day,
       COUNT(*)                            AS calls,
       ROUND(AVG(tokens_out))              AS avg_out,
       MAX(tokens_out)                     AS max_out,
       ROUND(SUM(usd_cost)::numeric, 2)    AS usd
  FROM tenant_cost_events
 WHERE platform = 'Claude'
   AND created_at >= NOW() - INTERVAL '30 days'
 GROUP BY 1 ORDER BY 1;
```

Caveat carried forward from §2 of the main report: this ledger only
records **successful** calls, so it is a floor on both call count and
spend, not the truth. Compare it against the Anthropic console's own
usage page for the same days — the gap between them is itself a
measurement of finding §2.

## There is no env knob to turn any of this down

Worth stating plainly, because it changes what "mitigate today" means.
ChatGPT has a dozen cost knobs — `CHATGPT_SEARCH_BUDGET_DAILY`,
`CHATGPT_NONSEARCH_MODEL`, `CHATGPT_SEARCH_CONTEXT_SIZE`,
`CHATGPT_SEARCH_MAX_ATTEMPTS`, `AI_CHATGPT_MAX_RETRIES`,
`AI_CHATGPT_MIN_DELAY_MS`. Claude has **none**. Its model, its output
budget and its retry count are all hard-coded, and `JSON_MIN_BUDGET` is
a plain exported constant. `AI_MAX_OUTPUT_TOKENS` exists but is global —
turning it down would hit every platform's tracking calls, not Claude's
generations.

So unlike finding §1 in the main report, this one cannot be mitigated
from the environment. It needs a deploy.

## Recommended, in order

1. **Move generation off Fable 5.** `claude-haiku-4-5` is
   $0.80/$4.00 against $3.00/$15.00 — **3.75× cheaper on output**, which
   is the dimension that is hurting. For title/meta/alt-text rewrites
   the quality difference is unlikely to be visible. One line in
   `PLATFORM_MODELS`, or better, an `AI_CLAUDE_MODEL` env knob so this
   is tunable next time without a deploy.
2. **Make `JSON_MIN_BUDGET` an env var**, and set the floor per-model
   rather than globally — a reasoning model needs the headroom, Haiku
   does not.
3. **Send `response_format: {type:'json_object'}` on OpenAI and a
   prefill / tool-schema on Claude** so `jsonMode` stops being a no-op
   (§C). This cuts the doubled-budget retries at the source rather than
   paying for them.
4. **Give Claude an explicit `retryConfig`** the way ChatGPT has one,
   and fix the three doc-comments that claim defaults of 2 and 15000
   (§D).
5. **Reconsider Claude-first ordering** in `GENERATION_PLATFORMS` and
   `GENERATOR_PLATFORM_ORDER`. Being first on the most expensive model
   is a deliberate quality choice, but it should be a knob.
6. **Check §E** against the logs, and if confirmed, either raise
   `maxTokens` for Claude tracking or drop Claude from tracking
   defaults. Paying for a measurement that always reads "not mentioned"
   is worse than not measuring.

Item 1 alone is a ~3.75× cut on the line that is spiking. Items 1–2 are
small and can ship together.

## How this changes the main ranking

The report above ranked by expected dollar impact across the whole
product. Given the operator's signal that Claude specifically is the
problem, §A + §B belong at the top of that list — above grounded Gemini
— because they are recent (Aug 17–18), they compound, and they land on
the highest output-priced model in the lineup.

Findings §2 (failure-path ledger) and §7 (uncapped autopilot generation)
from the main report both amplify this one: autopilot generation is
uncapped at up to 500 fixes per 15-minute tick, and every one of those
is a Claude call at the new budget. 500 generations at the new ceiling
is roughly **$25 of Claude in a single cron tick for one brand**. Check
`fix_automation` for rows with `autopilot_generate = true` before
anything else.
