import bcrypt from 'bcryptjs';
import { pool, safeConnect, auditLog } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';

export async function DELETE(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid request body' }, { status: 400 }); }
  const { password } = body;
  if (!password) return Response.json({ error: 'Password required to delete account' }, { status: 400 });

  try {
    const result = await pool.query('SELECT password_hash, role FROM users WHERE id = $1', [user.id]);
    if (!result.rows.length) return Response.json({ error: 'User not found' }, { status: 404 });
    const ok = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!ok) return Response.json({ error: 'Incorrect password' }, { status: 400 });

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    auditLog(user.id, 'delete_account', 'user', user.id, { email: user.email }, ip);

    // Cascading delete in a transaction to clean up all related data
    const client = await safeConnect();
    try {
      await client.query('BEGIN');
      // Delete brand-related data first (references brands table)
      await client.query('DELETE FROM citations WHERE brand_id IN (SELECT id FROM brands WHERE user_id = $1)', [user.id]);
      await client.query('DELETE FROM accuracy_issues WHERE brand_id IN (SELECT id FROM brands WHERE user_id = $1)', [user.id]);
      await client.query('DELETE FROM brand_facts WHERE brand_id IN (SELECT id FROM brands WHERE user_id = $1)', [user.id]);
      await client.query('DELETE FROM prompt_run_stats WHERE brand_id IN (SELECT id FROM brands WHERE user_id = $1)', [user.id]);
      await client.query('DELETE FROM prompt_runs WHERE brand_id IN (SELECT id FROM brands WHERE user_id = $1)', [user.id]);
      await client.query('DELETE FROM active_runs WHERE user_id = $1', [user.id]);
      await client.query('DELETE FROM alert_rules WHERE user_id = $1', [user.id]);
      await client.query('DELETE FROM recommendations WHERE brand_id IN (SELECT id FROM brands WHERE user_id = $1)', [user.id]);
      // Delete user-related data
      await client.query('DELETE FROM api_logs WHERE user_id = $1', [user.id]);
      await client.query('DELETE FROM daily_cost_tracker WHERE user_id = $1', [user.id]);
      await client.query('DELETE FROM team_members WHERE owner_id = $1 OR member_id = $1', [user.id]);
      await client.query('DELETE FROM brands WHERE user_id = $1', [user.id]);
      await client.query('DELETE FROM notifications WHERE user_id = $1', [user.id]);
      await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);
      await client.query('DELETE FROM audit_logs WHERE user_id = $1', [user.id]);
      await client.query('DELETE FROM users WHERE id = $1', [user.id]);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }
    return Response.json({ message: 'Account deleted' });
  } catch {
    return Response.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
