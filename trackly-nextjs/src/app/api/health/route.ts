import { pool } from '@/lib/db';

export async function GET() {
  let ok = true;

  try {
    await pool.query('SELECT 1');
  } catch {
    ok = false;
  }

  return Response.json(
    { status: ok ? 'ok' : 'degraded', timestamp: new Date().toISOString() },
    { status: ok ? 200 : 503 }
  );
}
