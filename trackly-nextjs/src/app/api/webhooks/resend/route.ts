import { Webhook } from 'svix';

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
    console.error('[Resend Webhook] RESEND_WEBHOOK_SECRET is not set');
    return Response.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const rawBody = await request.text();
  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.error('[Resend Webhook] Missing svix headers');
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
    console.error('[Resend Webhook] Signature verification failed:', (e as Error).message);
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const { type, data } = payload;
  const to = data.to?.join(', ') || 'unknown';

  switch (type) {
    case 'email.delivered':
      console.log(`[Resend Webhook] Delivered to=${to} subject="${data.subject}" email_id=${data.email_id}`);
      break;

    case 'email.bounced':
      console.error(`[Resend Webhook] BOUNCED to=${to} subject="${data.subject}" email_id=${data.email_id} bounce=${JSON.stringify(data.bounce)}`);
      break;

    case 'email.complained':
      console.error(`[Resend Webhook] COMPLAINED to=${to} subject="${data.subject}" email_id=${data.email_id}`);
      break;

    case 'email.delivery_delayed':
      console.warn(`[Resend Webhook] DELAYED to=${to} subject="${data.subject}" email_id=${data.email_id}`);
      break;

    default:
      console.log(`[Resend Webhook] ${type} to=${to} email_id=${data.email_id}`);
      break;
  }

  return Response.json({ received: true });
}
