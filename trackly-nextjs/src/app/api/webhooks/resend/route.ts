import { Webhook } from 'svix';
import { pool } from '@/lib/db';
import { logger } from '@/lib/logger';

// Suppression table is created lazily on first bounce/complaint so the app
// doesn't hard-require a migration for webhook delivery. Idempotent; safe
// to call repeatedly.
async function ensureSuppressionTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_suppressions (
      email TEXT PRIMARY KEY,
      reason TEXT NOT NULL,
      event_type TEXT,
      suppressed_at TIMESTAMPTZ DEFAULT NOW(),
      raw JSONB
    )
  `);
}
let suppressionTableReady = false;

async function suppressEmail(email: string, reason: string, eventType: string, raw: unknown) {
  if (!suppressionTableReady) { await ensureSuppressionTable(); suppressionTableReady = true; }
  await pool.query(
    `INSERT INTO email_suppressions (email, reason, event_type, raw)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET reason = EXCLUDED.reason, event_type = EXCLUDED.event_type, suppressed_at = NOW(), raw = EXCLUDED.raw`,
    [email.toLowerCase(), reason, eventType, JSON.stringify(raw)],
  );
  // Keep the marketing list in sync so we don't send the same address a
  // welcome/report email after a bounce.
  await pool.query(
    `UPDATE newsletter_subscribers SET unsubscribed_at = COALESCE(unsubscribed_at, NOW()) WHERE email = $1`,
    [email.toLowerCase()],
  );
}

const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

type ResendEventType =
  | 'email.bounced'
  | 'email.delivered'
  | 'email.delivery_delayed'
  | 'email.complained'
  | 'email.opened'
  | 'email.clicked'
  | 'email.sent';

interface ResendWebhookPayload {
  type: ResendEventType;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
    bounce?: { message: string; type: string };
    [key: string]: unknown;
  };
}

export async function POST(request: Request) {
  if (!WEBHOOK_SECRET) {
    logger.error('webhook.resend.missing_secret');
    return Response.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const rawBody = await request.text();
  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    logger.error('webhook.resend.missing_headers');
    return Response.json({ error: 'Missing webhook signature headers' }, { status: 401 });
  }

  let payload: ResendWebhookPayload;
  try {
    const wh = new Webhook(WEBHOOK_SECRET);
    payload = wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ResendWebhookPayload;
  } catch (e) {
    logger.error('webhook.resend.signature_invalid', { error: (e as Error).message });
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const { type, data } = payload;

  const recipient = Array.isArray(data.to) ? data.to[0] : (data as { to?: string }).to;

  switch (type) {
    case 'email.bounced':
      logger.error('webhook.resend.bounced', { email_id: data.email_id });
      if (recipient) {
        try {
          await suppressEmail(recipient, data.bounce?.type || 'bounced', type, payload);
        } catch (e) {
          logger.error('webhook.resend.suppress_failed', { error: (e as Error).message, type });
        }
      }
      break;

    case 'email.complained':
      logger.error('webhook.resend.complained', { email_id: data.email_id });
      if (recipient) {
        try {
          await suppressEmail(recipient, 'complained', type, payload);
        } catch (e) {
          logger.error('webhook.resend.suppress_failed', { error: (e as Error).message, type });
        }
      }
      break;

    case 'email.delivery_delayed':
      logger.warn('webhook.resend.delayed', { email_id: data.email_id });
      break;

    default:
      break;
  }

  return Response.json({ received: true });
}
