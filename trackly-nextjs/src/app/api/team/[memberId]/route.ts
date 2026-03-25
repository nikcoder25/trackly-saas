import { pool } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });
  const { memberId } = await params;
  const { role } = await request.json();
  const validRoles = ['viewer', 'editor'];
  if (!validRoles.includes(role)) return Response.json({ error: 'Invalid role' }, { status: 400 });

  const result = await pool.query('UPDATE team_members SET role = $1 WHERE id = $2 AND owner_id = $3 RETURNING id', [role, memberId, user.id]);
  if (!result.rows.length) return Response.json({ error: 'Member not found' }, { status: 404 });
  return Response.json({ success: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });
  const { memberId } = await params;

  const result = await pool.query('DELETE FROM team_members WHERE id = $1 AND owner_id = $2 RETURNING id', [memberId, user.id]);
  if (!result.rows.length) return Response.json({ error: 'Member not found' }, { status: 404 });
  return Response.json({ success: true });
}
