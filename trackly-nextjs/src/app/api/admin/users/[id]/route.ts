import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';

async function requireAdmin(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return null;
  const result = await pool.query('SELECT role FROM users WHERE id = $1', [user.id]);
  if (result.rows[0]?.role !== 'admin') return null;
  return user;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'Admin access required' }, { status: 403 });
  const { id } = await params;
  const body = await request.json();

  const allowedFields = ['plan', 'role', 'email_verified'];
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = $${idx++}`);
      values.push(body[field]);
    }
  }

  if (updates.length === 0) return Response.json({ error: 'No valid fields' }, { status: 400 });
  values.push(id);
  await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, values);

  const result = await pool.query('SELECT id, email, username, name, plan, role, email_verified, created_at FROM users WHERE id = $1', [id]);
  return Response.json({ user: result.rows[0] });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: 'Admin access required' }, { status: 403 });
  const { id } = await params;

  if (id === admin.id) return Response.json({ error: 'Cannot delete yourself' }, { status: 400 });
  const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
  if (!result.rows.length) return Response.json({ error: 'User not found' }, { status: 404 });
  return Response.json({ success: true });
}
