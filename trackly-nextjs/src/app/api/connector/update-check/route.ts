/**
 * GET /api/connector/update-check   (PUBLIC, no auth)
 *
 * The Connector plugin's update channel. The plugin is distributed as a zip
 * from our own pages rather than wordpress.org, which means WordPress has no
 * idea when a newer version ships — an install stays on whatever version was
 * uploaded, forever, unless someone re-uploads by hand. The plugin polls this
 * endpoint (cached ~12h on its side) and feeds the answer into WordPress's
 * update_plugins transient, so wp-admin shows its normal "update available"
 * row and one-click updates work like any directory plugin.
 *
 * No auth: the current version number and a public download URL are not
 * secrets, and requiring the paired token here would leave un-paired installs
 * unable to update. Response is cacheable.
 */

import { NextResponse } from 'next/server';
import { CONNECTOR_PLUGIN_VERSION, CONNECTOR_PLUGIN_ZIP_PATH } from '@/lib/connector-version';
import { connectBaseUrl } from '@/lib/connect/snippet';

export function GET(): Response {
  const base = connectBaseUrl();
  return NextResponse.json(
    {
      version: CONNECTOR_PLUGIN_VERSION,
      package: `${base}${CONNECTOR_PLUGIN_ZIP_PATH}`,
      url: `${base}/integrations/wordpress`,
      requires: '5.6',
      requires_php: '7.4',
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=3600, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}
