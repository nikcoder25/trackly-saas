// The consent page posts here when the signed-in user approves an app.
// Cookie-authenticated, so it keeps the normal CSRF protection.
import { pool, auditLog } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { validateAuthorizeRequest, createAuthorizationCode, OAuthError } from '@/lib/oauth';

export async function POST(request: Request) {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const body = await request.json().catch(() => ({})) as Record<string, string>;
  try {
    const { client, params } = await validateAuthorizeRequest(body);
    const target = new URL(params.redirectUri);
    if (body.decision === 'deny') {
      target.searchParams.set('error', 'access_denied');
    } else {
      target.searchParams.set('code', await createAuthorizationCode(auth.id, params));
      auditLog(auth.id, 'oauth.authorize', 'oauth_client', client.clientId, { name: client.clientName }).catch(() => {});
    }
    if (body.state) target.searchParams.set('state', body.state);
    target.searchParams.set('iss', new URL(request.url).origin);
    return Response.json({ redirect: target.toString() });
  } catch (e) {
    if (e instanceof OAuthError) return Response.json({ error: e.message }, { status: 400 });
    return Response.json({ error: 'Could not complete the connection' }, { status: 500 });
  }
}
