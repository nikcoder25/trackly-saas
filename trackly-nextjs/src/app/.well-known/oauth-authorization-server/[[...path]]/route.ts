// RFC 8414 authorization server metadata for MCP clients.
// Served only at the root well-known URL. Our issuer has no path, so a
// path-suffixed URL (e.g. /.well-known/oauth-authorization-server/api/mcp)
// must 404: serving the root issuer there fails the client's check that the
// issuer equals the address the metadata was published under.
import { corsJson, preflight, authorizationServerMetadata } from '@/lib/oauth-http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path } = await ctx.params;
  if (path && path.length > 0) return corsJson({ error: 'not_found' }, 404, { 'Cache-Control': 'no-store' });
  return corsJson(authorizationServerMetadata(request), 200, { 'Cache-Control': 'public, max-age=300' });
}
export function OPTIONS() { return preflight(); }
