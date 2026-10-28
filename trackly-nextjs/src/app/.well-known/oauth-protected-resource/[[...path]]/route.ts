// RFC 9728 protected resource metadata for the MCP endpoint. Served at both
// /.well-known/oauth-protected-resource and .../api/mcp (path-suffixed form).
import { corsJson, preflight, protectedResourceMetadata } from '@/lib/oauth-http';

export const dynamic = 'force-dynamic';
export function GET(request: Request) { return corsJson(protectedResourceMetadata(request), 200, { 'Cache-Control': 'public, max-age=3600' }); }
export function OPTIONS() { return preflight(); }
