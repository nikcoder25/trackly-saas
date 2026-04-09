/**
 * Content-based spam filtering for contact form submissions.
 * Returns { spam: true, reason: string } if the message looks like spam.
 */

interface SpamCheckInput {
  name: string;
  email: string;
  subject: string;
  message: string;
}

interface SpamResult {
  spam: boolean;
  reason?: string;
}

// Common spam keyword patterns (case-insensitive)
const SPAM_KEYWORD_PATTERNS: RegExp[] = [
  /\b(buy now|act now|click here|click below|order now|order today)\b/i,
  /\b(free offer|free gift|free access|free trial period|risk.?free)\b/i,
  /\b(viagra|cialis|pharmacy|pharma|weight loss pill|diet pill)\b/i,
  /\b(nigerian prince|wire transfer|western union|moneygram)\b/i,
  /\b(earn money|make money|extra income|double your|million dollars)\b/i,
  /\b(casino|poker|gambling|bet online|sports betting)\b/i,
  /\b(crypto currency.*invest|bitcoin.*invest|invest.*crypto)\b/i,
  /\b(seo services|search engine optimization|backlink|link building)\b/i,
  /\b(web traffic|increase traffic|buy traffic|guaranteed visitors)\b/i,
  /\b(cheap (meds|medications|drugs|pills))\b/i,
  /\b(work from home.*earn|earn.*work from home)\b/i,
  /\b(no obligation|limited time|act immediately|urgent response)\b/i,
  /\b(dear (sir|madam|friend|beneficiary))\b/i,
  /\b(congratulations.*won|you have been selected|you are a winner)\b/i,
];

// Disposable email domain patterns
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  'throwaway.email',
  'yopmail.com',
  'sharklasers.com',
  'guerrillamailblock.com',
  'grr.la',
  'dispostable.com',
  'trashmail.com',
  'fakeinbox.com',
  'tempail.com',
  'temp-mail.org',
  'maildrop.cc',
  'harakirimail.com',
]);

function countUrls(text: string): number {
  const urlPattern = /https?:\/\/[^\s]+|www\.[^\s]+|\b[a-z0-9-]+\.(com|net|org|info|biz|xyz|top|click|link|site|online|win|pro)\b/gi;
  const matches = text.match(urlPattern);
  return matches ? matches.length : 0;
}

function hasExcessiveRepeatingChars(text: string): boolean {
  // Matches 5+ of the same character in a row (e.g., "aaaaaa" or "!!!!!!")
  return /(.)\1{4,}/i.test(text);
}

function isExcessiveUppercase(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 10) return false;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return upper / letters.length > 0.7;
}

function hasSpamKeywords(text: string): boolean {
  return SPAM_KEYWORD_PATTERNS.some((pattern) => pattern.test(text));
}

function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? DISPOSABLE_EMAIL_DOMAINS.has(domain) : false;
}

function hasHtmlOrScriptInjection(text: string): boolean {
  return /<script[\s>]|<iframe[\s>]|javascript:|on\w+\s*=/i.test(text);
}

export function checkForSpam(input: SpamCheckInput): SpamResult {
  const combinedText = `${input.name} ${input.subject} ${input.message}`;

  // Check for HTML/script injection attempts
  if (hasHtmlOrScriptInjection(combinedText)) {
    return { spam: true, reason: 'Message contains disallowed HTML or script content.' };
  }

  // Check for disposable email addresses
  if (isDisposableEmail(input.email)) {
    return { spam: true, reason: 'Please use a non-disposable email address.' };
  }

  // Check for spam keywords
  if (hasSpamKeywords(combinedText)) {
    return { spam: true, reason: 'Your message was flagged as potential spam. Please revise and try again.' };
  }

  // Check for excessive URLs (more than 2 links)
  const urlCount = countUrls(combinedText);
  if (urlCount > 2) {
    return { spam: true, reason: 'Too many links detected. Please reduce the number of URLs in your message.' };
  }

  // Check for excessive uppercase (shouting)
  if (isExcessiveUppercase(input.message)) {
    return { spam: true, reason: 'Please avoid writing in all caps.' };
  }

  // Check for excessive repeating characters
  if (hasExcessiveRepeatingChars(input.message)) {
    return { spam: true, reason: 'Your message contains repetitive characters. Please revise.' };
  }

  return { spam: false };
}
