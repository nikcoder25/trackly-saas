/**
 * The single source of truth for the WordPress Connector plugin version on
 * the TypeScript side. Must match the plugin header and LVX_CONN_VERSION in
 * connector-plugin/livesov-connector.php — connector-plugin/tests/verify-zip.php
 * fails CI if they disagree.
 *
 * Why this exists: the plugin is distributed as a zip from our own pages, not
 * wordpress.org, so nothing tells an installed copy that a newer version
 * shipped. Two mechanisms close that gap, both keyed off this constant:
 *  - every plugin poll carries `LivesovConnector/x.y.z` in its User-Agent,
 *    which we record on the connection and compare against this to warn in
 *    the dashboard, and
 *  - the plugin asks /api/connector/update-check, which serves this version,
 *    so wp-admin shows its normal "update available" row.
 */

export const CONNECTOR_PLUGIN_VERSION = '1.4.0';

/** Where the built zip is served from (public/, committed, CI-verified). */
export const CONNECTOR_PLUGIN_ZIP_PATH = '/wordpress-plugin/livesov-connector.zip';

/**
 * Extract the plugin version from the connector's User-Agent
 * (`LivesovConnector/1.3.1; https://example.com/`). Null when the UA isn't
 * the connector's — the header is client-controlled, so no version is
 * recorded rather than junk.
 */
export function parseConnectorVersion(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const m = /^LivesovConnector\/(\d+\.\d+\.\d+)(?:;|\s|$)/.exec(userAgent.trim());
  return m ? m[1] : null;
}

/** Numeric semver comparison: negative when a < b, 0 when equal. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Is an installed connector behind the shipped version? Unknown versions
 * (pre-1.4.0 installs whose UA was never recorded, or a null) are treated as
 * outdated — every version that predates recording IS outdated.
 */
export function isConnectorOutdated(installed: string | null | undefined): boolean {
  if (!installed || !/^\d+\.\d+\.\d+$/.test(installed)) return true;
  return compareVersions(installed, CONNECTOR_PLUGIN_VERSION) < 0;
}
