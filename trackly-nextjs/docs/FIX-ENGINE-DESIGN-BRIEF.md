# Fix Engine — Design Brief

A spec for (re)designing the **Fix Engine** dashboard tab. Hand this to a
designer or a design tool. It describes every screen, component, state,
and the exact data each shows — all of it backed by an API that already
exists, so the design maps 1:1 to working endpoints.

---

## 1. What it is (context)

The Fix Engine finds SEO/GEO problems on a customer's website, generates
the fix with AI, lets the user preview & approve it, ships it to their live
site, and re-checks it worked. One uniform loop for every fix type:

> **detect → generate → preview → approve → ship → recheck**

It lives as one tab ("Fix Engine") inside the existing Livesov dashboard
(`/dashboard-v2`), scoped to the currently selected brand. It should feel
native to that dashboard: same design tokens (light/dark, accent color,
compact/comfortable density), same card/badge/button vocabulary.

Audience: SEO-savvy marketers and agency operators. Tone: confident,
precise, trustworthy. Shipping changes to a live website is consequential —
the design must make state, risk, and the human approval gate very clear.

---

## 2. The core mental model to convey

A **pipeline**. Every fix is a card moving left→right through stages. The
design should make "where is this fix in its lifecycle?" instantly legible.

Statuses (the engine's real values):
`detected → generating → generated → approved → shipping → shipped → verified`
plus `failed` and `reverted`.

Suggested visual grouping for users:
- **Found** (detected)
- **Drafted** (generating, generated)
- **Approved** (approved)
- **Live** (shipping, shipped, verified)
- **Needs attention** (failed, reverted)

---

## 3. Screens & layout

### 3.1 Tab header
- Title "Fix Engine" + one-line subtitle.
- Primary action: **Run scan** (shows count of selected modules).
- Secondary: **Refresh**.
- When the user's plan can't use it: replace actions with an **Upgrade**
  state (see §6 plan-gating).

### 3.2 Summary strip (KPIs)
Five counters from the fix list: **Found, Drafted, Live, Verified, Needs
attention**. Failed count is emphasized (danger) when > 0. Consider a thin
pipeline/progress visualization here.

### 3.3 Connections panel
Three integrations, each a row with status + action. This is a prerequisite
surface — fixes can't ship without the right connection, so make missing
connections noticeable but not alarming.

- **CMS (ship target)** — e.g. WordPress. States: not connected / connected
  (`wordpress · example.com`). Action: Connect / Reconnect. Connect opens a
  small form: CMS type (select), Site URL, Username, Application Password,
  with helper text "verified against your site, then encrypted."
- **Google Search Console** — powers data-driven modules. States: not
  connected / connected (`https://example.com/`). Action: Connect (OAuth
  redirect) / Reconnect.
- **Connector plugin** — needed for technical/file fixes (robots.txt,
  llms.txt, head tags). States: not paired / paired. Action: Pair / Re-pair.
  On pair, reveal a **one-time secret panel**: Pull URL, Token, Signing
  secret — each copyable, with a strong "shown once, copy now" warning.

Design needs: a clear "connected/active" affirmative state, a "needs setup"
state, and the one-time-credentials reveal (treat like an API key reveal).

### 3.4 Modules / scan picker
A selectable list (or grid) of the available fix modules. Each module shows:
- Title + one-line description.
- **Channel** badge: A (REST/CMS) vs B (Connector).
- **Trigger** chip: crawl / gsc / manual.
- A checkbox to include it in the next scan.
- If the plan doesn't allow it: dimmed + "needs Pro" badge, not selectable.
- Group by phase/theme (see §8 module list).

Below the list: a scan status line ("Scanning… found 7 issues", "Scan
complete — 7 issues found", or error). The scan runs in the background and
polls; show indeterminate progress, then resolve.

### 3.5 Targeted passage rewrite (manual tool)
A distinct card: **"Optimize a specific passage."** Inputs:
- Page URL.
- A textarea — paste the exact paragraph/lines.
- Instruction (e.g. *make it more concise; target "best CRM for startups"*).
- Action: **Rewrite passage** → creates a fix that appears in the list,
  auto-drafted for review.
- Helper: "the exact text must exist on the page so it can be replaced in
  place." Design an error affordance for "passage not found."

### 3.6 Fix list
Filter chips by status group (All / Found / Drafted / Approved / Live /
Needs attention) with counts. Then the list of **fix cards** (§4).
Empty state: "Run a scan to detect fixes for <brand>."

---

## 4. The fix card (most important component)

One card per fix. Must read at a glance and adapt its actions to status.

Always shows:
- **Module title** (e.g. "Title tag rewrite", "Striking distance").
- **Status** pill (color-coded by stage group).
- **Severity** badge: critical / high / medium / low.
- **Channel** badge: Ch A / Ch B.
- **Summary** (e.g. "Title is 71 chars (too long)").
- **Target URL** (link, monospaced, truncates gracefully).
- Optional **score** pill once verified (0–100).
- Optional **error** line (when failed) — calm, explanatory, with a retry.

**Preview** (expand/inline) — three render kinds the API returns:
- `text-diff` — before (struck-through) vs after. Used by title/meta/
  canonical/passage rewrites.
- `code-block` — monospaced block with a language (html/json/markdown/text).
  Used by schema, llms.txt, GEO content, OG head block, robots directives.
- `key-values` — labeled list. Used by FAQ, citable passages, internal
  links, citations.

**Actions by status** (only show what's valid):
- detected / failed → **Generate**
- generated → **View preview**, **Regenerate**, **Approve**
- approved → **Ship to site** (emphasized; this is the consequential one)
- shipped / verified → **Re-check**

Design the **approval gate** to feel deliberate — shipping writes to a live
site. A confirmation affordance on "Ship" is welcome. Viewers (read-only
team members) should see actions disabled with a hint.

Card states to design: loading/generating (skeleton or spinner on the
card), busy (per-action), success transitions, failed.

---

## 5. The lifecycle, made visible

Somewhere (card detail, or a per-fix mini-stepper) show the 6-step pipeline
with the current step highlighted and prior steps checked. Optional: a
per-fix activity/audit trail (detected → generated → approved → shipped →
verified, with timestamps) — the backend records these events.

---

## 6. Cross-cutting states (please design all)
- **Loading** — first load of the tab.
- **Empty** — no fixes yet (pre-scan).
- **No brand selected** — prompt to pick/add a brand.
- **Plan-gated** — Fix Engine needs Starter+; show an upgrade card; some
  modules need Pro (dim + badge).
- **Error** — API/network errors, surfaced calmly.
- **Connection-missing on ship** — ship returns "connect your CMS / pair
  the Connector first" — design this inline nudge.
- **Success toasts** — "Connected", "Shipped", "Passage rewrite created".

---

## 7. Visual & UX guidance
- Inherit the existing dashboard's tokens (don't invent a new palette);
  support **light and dark** and **compact/comfortable** density.
- Color-encode the two axes users scan by: **status** (stage) and
  **severity** (urgency) — keep them visually distinct so they don't clash.
- Channel A vs B should be subtle (a quiet badge), not dominant.
- Monospace for URLs, tokens, code previews.
- Accessibility: status/severity must not rely on color alone (use
  text/icons too); copyable secrets need accessible labels; full keyboard
  path through scan → review → approve → ship.
- Motion: light. A satisfying micro-confirmation on "Verified" is nice;
  avoid anything that slows power users running many fixes.

---

## 8. The 19 modules (for the catalog)

Group A — **On-page & content**: title-rewrite, meta-rewrite,
geo-page-rewrite, faq-schema, passage-rewrite (manual), internal-linking,
external-citations, citable-passages.

Group B — **Search Console driven**: striking-distance (flagship/highest
ROI), ctr-rescue, indexing-repair, canonical-fix.

Group C — **Technical / crawlability**: robots-ai-access, noindex-removal,
schema-markup, og-cards, llms-txt.

Group D — **GEO differentiators**: comparison-pages,
hallucination-correction.

Each carries: channel (A/B), trigger (crawl/gsc/manual), min plan, a
one-liner. The flagship (striking-distance) can be visually featured.

---

## 9. Data contract (so designs use real fields)

`GET /api/brands/[id]/fixes` →
```jsonc
{
  "enabled": true,          // plan allows the engine
  "plan": "pro",
  "catalog": [{
    "key": "title-rewrite", "title": "Title tag rewrite",
    "description": "...", "channel": "A", "trigger": "crawl",
    "minPlan": "starter", "phase": 1, "available": true
  }],
  "fixes": [{
    "id": "uuid", "moduleKey": "title-rewrite", "channel": "A",
    "targetUrl": "https://example.com/x", "status": "generated",
    "severity": "medium", "summary": "Title is 71 chars (too long)",
    "scoreAfter": null, "error": null, "createdAt": "..."
  }]
}
```

`GET /api/brands/[id]/fixes/[fixId]` →
```jsonc
{ "fix": { ... },
  "preview": { "kind": "text-diff", "label": "Title tag",
               "before": "old", "after": "new", "language": null } }
```

Scan: `POST /api/brands/[id]/fixes` → `{ batchId }`; poll
`GET .../fixes/batches/[batchId]` → `{ batch: { status, received,
totalExpected } }`.

Actions: `POST .../fixes/[id]/{generate|approve|ship|recheck}` → `{ fix }`.

Connections: `GET/POST /api/brands/[id]/connections`; GSC connect
`GET .../connections/gsc/start` → `{ url }`; Connector pair
`POST .../connections/connector/pair` → `{ token, hmacSecret, pullUrl }`.

Targeted: `POST .../fixes/targeted { url, passage, instruction }` → `{ fix }`.

---

## 10. Deliverables to ask the design tool for
1. The Fix Engine tab — full layout (light + dark), populated state.
2. The fix card in every status (found / drafted+preview / approved /
   shipped / verified+score / failed).
3. The three preview kinds (text-diff, code-block, key-values).
4. Connections panel incl. the one-time Connector credentials reveal and
   the CMS connect form.
5. Targeted passage-rewrite card (idle + result + not-found error).
6. Empty, loading, plan-gated, and error states.
7. The scan flow (picker → in-progress → results).

Once the design is ready, it maps directly onto the existing components in
`src/app/dashboard-v2/pages/fixes.tsx` and the API above — implementation
is a restyle, not a rebuild.
