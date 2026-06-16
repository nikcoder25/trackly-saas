import { pool, ensureColumns } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { safeUser } from '@/lib/helpers';

export async function GET(request: Request) {
  const authUser = verifyRequestAuth(request);
  if (!authUser) return Response.json({ error: 'No token' }, { status: 401 });

  try {
    await ensureColumns();
    const result = await pool.query(
      'SELECT id, email, username, name, plan, trial_ends_at, role, api_keys, settings, email_verified, created_at, google_id, avatar_url FROM users WHERE id = $1',
      [authUser.id]
    );
    const user = result.rows[0];
    if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

    // Admins always see plan='owner' in the API response so the unmetered
    // UI surfaces (UsageSection, billing page, etc.) keep working without
    // changes. This is a *response-shape* spoof only - we deliberately do
    // NOT write 'owner' back to users.plan, because:
    //   - users.plan is the authoritative billing state. It's written by
    //     the Dodo webhook handler, /api/payments/cancel, the reconcile
    //     cron, and admin-backend manual edits. If we wrote 'owner' here
    //     on every /me call, all four of those paths would be silently
    //     reverted on the admin's next dashboard load (e.g. an admin who
    //     also holds a real subscription, or an admin testing the cancel
    //     flow as a dogfood pass, would see their cancellation undone).
    //   - lib/admin-auth.ts gates admin-backend access strictly on the
    //     'admin' role, not on plan='owner', so spoofing the response
    //     plan does not cross any auth boundary.
    if (user.role === 'admin') {
      user.plan = 'owner';
    }

    return Response.json({ user: safeUser(user) });
  } catch {
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
