/**
 * One-click unsubscribe from trial nurture / marketing emails.
 *
 * GET  /api/email/unsubscribe?u=<userId>&t=<hmac>  -> confirmation page with a button
 * POST /api/email/unsubscribe?u=<userId>&t=<hmac>  -> opts the user out
 *
 * GET does not change state so link scanners in mail clients can't
 * unsubscribe people by prefetching. The HMAC token (lib/trial-nurture.ts)
 * is the only auth: no cookies are read, so the route is CSRF-exempt.
 * Transactional mail (password reset, billing) is unaffected.
 */
import { pool } from '@/lib/db';
import { escapeHtml } from '@/lib/sanitize';
import { verifyUnsubscribeToken } from '@/lib/trial-nurture';

function page(body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Livesov email preferences</title></head>
<body style="font-family:Inter,system-ui,sans-serif;max-width:480px;margin:64px auto;padding:0 16px;color:#374151;line-height:1.6;">${body}</body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

function readParams(request: Request): { u: string; t: string } | null {
  const url = new URL(request.url);
  const u = url.searchParams.get('u') || '';
  const t = url.searchParams.get('t') || '';
  if (!u || !t || !verifyUnsubscribeToken(u, t)) return null;
  return { u, t };
}

export async function GET(request: Request): Promise<Response> {
  const params = readParams(request);
  if (!params) return page('<h2>Invalid link</h2><p>This unsubscribe link is invalid or expired.</p>', 400);
  const action = `/api/email/unsubscribe?u=${encodeURIComponent(params.u)}&t=${encodeURIComponent(params.t)}`;
  return page(`
    <h2>Unsubscribe from trial tips?</h2>
    <p>You'll stop getting Livesov trial and upgrade emails. Account and billing emails still arrive.</p>
    <form method="POST" action="${escapeHtml(action)}">
      <button type="submit" style="background:#4f46e5;color:#fff;border:0;padding:12px 24px;border-radius:8px;font-weight:600;cursor:pointer;">Unsubscribe</button>
    </form>`);
}

export async function POST(request: Request): Promise<Response> {
  const params = readParams(request);
  if (!params) return page('<h2>Invalid link</h2><p>This unsubscribe link is invalid or expired.</p>', 400);
  await pool.query(
    `UPDATE users SET settings = COALESCE(settings, '{}'::jsonb) || '{"marketingEmailsOptOut": true}'::jsonb WHERE id = $1`,
    [params.u],
  );
  return page('<h2>You are unsubscribed</h2><p>You won\'t get any more Livesov trial emails.</p>');
}
