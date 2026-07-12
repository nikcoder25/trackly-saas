# Fix Engine — live smoke-test checklist

Everything in the Fix Engine is covered by unit/integration tests **except**
the parts that talk to real third-party systems: the WordPress connect flows,
the Shopify / Ghost / Webflow adapters (shipped as **beta**), the Connector
plugin's on-site ops, and edge delivery. This checklist validates those
against real accounts before you rely on them in production.

Do each section on a **staging/disposable** property first. Every content
change the engine makes is visible in the target CMS, so you can eyeball it.

---

## 0. Prerequisites

- A test brand in Livesov with a `website` set.
- Env: `APP_URL` (public https), `ENCRYPTION_KEY`, `CRON_SECRET`, DB reachable.
- The brand on a plan ≥ Starter (the Fix Engine is gated there).

---

## 1. WordPress — no-plugin connect (Application Passwords)

**One-click (recommended)**
1. Fixes tab → Connections → CMS → **Connect WordPress — one click**.
2. You should land on `your-site/wp-admin/authorize-application.php` (log in if needed) showing "Livesov Fix Engine wants to connect".
3. Approve. You should return to the dashboard with the toast **"WordPress connected — no plugin needed"**.
4. Verify the connection shows **CONNECTED**, and in WP → Users → Profile → Application Passwords there's a "Livesov Fix Engine" entry.

**Manual fallback**
5. Create an Application Password in WP yourself, paste username + password in the manual form → should verify and connect.

**Expected failure handling**
- HTTP (non-HTTPS) site → start is refused with a clear message.
- Decline on the WP screen → toast "WordPress connection was declined".

---

## 2. WordPress — apply on-page fixes (Channel A REST)

1. Run a scan. Confirm fixes appear ranked by severity then impact.
2. Take a **title-rewrite**: Generate → check the SERP preview before/after → Approve → Ship.
3. In WP, confirm the post's SEO title changed (Yoast/Rank Math field) and the live `<title>` updates. Re-check should flip it to **VERIFIED**.
4. Repeat for **meta-rewrite**, **faq-schema** (JSON-LD appended to body), **canonical-fix**, **noindex-removal** (accidental noindex cleared).
5. **Undo** a title fix → confirm the previous title is restored.

---

## 3. Ship-as-draft (Connector plugin required)

1. Install `connector-plugin/livesov-connector.php`; connect via **Connect with Livesov** (one-click) OR paste pull URL + token + secret.
2. WP → Settings → Livesov Connector → **Poll now** → status should read "connected".
3. On an approved title/meta fix, click **Ship as draft**. Status → **STAGED DRAFT**.
4. Within ~5 min (or Poll now), a **Preview** link appears. Open it (logged into WP) → the draft revision shows the new content; the live page is unchanged.
5. Click **Publish live** → within ~5 min the change is live; status → shipped → verified. Confirm wp-admin → Revisions has the prior version (reversible).

---

## 4. Site-root files (llms.txt / robots.txt) — three paths

**A. Connector plugin (auto):** approve an `llms-txt` fix → Ship → after the plugin polls, fetch `your-site/llms.txt` and confirm the content is live.
**B. Manual download (no plugin):** on the same fix, click **Download file**, upload `llms.txt` to the site root, then **Re-check** → should verify.
**C. Edge (Cloudflare):** pair the Connector, expand **Serve at the edge**, paste the generated Worker into a Cloudflare Worker on the zone, route it, then fetch `/llms.txt` and `/robots.txt` — llms.txt is served, robots.txt keeps the origin rules + appended AI directives. Ship a new llms-txt fix and confirm the edge reflects it (cache ≤ 5 min).

---

## 5. Beta adapters — Shopify / Ghost / Webflow

For each, use a disposable store/site.

**Shopify**
1. Create an Admin API access token (custom app) with read/write **pages** + metafields scopes.
2. Connections → CMS → Platform: shopify → enter `store.myshopify.com` + token → **Connect** (should verify).
3. Scan a page at `/pages/<handle>`. Ship a **title-rewrite** → confirm the page's SEO title (metafield `global.title_tag`) + page title updated. Ship a **meta-rewrite** → confirm `global.description_tag`. Body append (faq-schema) → confirm body_html.
4. Confirm `canonical-fix` / `noindex-removal` surface as "unsupported" (needs Connector/manual), not a crash.

**Ghost**
1. Create an Admin API key (Integrations). Connect with `adminApiUrl` + `id:secret`.
2. Ship title/meta/canonical on a post → confirm in Ghost admin. Body ops should report unsupported (Lexical).

**Webflow**
1. Create an API token + get the Site ID. Connect.
2. Ship title/meta on a page → confirm the page's SEO title/description updated and the site republished. Confirm the page **name** did NOT change. Body/create ops report unsupported.

---

## 6. One-click connect handshake (security)

1. From the plugin, start **Connect with Livesov**; on the consent screen confirm it names the exact site + lets you pick a brand.
2. Approve → the plugin fills in credentials automatically; confirm the token/secret never appeared in a visible URL (they're exchanged server-to-server).
3. Try an expired/replayed code (exchange the same code twice) → second attempt must fail.
4. **Revoke** the connector in the dashboard → the plugin's next poll should get 401.

---

## 7. Automation + digest

1. Enable scheduled scans (daily) + **Auto-ship safe fixes** + **Notify me after each scan**.
2. Trigger the cron (`GET /api/cron/fix-engine-scheduler` with `Authorization: Bearer $CRON_SECRET`).
3. Confirm: a scan ran, only cost-0 deterministic fixes auto-shipped, and a digest arrived at your webhook/Linear/Jira.

---

## 8. Observability

1. Take a Channel-B fix live with the plugin **offline** (deactivate it); wait past the watchdog grace window, run `GET /api/cron/fix-engine-worker` (Bearer CRON_SECRET).
2. Confirm the dashboard shows the **needs-attention** banner and the fix has a `connector.stuck` event in its history.

---

### Sign-off

| Area | Result | Notes |
|---|---|---|
| WP connect (one-click / manual) | | |
| WP Channel-A fixes + undo | | |
| Ship-as-draft (stage/publish) | | |
| Root files (plugin / download / edge) | | |
| Shopify adapter | | |
| Ghost adapter | | |
| Webflow adapter | | |
| Handshake security | | |
| Automation + digest | | |
| Observability | | |
