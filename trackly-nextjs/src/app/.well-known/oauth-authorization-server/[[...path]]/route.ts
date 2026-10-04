// RFC 8414 authorization server metadata for MCP clients.
import { corsJson, preflight, authorizationServerMetadata } from '@/lib/oauth-http';

export const dynamic = 'force-dynamic';
export function GET(request: Request) { return corsJson(authorizationServerMetadata(request), 200, { 'Cache-Control': 'public, max-age=3600' }); }
export function OPTIONS() { return preflight(); }
