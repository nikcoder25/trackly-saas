import { NextRequest } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { sendContactFormEmail } from '@/lib/email';
import { checkForSpam } from '@/lib/spam-filter';

const INQUIRY_TYPES = [
  'General Support',
  'Enterprise Sales',
  'Partnerships',
  'Billing Question',
  'Feature Request',
  'Bug Report',
  'Other',
];

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

async function verifyTurnstileToken(token: string, ip: string): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    // If no secret key is configured, skip Turnstile verification (dev mode)
    console.warn('[Contact] TURNSTILE_SECRET_KEY not set — skipping Turnstile verification');
    return true;
  }

  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: secretKey,
        response: token,
        remoteip: ip,
      }),
    });
    const data = await res.json();
    return data.success === true;
  } catch (e) {
    console.error('[Contact] Turnstile verification error:', (e as Error).message);
    return false;
  }
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rl = await rateLimit('contact:' + ip, 300 * 1000, 3);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  try {
    const { name, email, subject, inquiryType, message, turnstileToken, website } = await request.json();

    // --- Honeypot check ---
    // The "website" field is hidden from real users; bots will fill it in
    if (website) {
      // Silently accept to avoid tipping off bots, but don't send the email
      return Response.json({ success: true });
    }

    // --- Cloudflare Turnstile verification ---
    if (process.env.TURNSTILE_SECRET_KEY) {
      if (!turnstileToken || typeof turnstileToken !== 'string') {
        return Response.json({ error: 'Please complete the security challenge.' }, { status: 400 });
      }
      const turnstileValid = await verifyTurnstileToken(turnstileToken, ip);
      if (!turnstileValid) {
        return Response.json({ error: 'Security verification failed. Please try again.' }, { status: 400 });
      }
    }

    // --- Field validation ---
    if (!name || typeof name !== 'string' || !name.trim()) {
      return Response.json({ error: 'Full name is required.' }, { status: 400 });
    }
    if (!email || typeof email !== 'string') {
      return Response.json({ error: 'Email address is required.' }, { status: 400 });
    }
    const trimmedEmail = email.trim().toLowerCase();
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmedEmail)) {
      return Response.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }
    if (!subject || typeof subject !== 'string' || !subject.trim()) {
      return Response.json({ error: 'Subject is required.' }, { status: 400 });
    }
    if (!inquiryType || !INQUIRY_TYPES.includes(inquiryType)) {
      return Response.json({ error: 'Please select a valid inquiry type.' }, { status: 400 });
    }
    if (!message || typeof message !== 'string' || message.trim().length < 20) {
      return Response.json({ error: 'Message must be at least 20 characters.' }, { status: 400 });
    }

    // --- Content-based spam filtering ---
    const spamCheck = checkForSpam({
      name: name.trim(),
      email: trimmedEmail,
      subject: subject.trim(),
      message: message.trim(),
    });
    if (spamCheck.spam) {
      return Response.json({ error: spamCheck.reason }, { status: 400 });
    }

    const result = await sendContactFormEmail({
      name: name.trim(),
      email: trimmedEmail,
      subject: subject.trim(),
      inquiryType,
      message: message.trim(),
    });

    if (!result.sent) {
      console.error('[Contact] Failed to send email:', result.reason);
      return Response.json({ error: 'Failed to send your message. Please try again.' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (e) {
    console.error('[Contact] Error:', (e as Error).message);
    return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
