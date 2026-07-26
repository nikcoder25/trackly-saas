# Competitor page matrix — build plan

**Target:** 19 competitors × 6 page types = 114 buy-intent pages.
**Rule:** build 20, measure, then scale. Do not ship 114 at once.

---

## 0. Audit update (2026-07-26) — plan revised after checking live pages

Before building batch 1, every live public page was audited for keyword
overlap. The audit changed the plan materially — read this section first; it
supersedes the type list and batch below where they conflict.

### Collisions found on the LIVE site

The 5 `/vs/` pages were bidding on the alternatives pages' primary terms:

| Borrowed term | Correct owner | Was also on |
|---|---|---|
| `profound alternative` | `/profound-alternative` | `/vs/profound` |
| `peec ai alternative` | `/peec-ai-alternative` | `/vs/peec-ai` |
| `otterly alternative` | `/otterly-ai-alternative` | `/vs/otterly` |
| `semrush alternative for ai` | (alt page, not built) | `/vs/semrush` |
| `ahrefs alternative for ai` | (alt page, not built) | `/vs/ahrefs` |

Plus `{tool} review` and `{tool} pricing` terms sat on the `/vs/` pages,
pre-claiming the exact keywords the proposed Review and Pricing page types
would have targeted.

### What Phase 0 shipped (this change)

- **`primaryKeyword`** field on every alternative entry; one owned term per page.
- **Borrowed terms stripped** from all 5 `/vs/` pages (`{tool} alternative`, `{tool} review`, `{tool} pricing` removed; `livesov vs {tool}` + `{tool} vs livesov` kept).
- **`src/data/seo-registry.ts`** — single source of truth mapping each commercial URL → its one primary keyword.
- **`tests/keyword-ownership.test.ts`** — CI guard: fails if two pages share a primary keyword, or if any page's keyword list even *contains* another page's primary term. Verified to catch the original collisions.

### Revised type list — 4 types, not 6

| Type | Verdict | Reason |
|---|---|---|
| Alternatives | **Keep** | Proven; owns `{tool} alternative` |
| Vs | **Keep + expand** | Cheapest column; owns `livesov vs {tool}`; now conflict-free |
| Competitors | **Conditional** | Only after `{tool} competitor` is parked (done); probe 3 |
| A-vs-B | **Conditional** | Non-overlapping, but must not dupe the live *Peec AI vs Promptwatch vs Livesov* blog post |
| Review | **Dropped as a type** | Term belongs to `/vs/`; add a review *section* there instead |
| Pricing | **Dropped as a type** | Term belongs to `/vs/`; and the 87% own-domain stat says the vendor wins these |

Dropping two types lowers the ceiling from 114 to ~70. Also note the **competitor
list is 17 named, not 19** — two slots still need naming from demand data.

### Revised batch 1 — 20 pages, zero collisions

- **Arm A — expand `/vs/` (6):** scrunch-ai, rankscale, athenahq, knowatoa, llmrefs, waikay. Owns `livesov vs X`; no conflict.
- **Arm B — new alternatives (6):** promptwatch, bluefish, evertune, daydream, xfunnel, goodie. No live page targets these. *(Semrush + Ahrefs alt pages dropped from batch 1 — they collided with `/vs/` and were the hardest ranks anyway.)*
- **Arm C — Competitors probe (3):** profound, peec-ai, otterly. Cleared by Phase 0.
- **Arm D — A-vs-B probe (5):** each pair checked against the existing blog post first.

Every new page adds its row to `seo-registry.ts` **before** it ships. A red CI
build means the keyword is already owned — that is the guard working.

---

## 1. Where we are today

14 of the 114 cells are already filled:

| Type | Live | Slugs |
|---|---|---|
| `/{tool}-alternative` | 9 | profound, peec-ai, otterly-ai, scrunch-ai, rankscale, knowatoa, athenahq, llmrefs, waikay |
| `/vs/{tool}` | 5 | profound, peec-ai, otterly, semrush, ahrefs |
| Other 4 types | 0 | — |

All 9 alternative pages now render from `src/data/alternatives.ts` + a shared
`AlternativePage` component, and all competitor facts route through
`src/data/competitor-roster.ts`. **That roster is the spine of this whole
plan** — every new page type reads from it, so a competitor's positioning is
written once and stays consistent across all six of its pages.

### The competitor list is 17, not 19

Named so far: Profound, Peec AI, Otterly, Scrunch, Rankscale, AthenaHQ,
Knowatoa, LLMrefs, Waikay, Promptwatch, Bluefish, Evertune, Daydream, Xfunnel,
Goodie, Semrush AI Toolkit, Ahrefs Brand Radar.

That is **17**. Two slots are unnamed. Fill them before batch 2 — and fill them
from demand data (branded search volume + how often the name shows up in
Livesov's own tracked prompts), not from memory. The two weakest names on the
list are worth re-examining at the same time: a competitor nobody searches for
produces six pages nobody reads.

---

## 2. The six page types

Ordered by expected return, best first.

| # | Type | URL pattern | Query it answers | Difficulty |
|---|---|---|---|---|
| 1 | Alternatives | `/{tool}-alternative` | "profound alternative" — actively shopping to replace | **Low.** Proven; 9 live. |
| 2 | Head-to-head | `/vs/{tool}` | "livesov vs profound" — down-funnel, we are in the query | **Low.** We own one side. |
| 3 | Competitors | `/{tool}-competitors` | "profound competitors" — early-stage landscape mapping | **Medium.** List intent; overlaps type 1. |
| 4 | Review | `/{tool}-review` | "profound review" — evaluating one tool | **Medium-high.** Needs real hands-on or it is filler. |
| 5 | Competitor-vs-competitor | `/{a}-vs-{b}` | "profound vs peec ai" — we are the neutral third party | **Medium.** Huge long tail, low volume per page. |
| 6 | Pricing | `/{tool}-pricing` | "profound pricing", "how much does profound cost" | **High — see below.** |

### The pricing type contradicts our own thesis — treat it last

The argument for shipping `/pricing` was that 87% of pricing/cost searches rank
the product's own domain. That statistic cuts both ways. It is exactly why
`livesov.com/profound-pricing` is the **hardest** of the six: for
"profound pricing", the domain that ranks is `tryprofound.com`. We would be the
third-party page fighting the vendor's own pricing page on the vendor's own
brand term.

Competitor pricing pages can still work, but only when they do something the
vendor's page structurally will not: total-cost maths, the add-ons that are not
on the pricing page, what the plan actually gets you in units you care about.
Build these **last**, build **three** as a probe, and judge them on their own
gate rather than assuming the type works.

There is a second cost: publishing a rival's prices means owning their
accuracy. Vendors change pricing silently, and a stale competitor price
published as fact is a credibility problem and a legal-adjacent one. If we
build this type, every page needs a visible "verified on {date}" stamp and a
recurring re-check, or it decays into a liability. Budget for the maintenance,
not just the build.

---

## 3. Batch 1 — the 20 pages

The point of a first batch is to **learn**, not just to ship 20 URLs. So it is
split into two arms that answer two different questions.

### Arm A — "which page type works?" (12 pages)

Hold competitor demand roughly constant; vary the page type. Take the three
competitors with the most established search demand and fill in their four
missing types.

| Competitor | Pages to build |
|---|---|
| Profound | `/profound-competitors`, `/profound-review`, `/profound-vs-peec-ai`, `/profound-pricing` |
| Peec AI | `/peec-ai-competitors`, `/peec-ai-review`, `/peec-ai-vs-otterly`, `/peec-ai-pricing` |
| Otterly | `/otterly-competitors`, `/otterly-review`, `/otterly-vs-profound`, `/otterly-pricing` |

Note `/profound-vs-peec-ai` and `/otterly-vs-profound` are distinct pairs, not
reciprocals — pick one direction per pair and canonicalise hard, or the two
URLs will split the same intent.

### Arm B — "how far down the demand curve does a proven type still pay?" (8 pages)

Hold the page type constant at the one type already proven to build; vary the
competitor. Alternatives pages for the eight competitors that do not have one:

`/promptwatch-alternative`, `/bluefish-alternative`, `/evertune-alternative`,
`/daydream-alternative`, `/xfunnel-alternative`, `/goodie-alternative`,
`/semrush-ai-toolkit-alternative`, `/ahrefs-brand-radar-alternative`

These are close to free: add a roster entry plus a data entry in
`alternatives.ts` and the existing component renders the page. Arm B is the
cheap arm — if the tail converts, scaling is trivial.

**Arm B has a real risk worth naming:** the last two are Semrush and Ahrefs.
Those are enormous domains with enormous brand authority. A
`semrush-ai-toolkit-alternative` page on a young domain is a much harder rank
than `waikay-alternative`. Do not read a flat result on those two as "the tail
does not work" — segment them out when reading the results.

### Build order

1. **Week 1** — Arm B, all 8. Pure data entry against an existing template.
2. **Week 2** — Arm A competitors + reviews (6 pages). New templates needed.
3. **Week 3** — Arm A vs-pairs + pricing (6 pages). Pricing last, as above.

Two new shared components, mirroring how `AlternativePage` already works —
`CompetitorsPage`, `ReviewPage` — plus a `PricingComparisonPage` if the pricing
probe survives its gate. Everything reads from `competitor-roster.ts`.

---

## 4. The thing most likely to kill this: cannibalisation

Six page types about the same brand is six pages competing for overlapping
queries. `/profound-alternative`, `/profound-competitors`, and `/vs/profound`
will all be judged against "profound alternative" unless each is given a
genuinely distinct job:

- **Alternative** — "I am leaving Profound, what do I move to?" → ranked list, migration angle.
- **Competitors** — "who else is in this category?" → landscape map, no switching pitch.
- **Vs** — "Livesov or Profound?" → two-way deep comparison only.
- **Review** — "is Profound any good?" → verdict on Profound alone; we appear only in the alternatives footer.

Enforce it mechanically, not by intention:

- One primary keyword per URL, written into the data file, unique across the matrix. Add a test that fails on duplicates — the same way `alternative-pages-seo.test.ts` already fails on duplicate titles.
- Distinct H1 and title patterns per type.
- Cross-link the four pages to each other so the cluster consolidates instead of competing.
- Check GSC monthly for two URLs trading positions on one query. That is the signal to merge, not to write more.

---

## 5. Measurement

### Instrument before publishing, not after

- GSC per-URL: impressions, clicks, average position, for each page's primary keyword. Baseline is zero — record the publish date per URL so cohorts are comparable.
- One analytics event per page for signup clicks. Rankings are the leading indicator; signups are the point.
- Track the target queries in Livesov itself. If ChatGPT and Perplexity start citing these pages when asked "best Profound alternative", that is the AI-visibility win, and it can arrive before the Google ranking does. It is also the more defensible one.

### Gates

New pages on this domain will not tell you anything in three weeks. Read at:

| Checkpoint | What you should see | Action if not |
|---|---|---|
| **Day 14** | All 20 indexed | Fix indexation. Nothing else matters until this is true. |
| **Day 45** | Impressions > 0 on the majority; some page in top 50 for its head term | Diagnose intent/title mismatch. Do not build batch 2. |
| **Day 90** | Per-type median position, impressions, and ≥1 signup attributable to the type | Apply the scale/kill rules below, per type. |

### Scale / kill, judged per page type

- **Scale the type** — median page in top 20 for its primary keyword by day 90, or ≥1 conversion. Build the rest of that type's column (all 19 competitors).
- **Rework** — indexed and gaining impressions but median position 20–50. Depth and internal linking, not more URLs.
- **Kill the type** — median position >50 with <100 impressions/month by day 90. Do not build the remaining 16 pages of that column. This is the entire reason for building 20 first; if nothing ever gets killed, the gate is decorative.

Arm A and Arm B answer different questions and are read separately. Arm A says
which of the six types to scale. Arm B says how far down the competitor list is
worth going. A poor Arm B result with a good Arm A result means build all six
types for the top competitors and stop at eight or ten names — a perfectly good
outcome, and ~60 pages rather than 114.

---

## 6. Honest expectations

- 114 pages is not 114 wins. On a matrix like this, a small number of pages produce most of the traffic. The batch-20 gate exists to find which cells those are before paying for the other 94.
- Thin programmatic pages targeting brand terms are precisely what search quality systems target. Each page needs something the vendor's own page does not have — total-cost maths, the migration path, the case for choosing them over us. A page that is a template with the name swapped is a liability, and 114 of them is a sitewide one.
- Every page carries a real byline now. That helps only while the content is genuinely worth a person's name being on it.
- Maintenance is the hidden cost. 114 pages describing 19 moving products is a standing obligation. Pick a re-verification cadence — quarterly at minimum — and if that is not affordable, that is an argument for a smaller matrix, decided now rather than after publishing.

---

## 7. Immediate next actions

1. Name the two missing competitors from demand data.
2. Set the primary keyword for each of the 20 batch-1 URLs; check none collides with a live page.
3. Build Arm B (8 alternative pages) — data entry only, template exists.
4. Build `CompetitorsPage` and `ReviewPage` components.
5. Instrument GSC + analytics per URL before publishing.
6. Diarise the day-14, day-45 and day-90 reads now, with a named owner.
