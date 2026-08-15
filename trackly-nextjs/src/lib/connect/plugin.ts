/**
 * The WordPress Connector plugin download, in one place.
 *
 * Two screens offer this zip — the public /integrations/wordpress page and
 * the in-app Connect Site page — and the version is printed next to both
 * buttons. Keeping it here means a release bumps one constant instead of
 * leaving a second copy quietly claiming the old version.
 *
 * The zip itself is built from `connector-plugin/` by
 * `scripts/build-connector-zip.mjs`; CI fails if it drifts from the source.
 * On release, bump `Version:` and `LVX_CONN_VERSION` in the plugin, rebuild
 * the zip, and bump PLUGIN_VERSION here.
 */

export const PLUGIN_VERSION = '1.3.0';

export const PLUGIN_DOWNLOAD_URL = '/wordpress-plugin/livesov-connector.zip';

/** How long after its last poll the Connector is still considered online.
 *  The plugin polls every 5 minutes; 12 gives it two missed beats before we
 *  call it offline, which matches the Fix Engine's connections panel. */
export const CONNECTOR_ONLINE_MS = 12 * 60_000;
