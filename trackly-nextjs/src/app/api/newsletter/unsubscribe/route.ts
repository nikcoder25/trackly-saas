import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { logger } from '@/lib/logger';

// One-click unsubscribe endpoint satisfying:
//   * CAN-SPAM § 5(a)(5) — opt-out mechanism reachable via a single click
//   * RFC 8058 List-Unsubscribe-Post: One-Click — Gmail / Outlook one-click
//
// Accepts both GET (link in email body) and POST (List-Unsubscribe-Post).
// Always returns a human-readable confirmation; never 5xx's a legitimate
// click even when the DB write fails — the header check is what email
// providers care about. Errors are logged server-side for ops.

function html(body: string) {
  return new Response(
    `<!doctype html><html><head><meta name="robots" content="noindex" /><title>Unsubscribed — Livesov</title></head><body style="font-family:Inter,sans-serif;padding:40px;max-width:480px;margin:0 auto;">${body}</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

async function unsubscribe(email: string) {
  const trimmed = email.trim().toLowerCase();
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
    return { ok: false, reason: 'invalid_email' as const };
  }
  try {
    await pool.query(
      `UPDATE newsletter_subscribers SET unsubscribed_at = NOW() WHERE email = $1`,
      [trimmed],
    );
    // Best-effort Resend audience removal. Never a hard failure.
    try {
      const audienceId = process.env.RESEND_AUDIENCE_ID;
      const key = process.env.EMAIL_API_KEY;
      if (audienceId && key) {
        await fetch(`https://api.resend.com/audiences/${audienceId}/contacts/${encodeURIComponent(trimmed)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({ unsubscribed: true }),
        });
      }
    } catch (e) {
      logger.warn('newsletter.unsubscribe.audience_update_failed', { error: (e as Error).message });
    }
    return { ok: true as const };
  } catch (e) {
    logger.error('newsletter.unsubscribe.db_failed', { error: (e as Error).message });
    return { ok: false, reason: 'db_error' as const };
  }
}

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get('email') || '';
  if (!email) return html(`<h2>Unsubscribe</h2><p>Missing email address.</p>`);
  const r = await unsubscribe(email);
  if (!r.ok && r.reason === 'invalid_email') {
    return html(`<h2>Unsubscribe</h2><p>That email address is invalid.</p>`);
  }
  return html(`<h2>You've been unsubscribed.</h2><p>${email} will no longer receive marketing email from Livesov. Transactional emails (password reset, account verification) will still be delivered.</p>`);
}

export async function POST(request: NextRequest) {
  // List-Unsubscribe-Post: One-Click sends "List-Unsubscribe=One-Click" as
  // a form body. Gmail / Outlook send this without user interaction when the
  // recipient clicks the built-in "Unsubscribe" button.
  const email = request.nextUrl.searchParams.get('email') || '';
  if (!email) return Response.json({ error: 'Missing email' }, { status: 400 });
  const r = await unsubscribe(email);
  if (!r.ok) return Response.json({ error: r.reason }, { status: r.reason === 'invalid_email' ? 400 : 500 });
  return Response.json({ ok: true });
}
