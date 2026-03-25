import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';

export async function GET(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });
  const result = await pool.query('SELECT settings FROM users WHERE id = $1', [user.id]);
  const settings = result.rows[0]?.settings || {};
  delete settings.totp_secret;
  delete settings.totp_secret_pending;
  delete settings.totp_backup_codes;
  return Response.json({ settings });
}

export async function PUT(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });
  const body = await request.json();
  const allowed: Record<string, string[]> = {
    theme: ['light', 'dark', 'system'],
    emailNotifications: ['true', 'false'],
    timezone: [], // allow any string
    language: ['en', 'es', 'fr', 'de', 'ja', 'ko', 'zh', 'hi'],
  };
  const updates: Record<string, unknown> = {};
  for (const [key, validValues] of Object.entries(allowed)) {
    if (body[key] === undefined) continue;
    const val = String(body[key]).slice(0, 100); // limit length
    if (validValues.length > 0 && !validValues.includes(val)) continue; // reject invalid enum
    updates[key] = key === 'emailNotifications' ? val === 'true' : val;
  }
  if (Object.keys(updates).length === 0) return Response.json({ error: 'No valid settings to update' }, { status: 400 });

  await pool.query('UPDATE users SET settings = settings || $1::jsonb WHERE id = $2', [JSON.stringify(updates), user.id]);
  return Response.json({ success: true, settings: updates });
}
