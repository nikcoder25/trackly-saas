/**
 * Connector plugin version plumbing: UA parsing (the dashboard's only source
 * of truth for what version a site runs), outdated detection, and the public
 * update-check endpoint the plugin's self-updater reads.
 */

import { describe, expect, it } from 'vitest';
import {
  CONNECTOR_PLUGIN_VERSION,
  CONNECTOR_PLUGIN_ZIP_PATH,
  parseConnectorVersion,
  compareVersions,
  isConnectorOutdated,
} from '@/lib/connector-version';
import { GET as UPDATE_CHECK } from '@/app/api/connector/update-check/route';

describe('parseConnectorVersion', () => {
  it('extracts the version from the connector UA', () => {
    expect(parseConnectorVersion('LivesovConnector/1.3.1; https://example.com/')).toBe('1.3.1');
    expect(parseConnectorVersion(`LivesovConnector/${CONNECTOR_PLUGIN_VERSION}; https://x.dev/`)).toBe(CONNECTOR_PLUGIN_VERSION);
  });

  it('rejects everything that is not the connector UA', () => {
    // The header is client-controlled; junk must never be recorded as a version.
    expect(parseConnectorVersion('Mozilla/5.0 (X11; Linux x86_64)')).toBeNull();
    expect(parseConnectorVersion('LivesovConnector/not-a-version; https://x/')).toBeNull();
    expect(parseConnectorVersion('LivesovConnector/1.2; https://x/')).toBeNull();
    expect(parseConnectorVersion('evil LivesovConnector/1.2.3')).toBeNull();
    expect(parseConnectorVersion('')).toBeNull();
    expect(parseConnectorVersion(null)).toBeNull();
    expect(parseConnectorVersion(undefined)).toBeNull();
  });
});

describe('compareVersions / isConnectorOutdated', () => {
  it('compares numerically, not lexically', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.4.0', '1.4.0')).toBe(0);
    expect(compareVersions('1.3.9', '1.4.0')).toBeLessThan(0);
  });

  it('flags anything behind the shipped version', () => {
    expect(isConnectorOutdated('1.3.0')).toBe(true);
    expect(isConnectorOutdated('1.3.1')).toBe(true);
    expect(isConnectorOutdated(CONNECTOR_PLUGIN_VERSION)).toBe(false);
    expect(isConnectorOutdated('99.0.0')).toBe(false);
    // Unknown / malformed → outdated (every pre-recording version is).
    expect(isConnectorOutdated(null)).toBe(true);
    expect(isConnectorOutdated('junk')).toBe(true);
  });
});

describe('GET /api/connector/update-check', () => {
  it('serves the shipped version and a same-host package URL', async () => {
    const res = UPDATE_CHECK();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe(CONNECTOR_PLUGIN_VERSION);
    // The plugin refuses a package on any other host than the one it asked —
    // so the endpoint must serve the zip from its own base URL.
    const pkg = new URL(body.package);
    const base = new URL(body.url);
    expect(pkg.host).toBe(base.host);
    expect(pkg.protocol).toBe('https:');
    expect(pkg.pathname).toBe(CONNECTOR_PLUGIN_ZIP_PATH);
  });
});
