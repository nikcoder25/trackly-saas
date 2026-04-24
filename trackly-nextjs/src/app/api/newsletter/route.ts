import { pool } from '@/lib/db';
import { NextRequest } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { addContactToAudience, sendWelcomeEmail } from '@/lib/email';
import { logError, serverError } from '@/lib/api-error';

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
    const body = await request.json();
    const { email, website } = body;

    // Honeypot: silently reject if filled
    if (website) return Response.json({ success: true });

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

    const result = await pool.query(
      `INSERT INTO newsletter_subscribers (email, source)
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET unsubscribed_at = NULL, subscribed_at = NOW()
       RETURNING (xmax = 0) AS is_new`,
      [trimmed, 'home_page']
    );

    const isNew = result.rows[0]?.is_new;

    // Add contact to Resend Audience
    const audienceResult = await addContactToAudience(trimmed);
    if (!audienceResult.sent) {
      console.warn(`[Newsletter] Failed to add ${trimmed} to Resend Audience: ${audienceResult.reason}`);
    }

    // Send welcome email only for new subscribers
    if (isNew) {
      const emailResult = await sendWelcomeEmail(trimmed);
      if (!emailResult.sent) {
        console.warn(`[Newsletter] Failed to send welcome email to ${trimmed}: ${emailResult.reason}`);
      }
    }

    return Response.json({ success: true });
  } catch (e) {
    logError('newsletter.subscribe_failed', e);
    return serverError({ message: 'Something went wrong. Please try again.' });
  }
}
