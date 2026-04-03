import { pool } from '@/lib/db';

const startTime = Date.now();

export async function GET() {
  let dbStatus = 'connected';
  let dbLatencyMs: number | null = null;

  try {
    const t0 = Date.now();
    await pool.query('SELECT 1');
    dbLatencyMs = Date.now() - t0;
  } catch {
    dbStatus = 'disconnected';
  }

  const ok = dbStatus === 'connected';

  return Response.json({
    status: ok ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: process.env.npm_package_version || '1.0.0',
    checks: {
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
    },
  }, { status: ok ? 200 : 503 });
}
