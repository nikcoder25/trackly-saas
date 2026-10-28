# Livesov Connector (WordPress plugin)

Applies Livesov Fix Engine **Channel B** instructions — `llms.txt`,
`robots.txt` AI-crawler access, `<head>` schema/meta — and **ship-as-draft**
page edits to a WordPress site. The plugin is **outbound-only**: it pulls
instructions from Livesov, applies them, and acknowledges. Nothing needs
inbound access to the site.

The user-facing install guide lives at
[`/integrations/wordpress`](https://livesov.com/integrations/wordpress).

## Install

1. Download `livesov-connector.zip` from
   [livesov.com/integrations/wordpress](https://livesov.com/integrations/wordpress)
   and upload it via **Plugins → Add New → Upload Plugin**. (Or, from a
   checkout, copy this whole directory — minus `tests/` — to
   `wp-content/plugins/livesov-connector/`.)
2. Activate **Livesov Connector**.

### Connect — one click (recommended)

3. In WordPress: **Settings → Livesov Connector → Connect with Livesov**.
4. Approve the site for a brand in Livesov. You're bounced back and the
   credentials fill in automatically — no copy-paste. The first sync runs
   immediately.

This is an OAuth-style handshake: the browser only ever carries a
short-lived, single-use code; the plugin exchanges it server-to-server for
the token + signing secret, so the secret never appears in the URL.

### Connect — manually (fallback)

3. In Livesov: **Fix Engine → Connections → Connector plugin → Pair**. Copy
   the **Pull URL**, **Token**, and **Signing secret** (shown once).
4. In WordPress: **Settings → Livesov Connector → Connect manually**, paste
   the three values, Save. Click **Poll now** to apply anything pending.

## How it works

- A wp-cron job runs every 5 minutes: `GET {pull_url}` with
  `Authorization: Bearer {token}`.
- Each instruction is HMAC-verified with the signing secret
  (`sha256(id|op|sha256(content))`) before it's applied.
- Supported operations:
  - `write_file` — writes allow-listed root files only: `/llms.txt`,
    `/robots.txt`, `/.well-known/*` (traversal/other paths rejected).
  - `patch_robots` — appended to WordPress's virtual robots.txt via the
    `robots_txt` filter.
  - `set_header_block` — printed on `wp_head` (no theme files are edited).
  - `stage_content` — computes the page edit (title / meta / canonical /
    body) and parks it behind a **tokenised preview URL** **without changing
    the live page**. Returns the preview URL and the detected builder in the
    ack.
  - `publish_content` — promotes the staged change to live, after
    snapshotting the previous state (post content *and* builder data) so it
    can be undone from **Settings → Livesov Connector**.

An instruction that throws is caught and acked as a failure with the reason,
rather than escaping into wp-cron — where it would kill every instruction
queued behind it and, because the ack never sent, be re-sent forever.
- After applying, the plugin `POST`s `{pull_url}/{id}/ack` (with a `detail`
  object, e.g. the preview URL for `stage_content`). On success the fix is
  marked delivered in Livesov; on failure it's flagged with the reported
  reason and re-tried on the next poll.

## Page builders

A WordPress page is only *sometimes* its `post_content`. Elementor renders a
JSON tree from postmeta and ignores `post_content` entirely; Beaver Builder
keeps a serialized node graph; Divi and WPBakery keep shortcodes; Bricks and
Oxygen each have their own meta key. Writing a fix into `post_content` on an
Elementor site is the classic silent failure: the update succeeds, the tool
reports success, and the live page is unchanged.

So content edits go through a builder adapter (`includes/builders.php`):

| Builder | Detected by | Content lives in | Rewrite passage | Add block |
|---|---|---|---|---|
| Gutenberg | `<!-- wp:` in body | `post_content` | yes | native (`wp:html`) |
| Classic | fallback | `post_content` | yes | native |
| Elementor | `_elementor_edit_mode` | `_elementor_data` (JSON) | yes | native (html widget) |
| Divi | `_et_pb_use_builder` | `post_content` (shortcodes) | yes | native (section) |
| WPBakery | `_wpb_vc_js_status` | `post_content` (shortcodes) | yes | native (row) |
| Beaver Builder | `_fl_builder_enabled` | `_fl_builder_data` (serialized) | yes | content filter |
| Bricks | `_bricks_page_content_2`, `_bricks_editor_mode` | that meta (array) | yes | native (text element) |
| Oxygen | `ct_builder_json`, `ct_builder_shortcodes` | JSON meta, shortcode fallback | yes | refused |

Where a native node can't be synthesised safely, the block falls through to a
`the_content` filter — after the builder's output rather than inside it. A
block in slightly the wrong place is cosmetic; a malformed node written into
someone's layout data is a broken site. The ack reports which path was taken
(`nativeAppend`).

That fallback is only offered to builders whose front end actually runs
`the_content` (`renders_the_content()`). Oxygen and Bricks render their own
templates and never call it, so a block handed to the filter there would be
applied, acknowledged, and never appear — the exact silent failure this layer
exists to prevent. Bricks therefore appends natively; Oxygen refuses with an
error telling the user to add the block in the builder.

Oxygen note: 3.6+ stores the element tree as JSON in `ct_builder_json`, with
the older shortcode form still present in `ct_builder_shortcodes` on many
installs. The JSON is preferred (walking a tree finds prose wherever the
schema puts it) and is decoded defensively — stored copies routinely carry a
UTF-8 BOM and one to three rounds of WordPress slashing, so the layers are
peeled off until it parses and re-applied on write.

### Why it refuses things

`includes/text.php` locates a passage by projecting the source down to
visible text — entities decoded, whitespace collapsed, tags and shortcodes
skipped — while tracking the source byte span each character came from. A
replacement is applied only when the passage is unambiguous **and** its span
crosses nothing but inline formatting. Spanning a shortcode, a block
delimiter, or a section wrapper is refused with a reason, as is a passage
that appears twice or no longer exists. Full-body replacement (`bodyHtml`) is
refused on builders that store layout outside the post body.

A failed fix is a retry. A corrupted layout is a rebuild.

## SEO fields (`includes/seo.php`)

A patch's `title` is the post title. Its `metaDescription`, `canonical` and
`indexable` are not — WordPress core has nowhere to store them, since a meta
description is entirely an SEO plugin's concept. So they are written into
whichever of **Yoast** and **Rank Math** is active, which keeps that plugin
the single source of truth for the page rather than fighting it from
`wp_head`:

| Field | Yoast | Rank Math |
|---|---|---|
| SEO title | `_yoast_wpseo_title` | `rank_math_title` |
| Meta description | `_yoast_wpseo_metadesc` | `rank_math_description` |
| Canonical | `_yoast_wpseo_canonical` | `rank_math_canonical_url` |
| Indexable | `_yoast_wpseo_meta-robots-noindex` = `2` | `rank_math_robots` = `['index']` |

Clearing a noindex sets *explicit* index rather than deleting the override,
because deleting reverts to the site-wide default — which may itself be
noindex for that post type, leaving the page just as invisible.

If neither plugin is active there is nowhere to put these fields. The ack
reports which plugins were written to (`seo`) and which fields landed
(`seoFields`), so Livesov can say the page edit shipped but the meta
description did not, instead of reporting a clean success.

## Undo across retries

The pre-publish snapshot is taken immediately before the write, so re-taking
it on a **retry** would capture the already-published page and destroy the
only copy of the original. Retries are routine — an instruction is re-sent
whenever its ack does not reach Livesov. So a snapshot already taken for the
same instruction id is kept (`Lvx_Publish::should_snapshot`); one from a
different instruction is stale and is replaced.

## Tests

The adapters rewrite markup we did not author, so the logic is unit tested
against fixtures shaped like what each builder really stores. No WordPress
install needed — the harness stubs the few WP functions involved.

```bash
php connector-plugin/tests/run.php        # adapters, text primitive, patch layer
php connector-plugin/tests/verify-zip.php # committed zip matches the source
```

Both run in CI (`.github/workflows/test.yml`, job **WordPress connector
plugin**).

## Security

- The token authenticates per-brand and is revocable from Livesov
  (re-pair to rotate). Livesov stores only its hash.
- The signing secret lets the plugin reject tampered instructions.
- File writes are constrained to the root-file allow-list above.

## Releasing a new version

This directory is the source of truth. After editing it, bump `Version:` in
the plugin header **and** `LVX_CONN_VERSION`, then regenerate the zip the
download page serves:

```bash
cd trackly-nextjs && node scripts/build-connector-zip.mjs
```

That writes `trackly-nextjs/public/wordpress-plugin/livesov-connector.zip`
(committed, reproducible — every `.php` file here except `tests/`). Update
`PLUGIN_VERSION` in
`trackly-nextjs/src/app/(public)/integrations/wordpress/page.tsx` to match.
CI fails if the zip drifts from the source.
