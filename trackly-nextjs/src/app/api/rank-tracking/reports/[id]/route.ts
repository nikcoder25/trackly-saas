/** DELETE /api/rank-tracking/reports/:id - delete a saved or scheduled report. */
import { pool } from '@/lib/db';
import { rankCaller } from '@/lib/rank-tracking/http';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  const { id } = await params;
  const r = await pool.query(`DELETE FROM rt_reports WHERE id = $1 AND account_id = $2`, [id, c.accountId]);
  return r.rowCount ? Response.json({ ok: true }) : Response.json({ error: 'Report not found' }, { status: 404 });
}
