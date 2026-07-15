/**
 * GET /c.js   (PUBLIC static asset)
 *
 * The Self-Serve Connect client snippet: a tiny, dependency-free script the
 * customer loads via `<script async src="…/c.js" data-livesov="KEY">`. On load
 * it fetches the brand's public per-path override and applies it to the DOM,
 * then pings the heartbeat. Built by buildConnectSnippet (single source of
 * truth with the unit-tested render functions). Cached hard — the body only
 * changes on deploy. Note: paths ending in `.js` are excluded from middleware,
 * so this asset carries no CSP/CSRF processing.
 */

import { NextResponse } from 'next/server';
import { buildConnectSnippet, connectBaseUrl } from '@/lib/connect/snippet';

export const dynamic = 'force-static';
export const revalidate = 3600;

export function GET(): Response {
  const js = buildConnectSnippet(connectBaseUrl());
  return new NextResponse(js, {
    status: 200,
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, must-revalidate',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
