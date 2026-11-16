import bcrypt from 'bcryptjs';
import { pool, auditLog } from '@/lib/db';
import { deleteUserAccount } from '@/lib/delete-user';
import { verifyRequestAuthLive } from '@/lib/auth';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export async function DELETE(request: Request) {
  const user = await verifyRequestAuthLive(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  // Account deletion is irreversible; throttle hard so a hijacked session
  // can't repeatedly probe the password + wipe data.
  const rl = await checkUserIpRateLimit('account_delete', user.id, getClientIp(request), {
    user: { max: 5, windowMs: 60 * 60 * 1000 },
    ip: { max: 10, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const body = await request.json().catch(() => null);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!password) return Response.json({ error: 'Password required to delete account' }, { status: 400 });

  try {
    const result = await pool.query('SELECT email, password_hash, role, google_id FROM users WHERE id = $1', [user.id]);
    if (!result.rows.length) return Response.json({ error: 'User not found' }, { status: 404 });
    const row = result.rows[0];
    // Google sign-up accounts carry a random password hash they can never
    // match, so they confirm by typing their account email instead.
    const ok = (await bcrypt.compare(password, row.password_hash)) ||
      (!!row.google_id && password.trim().toLowerCase() === String(row.email).toLowerCase());
    if (!ok) return Response.json({ error: 'Incorrect password' }, { status: 400 });

    const ip = getClientIp(request);

    // Cancels the Dodo subscription first, then deletes all user- and
    // brand-owned data in one transaction (audit_logs are kept).
    // webhook_events is intentionally NOT pruned: its rows back the webhook
    // replay-idempotency guard, so a provider re-delivery after account
    // deletion still de-dupes instead of being reprocessed.
    const deleted = await deleteUserAccount(user.id);
    if (!deleted.ok) return Response.json({ error: deleted.error }, { status: deleted.status });

    auditLog(user.id, 'delete_account', 'user', user.id, {
      email: user.email,
      cancelledSubscriptionId: deleted.cancelledSubscriptionId,
    }, ip);
    return Response.json({ message: 'Account deleted' });
  } catch {
    return Response.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
