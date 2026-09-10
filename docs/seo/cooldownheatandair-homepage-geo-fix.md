# Cool Down Heating and Air — Homepage Geo + Keyword Fix

**URL:** https://cooldownheatandair.org/
**Target keyword (Mastersheet, On-Page tab):** `heating and air claremore ok` — 70/mo, currently rank 20 (page 2)
**Supporting:** `hvac claremore ok` (rank 27), `ac repair claremore ok` (rank 26), `hvac services oklahoma` (140/mo)
**Audited:** 10 Sep 2026 (live HTML pull)

---

## The issue (confirmed live)

| Element | Live now | Problem |
|---|---|---|
| H1 | 24/7 Emergency HVAC Company Serving Claremore & The Green Country | City only. No `Oklahoma` / `OK`. No `heating and air`. |
| H2 (hero) | We Treat Your Home Like It's Our Own | Zero geo signal. Zero keyword. |
| Hero description | When your AC fails in July or your furnace won't start in January... | No `OK`, no `same-day`, weak emotional close, no trust proof. |
| Meta title | Cool Down Heating & Air \| AC & Heating in Claremore, OK | OK. 55 chars. Leave it. |
| Meta description | ...Claremore, Rogers County, and Green Country, OK. | OK but no 24/7 hook. Optional tweak below. |

"Green Country" is a regional nickname. Google does not treat it as a state signal. The page never says Oklahoma above the fold.

---

## The fix (copy-paste exact)

### 1. H1 — replace

**Before**
```
24/7 Emergency HVAC Company Serving Claremore & The Green Country
```

**After**
```
24/7 Emergency Heating and Air in Claremore, OK & Across Green Country
```

Why: adds the exact target keyword `heating and air` + `Claremore, OK` state signal, keeps the 24/7 urgency hook, keeps Green Country for the regional long tail. 69 chars.

---

### 2. H2 (hero headline) — replace

**Before**
```
We Treat Your Home Like It's Our Own
```

**After (recommended — keeps the emotional punch)**
```
We Treat Your Oklahoma Home Like It's Our Own
```

**Alternative (more keyword weight, less punch)**
```
Claremore, OK Homeowners Trust Us to Treat Their Home Like Our Own
```

Go with the first one. The brand line is the strongest emotional asset on the page. One word does the geo job without killing it.

---

### 3. Hero description — replace

**Before**
```
When your AC fails in July or your furnace won't start in January, you need a
dependable team. Cool Down Heating and Air serves Claremore, Rogers County, and
the greater Green Country area, offering honest AC repairs and full system
replacements with care.
```

**After**
```
When your AC quits in a 100-degree July or your furnace won't fire on the
coldest night in January, waiting is not an option. Cool Down Heating and Air
is a licensed, family-run heating and air company in Claremore, OK, serving
Rogers County and Green Country with same-day AC repair, honest upfront
pricing, and full system replacements. Free second opinions. No scare tactics,
no hidden fees.
```

What it adds: `heating and air`, `Claremore, OK`, `Rogers County`, `same-day AC repair`, `licensed`, `family-run`, `free second opinions`, `no hidden fees`. Emotion moves from generic ("you need a dependable team") to specific pain and specific relief.

---

### 4. Second geo touch further down (1-word edit)

**Before**
```
Proudly Serving Claremore and All of Green Country
```

**After**
```
Proudly Serving Claremore, OK and All of Green Country
```

---

### 5. Meta description — optional tweak

**Before** (143 chars)
```
Cool Down Heating & Air provides honest AC repair, heating, and system
replacement services in Claremore, Rogers County, and Green Country, OK.
```

**After** (156 chars)
```
24/7 heating and air in Claremore, OK. Honest AC repair, furnace service, and
system replacements across Rogers County and Green Country. Free 2nd opinions.
```

Leave the meta title as is. It is already 55 chars with `Claremore, OK`.

---

## Cannibalisation warning (do not skip)

The Mastersheet flags the homepage beating `/claremore` on 4 identical terms (`ac repair claremore ok`: home 26 vs /claremore 58).

Rule after this change:
- **Homepage owns:** brand + `heating and air claremore ok` + `hvac claremore ok`
- **/claremore owns:** service terms — `ac repair claremore ok`, `air conditioning repair claremore ok`, `furnace repair claremore ok`

So do NOT add "AC Repair" to the homepage H1. Keep it on `heating and air`. Also still open: `/home` is a duplicate of the homepage and needs a 301 to `/`.

---

## Where to apply

WordPress + Elementor 4.2.4. All five edits are Elementor heading/text widgets on the Home page. Meta title/description is Rank Math.

## After publishing

1. Purge cache, re-crawl the URL.
2. Request indexing for `/` in Search Console.
3. Update Mastersheet On-Page tab row for `https://www.cooldownheatandair.org/` — H1 and META DESCRIPTION from `Fix` to `Done`.
