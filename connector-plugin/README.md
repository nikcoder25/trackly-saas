# Livesov Connector (WordPress plugin)

Applies Livesov Fix Engine **Channel B** instructions — `llms.txt`,
`robots.txt` AI-crawler access, and `<head>` schema/meta — to a WordPress
site. The plugin is **outbound-only**: it pulls instructions from Livesov,
applies them, and acknowledges. Nothing needs inbound access to the site.

## Install

1. Copy `livesov-connector.php` into `wp-content/plugins/livesov-connector/`
   (or zip it and upload via **Plugins → Add New → Upload Plugin**).
2. Activate **Livesov Connector**.
3. In Livesov: **Fix Engine → Connections → Pair Connector**. Copy the
   **Pull URL**, **Token**, and **Signing secret** (shown once).
4. In WordPress: **Settings → Livesov Connector**, paste the three values,
   Save. Click **Poll now** to apply anything pending immediately.

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
- After applying, the plugin `POST`s `{pull_url}/{id}/ack`. On success the
  fix is marked delivered in Livesov; on failure it's flagged with the
  reported reason.

## Security

- The token authenticates per-brand and is revocable from Livesov
  (re-pair to rotate). Livesov stores only its hash.
- The signing secret lets the plugin reject tampered instructions.
- File writes are constrained to the root-file allow-list above.
