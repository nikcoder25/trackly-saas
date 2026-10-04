/**
 * Livesov MCP server (Model Context Protocol, Streamable HTTP, stateless).
 *
 * Clients (Claude, Cursor, VS Code and others) POST JSON-RPC here with a
 * personal API key: `Authorization: Bearer lsv_...`. Cookies are never read,
 * so the route is exempt from the cookie CSRF check in middleware.
 *
 * Tools call the app's own route handlers in-process with a short-lived
 * access token minted for the key's owner. That keeps one source of truth
 * for brand access, plan limits, credits and per-user rate limits.
 */
import { signAccessToken } from '@/lib/auth';
import { resolveApiKey } from '@/lib/api-keys';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { handleBody, parseError, SERVER_INFO } from '@/lib/mcp/protocol';
import { TOOLS, type McpContext } from '@/lib/mcp/tools';
import * as brandsRoute from '@/app/api/brands/route';
import * as brandRoute from '@/app/api/brands/[id]/route';
import * as recsRoute from '@/app/api/brands/[id]/recommendations/route';
import * as accuracyRoute from '@/app/api/brands/[id]/accuracy/route';
import * as runRoute from '@/app/api/brands/[id]/run/route';
import * as runStatusRoute from '@/app/api/brands/[id]/run-status/[runId]/route';
import * as creditsRoute from '@/app/api/credits/status/route';

export const dynamic = 'force-dynamic';
// Scans can take a while to dispatch; give tool calls the same room as the run route.
export const maxDuration = 60;

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

/** The only API routes a key can reach, matched to their handlers. */
const ROUTES: { method: 'GET' | 'POST' | 'PUT'; pattern: RegExp; keys: string[]; handler: Handler }[] = [
  { method: 'GET', pattern: /^\/api\/brands$/, keys: [], handler: brandsRoute.GET as unknown as Handler },
  { method: 'GET', pattern: /^\/api\/brands\/([^/]+)$/, keys: ['id'], handler: brandRoute.GET as unknown as Handler },
  { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/recommendations$/, keys: ['id'], handler: recsRoute.GET as unknown as Handler },
  { method: 'PUT', pattern: /^\/api\/brands\/([^/]+)\/recommendations$/, keys: ['id'], handler: recsRoute.PUT as unknown as Handler },
  { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/accuracy$/, keys: ['id'], handler: accuracyRoute.GET as unknown as Handler },
  { method: 'POST', pattern: /^\/api\/brands\/([^/]+)\/run$/, keys: ['id'], handler: runRoute.POST as unknown as Handler },
  { method: 'GET', pattern: /^\/api\/brands\/([^/]+)\/run-status\/([^/]+)$/, keys: ['id', 'runId'], handler: runStatusRoute.GET as unknown as Handler },
  { method: 'GET', pattern: /^\/api\/credits\/status$/, keys: [], handler: creditsRoute.GET as unknown as Handler },
];

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
}

function unauthorized(message: string) {
  return json(
    { jsonrpc: '2.0', id: null, error: { code: -32001, message } },
    401,
    { 'WWW-Authenticate': 'Bearer realm="livesov", error="invalid_token"' },
  );
}

function readKey(request: Request): string {
  const auth = request.headers.get('authorization') || '';
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  return (request.headers.get('x-api-key') || '').trim();
}

function makeContext(request: Request, owner: { userId: string; email: string; role: string | null; plan: string | null }): McpContext {
  const origin = new URL(request.url).origin;
  const token = signAccessToken({ id: owner.userId, email: owner.email, role: owner.role || undefined, plan: owner.plan || undefined });
  const forwarded = request.headers.get('x-forwarded-for') || getClientIp(request);
  return {
    async api(method, path, body) {
      const [pathname, search = ''] = path.split('?');
      const route = ROUTES.find(r => r.method === method && r.pattern.test(pathname));
      if (!route) return { status: 404, data: { error: 'Not available over MCP' } };
      const m = pathname.match(route.pattern)!;
      const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const req = new Request(`${origin}${pathname}${search ? `?${search}` : ''}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'x-forwarded-for': forwarded,
          'x-livesov-client': 'mcp',
        },
        body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      });
      const res = await route.handler(req, { params: Promise.resolve(params) });
      let data: unknown = null;
      try { data = await res.json(); } catch { /* empty body */ }
      return { status: res.status, data };
    },
  };
}

export async function POST(request: Request) {
  const key = readKey(request);
  if (!key) return unauthorized('Missing API key. Create one in Livesov under Account & Plan, then send it as "Authorization: Bearer <key>".');
  const owner = await resolveApiKey(key).catch(() => null);
  if (!owner) return unauthorized('This API key is not valid or was deleted. Create a new one in Livesov under Account & Plan.');
  if (!owner.emailVerified) return unauthorized('Verify your email address in Livesov before using the API.');

  const rl = await rateLimit(`mcp:${owner.keyId}`, 60_000, 120).catch(() => ({ allowed: true, retryAfter: 0 }));
  if (!rl.allowed) {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Too many requests. Slow down and retry shortly.' } }, 429, { 'Retry-After': String(rl.retryAfter) });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return json(parseError(), 400); }

  const out = await handleBody(body, TOOLS, makeContext(request, owner));
  if (out == null) return new Response(null, { status: 202 });
  return json(out);
}

/** No server-initiated stream: this server answers every request inline. */
export async function GET() {
  return json({ name: SERVER_INFO.title, transport: 'streamable-http', docs: 'POST JSON-RPC with Authorization: Bearer <Livesov API key>' }, 405, { Allow: 'POST' });
}

/** Stateless: there is no session to end. */
export async function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
