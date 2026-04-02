import { pool } from '@/lib/db';
import { NextRequest } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

// Ensure the newsletter_subscribers table exists
async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      subscribed_at TIMESTAMP DEFAULT NOW(),
      unsubscribed_at TIMESTAMP,
      source VARCHAR(50) DEFAULT 'home_page'
    )
  `);
}

let tableReady = false;

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rl = await rateLimit('newsletter:' + ip, 60 * 60 * 1000, 5);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    const trimmed = email.trim().toLowerCase();
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
      return Response.json({ error: 'Invalid email address' }, { status: 400 });
    }

    if (!tableReady) {
      await ensureTable();
      tableReady = true;
    }

    await pool.query(
      `INSERT INTO newsletter_subscribers (email, source)
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET unsubscribed_at = NULL, subscribed_at = NOW()`,
      [trimmed, 'home_page']
    );

    return Response.json({ success: true });
  } catch (e) {
    console.error('[Newsletter] Failed to subscribe:', (e as Error).message);
    return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
