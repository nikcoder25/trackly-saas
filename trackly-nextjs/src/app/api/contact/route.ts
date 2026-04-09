import { NextRequest } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { sendContactFormEmail } from '@/lib/email';

const INQUIRY_TYPES = [
  'General Support',
  'Enterprise Sales',
  'Partnerships',
  'Billing Question',
  'Feature Request',
  'Bug Report',
  'Other',
];

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rl = await rateLimit('contact:' + ip, 300 * 1000, 3);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  try {
    const { name, email, subject, inquiryType, message } = await request.json();

    // Validate required fields
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
