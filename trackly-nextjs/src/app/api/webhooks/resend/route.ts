import { Webhook } from 'svix';
import { logger } from '@/lib/logger';

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

  switch (type) {
    case 'email.bounced':
      logger.error('webhook.resend.bounced', { email_id: data.email_id });
      break;

    case 'email.complained':
      logger.error('webhook.resend.complained', { email_id: data.email_id });
      break;

    case 'email.delivery_delayed':
      logger.warn('webhook.resend.delayed', { email_id: data.email_id });
      break;

    default:
      break;
  }

  return Response.json({ received: true });
}
