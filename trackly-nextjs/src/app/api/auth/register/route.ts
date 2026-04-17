import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool, auditLog, ensureColumns } from '@/lib/db';
import { uid, safeUser } from '@/lib/helpers';
import { signAccessToken, createTokenCookieHeaders, jsonWithCookies, validatePasswordComplexity } from '@/lib/auth';
import { getPlanLimits, AUTH, TRIAL_DURATION_MS } from '@/lib/constants';
import { sendVerificationEmail } from '@/lib/email';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

// ─── Anti-spam helpers ──────────────────────────────────────────

function isGibberishName(name: string): boolean {
  if (!name || name.length < 4) return false;
  const cleaned = name.replace(/[^a-zA-Z]/g, '').toLowerCase();
  if (cleaned.length < 4) return false;
  const vowels = (cleaned.match(/[aeiou]/g) || []).length;
  if (vowels / cleaned.length < 0.15) return true;
  if (/[^aeiou]{5,}/i.test(cleaned)) return true;
  const original = name.replace(/[^a-zA-Z]/g, '');
  if (original.length > 6) {
    const caseChanges = original.split('').filter((c, i) => i > 0 && ((c === c.toUpperCase() && c !== c.toLowerCase()) !== (original[i-1] === original[i-1].toUpperCase() && original[i-1] !== original[i-1].toLowerCase()))).length;
    if (caseChanges / original.length > 0.4) return true;
  }
  return false;
}

const DISPOSABLE_DOMAINS = new Set([
  'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com',
  'trashmail.com', 'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com',
  'grr.la', 'dispostable.com', 'mailnesia.com', 'maildrop.cc', 'discard.email',
  'temp-mail.org', 'fakeinbox.com', 'tempail.com', 'mohmal.com', 'burpcollaborator.net',
]);

function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? DISPOSABLE_DOMAINS.has(domain) : false;
}

function isDotTrickedGmail(email: string): boolean {
  const [local, domain] = email.toLowerCase().split('@');
  if (!domain?.endsWith('gmail.com')) return false;
  return (local.match(/\./g) || []).length >= 3;
}

async function generateUsername(nameOrEmail: string): Promise<string> {
  let base = (nameOrEmail || '').trim().toLowerCase();
  if (base.includes('@')) base = base.split('@')[0];
  base = base.replace(/\s+/g, '.').replace(/[^a-z0-9_.-]/g, '').replace(/\.{2,}/g, '.').replace(/^[._-]+|[._-]+$/g, '');
  if (base.length < 3) base = 'user' + base;
  if (base.length > 25) base = base.substring(0, 25);

  const exists = await pool.query('SELECT id FROM users WHERE LOWER(username) = $1', [base]);
  if (!exists.rows.length) return base;

  for (let i = 0; i < 5; i++) {
    const suffix = Math.floor(Math.random() * 900) + 100;
    const candidate = (base.substring(0, 25) + suffix).substring(0, 30);
    const dup = await pool.query('SELECT id FROM users WHERE LOWER(username) = $1', [candidate]);
    if (!dup.rows.length) return candidate;
  }
  return (base.substring(0, 20) + crypto.randomBytes(3).toString('hex')).substring(0, 30);
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rl = await rateLimit('auth:' + ip, 15 * 60 * 1000, 20);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const body = await request.json();
  const { email, password, name, username } = body;

  if (!email || !password) return Response.json({ error: 'Email and password required' }, { status: 400 });
  if (typeof email !== 'string' || typeof password !== 'string') return Response.json({ error: 'Invalid input' }, { status: 400 });
  if (email.length > 254) return Response.json({ error: 'Email too long' }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: 'Invalid email format' }, { status: 400 });
  const pwError = validatePasswordComplexity(password);
  if (pwError) return Response.json({ error: pwError }, { status: 400 });
  if (name && (typeof name !== 'string' || name.length > 100)) return Response.json({ error: 'Name must be 100 characters or less' }, { status: 400 });

  // ── Anti-spam checks ──────────────────────────────────────
  if (body.website) return Response.json({ error: 'Registration failed' }, { status: 400 });
  if (body._formLoadedAt && Date.now() - Number(body._formLoadedAt) < 2000) {
    return Response.json({ error: 'Registration failed' }, { status: 400 });
  }
  if (isDisposableEmail(email)) return Response.json({ error: 'Please use a permanent email address' }, { status: 400 });
  if (isDotTrickedGmail(email)) return Response.json({ error: 'Please use a valid email address' }, { status: 400 });
  if (name && isGibberishName(name)) {
    await new Promise(r => setTimeout(r, 3000));
  }

  let trimmedUsername = username ? username.trim().toLowerCase() : null;
  if (trimmedUsername) {
    if (trimmedUsername.length < 3) return Response.json({ error: 'Username must be at least 3 characters' }, { status: 400 });
    if (trimmedUsername.length > 30) return Response.json({ error: 'Username must be 30 characters or less' }, { status: 400 });
    if (!/^[a-z0-9_.-]+$/.test(trimmedUsername)) return Response.json({ error: 'Username can only contain letters, numbers, dots, dashes, and underscores' }, { status: 400 });
  }

  try {
    await ensureColumns();

    if (trimmedUsername) {
      const existingUser = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [trimmedUsername]);
      if (existingUser.rows.length) return Response.json({ error: 'Username already taken' }, { status: 400 });
    }

    if (!trimmedUsername) {
      trimmedUsername = await generateUsername(name || email);
    }

    const hash = await bcrypt.hash(password, AUTH.bcryptRounds);
    const id = uid();
    const userName = name || email.split('@')[0];
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyTokenExpires = new Date(Date.now() + AUTH.emailVerificationExpiry);
    const trialEndsAt = new Date(Date.now() + TRIAL_DURATION_MS);

    const insertResult = await pool.query(
      `INSERT INTO users (id, email, username, name, password_hash, plan, verify_token, verify_token_expires, trial_ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [id, email.toLowerCase(), trimmedUsername, userName, hash, 'trial', verifyToken, verifyTokenExpires, trialEndsAt]
    );
    if (!insertResult.rows.length) return Response.json({ error: 'Unable to create account. Please try again or use a different email.' }, { status: 400 });

    const emailResult = await sendVerificationEmail(email.toLowerCase(), verifyToken);
    if (!emailResult.sent) {
      console.error('[Register] Failed to send verification email:', emailResult.reason);
    }

    const accessToken = signAccessToken({ id, email: email.toLowerCase(), role: 'user', plan: 'trial' });
    const refreshToken = crypto.randomBytes(40).toString('hex');
    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refreshToken, id]);

    auditLog(id, 'register', 'user', id, { email: email.toLowerCase() }, ip);

    const cookieHeaders = createTokenCookieHeaders(accessToken, refreshToken);
    return jsonWithCookies({
      token: accessToken,
      user: {
        id, email: email.toLowerCase(), username: trimmedUsername, name: userName,
        plan: 'trial', trialEndsAt: trialEndsAt.toISOString(),
        emailVerified: false, createdAt: new Date().toISOString(),
        hasKeys: [], limits: getPlanLimits('trial'),
      },
    }, cookieHeaders);
  } catch (e) {
    console.error('[Register]', (e as Error).message);
    return Response.json({ error: 'Registration failed' }, { status: 500 });
  }
}
