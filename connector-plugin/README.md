# Livesov Connector (WordPress plugin)

Applies Livesov Fix Engine **Channel B** instructions — `llms.txt`,
`robots.txt` AI-crawler access, `<head>` schema/meta — and **ship-as-draft**
page edits to a WordPress site. The plugin is **outbound-only**: it pulls
instructions from Livesov, applies them, and acknowledges. Nothing needs
inbound access to the site.

## Install

1. Copy `livesov-connector.php` into `wp-content/plugins/livesov-connector/`
   (or zip it and upload via **Plugins → Add New → Upload Plugin**).
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

3. In Livesov: **Fix Engine → Connections → Pair Connector**. Copy the
   **Pull URL**, **Token**, and **Signing secret** (shown once).
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
  - `stage_content` — saves a page edit (title / meta / canonical / body) as
    a **draft revision** via `wp_create_post_autosave` **without changing the
    live page**, and returns a preview URL in the ack. For ship-as-draft.
  - `publish_content` — promotes the staged change to live via
    `wp_update_post` (which snapshots the prior content into a revision, so
    it's reversible from **wp-admin → Revisions**).
- After applying, the plugin `POST`s `{pull_url}/{id}/ack` (with a `detail`
  object, e.g. the preview URL for `stage_content`). On success the fix is
  marked delivered in Livesov; on failure it's flagged with the reported
  reason and re-tried on the next poll.

## Security

- The token authenticates per-brand and is revocable from Livesov
  (re-pair to rotate). Livesov stores only its hash.
- The signing secret lets the plugin reject tampered instructions.
- File writes are constrained to the root-file allow-list above.
