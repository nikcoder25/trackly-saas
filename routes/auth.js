/**
 * Authentication routes — register, login, me
 */
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const router  = express.Router();

const rateLimit = require('express-rate-limit');

const { pool, auditLog } = require('../config/db');
const { auth, JWT_SECRET } = require('../middleware/auth');
const { uid, safeUser } = require('../lib/helpers');
const { getPlanLimits } = require('../lib/plans');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../lib/email');
const { generateSecret, verifyTOTP, getOTPAuthURL, generateBackupCodes } = require('../lib/totp');
const crypto = require('crypto');

// ─── Auto-generate username from name or email ─────────────────
// Creates a clean, unique username like "john.doe" or "john.doe42"
async function generateUsername(nameOrEmail) {
  // Extract base: prefer name, fall back to email prefix
  let base = (nameOrEmail || '').trim().toLowerCase();
  if (base.includes('@')) base = base.split('@')[0]; // email prefix
  // Clean: only letters, numbers, dots, dashes, underscores
  base = base.replace(/\s+/g, '.').replace(/[^a-z0-9_.-]/g, '').replace(/\.{2,}/g, '.').replace(/^[._-]+|[._-]+$/g, '');
  if (base.length < 3) base = 'user' + base;
  if (base.length > 25) base = base.substring(0, 25);

  // Check if base username is available
  const exists = await pool.query('SELECT id FROM users WHERE LOWER(username) = $1', [base]);
  if (!exists.rows.length) return base;

  // Append random suffix until unique (max 5 attempts, then use random)
  for (let i = 0; i < 5; i++) {
    const suffix = Math.floor(Math.random() * 900) + 100; // 100-999
    const candidate = (base.substring(0, 25) + suffix).substring(0, 30);
    const dup = await pool.query('SELECT id FROM users WHERE LOWER(username) = $1', [candidate]);
    if (!dup.rows.length) return candidate;
  }
  // Fallback: base + random hex
  return (base.substring(0, 20) + crypto.randomBytes(3).toString('hex')).substring(0, 30);
}

const isProduction = process.env.NODE_ENV === 'production';
function setTokenCookies(res, accessToken, refreshToken) {
  const cookieOpts = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/'
  };
  res.cookie('trackly_token', accessToken, { ...cookieOpts, maxAge: 15 * 60 * 1000 }); // 15 min
  res.cookie('trackly_refresh', refreshToken, { ...cookieOpts, maxAge: 30 * 24 * 60 * 60 * 1000 }); // 30 days
}

function clearTokenCookies(res) {
  const cookieOpts = { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' };
  res.clearCookie('trackly_token', cookieOpts);
  res.clearCookie('trackly_refresh', cookieOpts);
}

// Per-account brute force protection — 10 failed attempts per 15 min per email/username
// Prevents distributed attacks targeting a single account from many IPs
const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts for this account. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
  keyGenerator: (req) => 'login_account:' + (req.body?.email || '').toString().toLowerCase().trim(),
  skipSuccessfulRequests: true
});

// Stricter rate limit for 2FA attempts — 5 attempts per 15 minutes per IP
const twoFALimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many 2FA attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
  // Only apply when the request includes a totpCode (2FA attempt)
  skip: (req) => !req.body?.totpCode
});

// Rate limit for forgot-password — 5 requests per hour per IP
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many password reset requests. Please try again in 1 hour.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false }
});

// Rate limit for reset-password — 10 attempts per hour per IP
const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many password reset attempts. Please try again in 1 hour.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false }
});

// Rate limit for email verification — 20 attempts per hour per IP
const verifyEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Too many verification attempts. Please try again in 1 hour.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false }
});

// Rate limit for 2FA setup/verify — 10 attempts per 15 minutes per user
const twoFASetupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many 2FA setup attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false }
});

router.post('/register', async (req, res) => {
  const { email, password, name, username } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Invalid input' });
  if (email.length > 254) return res.status(400).json({ error: 'Email too long' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email format' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (password.length > 128) return res.status(400).json({ error: 'Password too long' });
  if (name && (typeof name !== 'string' || name.length > 100)) return res.status(400).json({ error: 'Name must be 100 characters or less' });
  // Username validation — if user provides one, validate it; otherwise auto-generate
  let trimmedUsername = username ? username.trim().toLowerCase() : null;
  if (trimmedUsername) {
    if (trimmedUsername.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
    if (trimmedUsername.length > 30) return res.status(400).json({ error: 'Username must be 30 characters or less' });
    if (!/^[a-z0-9_.-]+$/.test(trimmedUsername)) return res.status(400).json({ error: 'Username can only contain letters, numbers, dots, dashes, and underscores' });
  }

  try {
    // Pre-check username availability (email uniqueness enforced atomically below)
    if (trimmedUsername) {
      const existingUser = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [trimmedUsername]);
      if (existingUser.rows.length) return res.status(400).json({ error: 'Username already taken' });
    }

    // Auto-generate username if not provided
    if (!trimmedUsername) {
      trimmedUsername = await generateUsername(name || email);
    }

    const hash = await bcrypt.hash(password, 12);
    const id = uid();
    const userName = name || email.split('@')[0];
    const verifyToken = crypto.randomBytes(32).toString('hex');
    // Use INSERT...ON CONFLICT to atomically prevent duplicate email registration
    // (eliminates race condition between SELECT check and INSERT)
    const insertResult = await pool.query(
      `INSERT INTO users (id, email, username, name, password_hash, plan, verify_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [id, email.toLowerCase(), trimmedUsername, userName, hash, 'free', verifyToken]
    );
    if (!insertResult.rows.length) return res.status(400).json({ error: 'Email already registered' });

    // Send verification email
    sendVerificationEmail(email.toLowerCase(), verifyToken).catch(e => {
      console.error('[Register] Failed to send verification email:', e.message);
    });

    const accessToken = jwt.sign({ id, email: email.toLowerCase() }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = crypto.randomBytes(40).toString('hex');
    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refreshToken, id]);

    auditLog(id, 'register', 'user', id, { email: email.toLowerCase() }, req.ip);
    setTokenCookies(res, accessToken, refreshToken);
    res.json({ token: accessToken, refreshToken, user: { id, email: email.toLowerCase(), username: trimmedUsername, name: userName, plan: 'free', emailVerified: false, createdAt: new Date().toISOString(), hasKeys: [], limits: getPlanLimits('free') } });
  } catch(e) {
    console.error('[Register]', e.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', loginAccountLimiter, twoFALimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email/username and password required' });
  try {
    // Allow login with email OR username
    const isEmail = email.includes('@');
    const loginCols = 'id, email, username, name, plan, role, password_hash, api_keys, settings, email_verified, created_at, google_id, avatar_url';
    const result = isEmail
      ? await pool.query(`SELECT ${loginCols} FROM users WHERE LOWER(email) = LOWER($1)`, [email])
      : await pool.query(`SELECT ${loginCols} FROM users WHERE LOWER(username) = LOWER($1)`, [email]);
    const user = result.rows[0];
    // Always run bcrypt.compare even when user is not found to prevent
    // timing-based user enumeration (constant-time regardless of user existence)
    const DUMMY_HASH = '$2a$12$000000000000000000000uGiltNn9J1kOXqSqMpNQHCbSZkHm5mZS';
    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) return res.status(400).json({ error: 'Invalid credentials' });

    // Check if 2FA is enabled
    const totpSecret = user.settings?.totp_secret;
    if (totpSecret) {
      const { totpCode } = req.body;
      if (!totpCode) {
        return res.status(202).json({ requires2FA: true, message: 'Enter your 2FA code' });
      }
      // Check TOTP code or backup code
      const backupCodes = user.settings?.totp_backup_codes || [];
      const isValidTotp = verifyTOTP(totpSecret, totpCode);
      const backupIndex = backupCodes.indexOf(totpCode);
      if (!isValidTotp && backupIndex === -1) {
        return res.status(400).json({ error: 'Invalid 2FA code' });
      }
      // Consume backup code atomically — use a transaction to prevent race condition
      // where two simultaneous logins both use the same backup code
      if (backupIndex !== -1) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const freshUser = await client.query('SELECT settings FROM users WHERE id = $1 FOR UPDATE', [user.id]);
          if (!freshUser.rows.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'User not found' });
          }
          const freshCodes = freshUser.rows[0]?.settings?.totp_backup_codes || [];
          const freshIndex = freshCodes.indexOf(totpCode);
          if (freshIndex === -1) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Backup code already used' });
          }
          const updatedCodes = [...freshCodes];
          updatedCodes.splice(freshIndex, 1);
          await client.query(
            `UPDATE users SET settings = settings || $1::jsonb WHERE id = $2`,
            [JSON.stringify({ totp_backup_codes: updatedCodes }), user.id]
          );
          await client.query('COMMIT');
        } catch(txErr) {
          await client.query('ROLLBACK').catch(() => {});
          throw txErr;
        } finally {
          client.release();
        }
      }
    }

    const accessToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = crypto.randomBytes(40).toString('hex');
    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refreshToken, user.id]);

    auditLog(user.id, 'login', 'user', user.id, {}, req.ip);
    setTokenCookies(res, accessToken, refreshToken);
    res.json({ token: accessToken, refreshToken, user: safeUser(user) });
  } catch(e) {
    console.error('[Login]', e.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Email verification
router.get('/verify-email', verifyEmailLimiter, async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Verification token required' });
  try {
    const result = await pool.query('SELECT id, email FROM users WHERE verify_token = $1', [token]);
    if (!result.rows.length) return res.status(400).json({ error: 'Invalid or expired verification token' });
    await pool.query('UPDATE users SET email_verified = TRUE, verify_token = NULL WHERE id = $1', [result.rows[0].id]);
    auditLog(result.rows[0].id, 'email_verified', 'user', result.rows[0].id, {}, req.ip);
    res.json({ message: 'Email verified successfully!' });
  } catch(e) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Resend verification email (rate limited to prevent email spam)
const resendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: 'Too many verification requests. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false }
});
router.post('/resend-verification', auth, resendLimiter, async (req, res) => {
  try {
    const result = await pool.query('SELECT email_verified FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    if (result.rows[0].email_verified) return res.json({ message: 'Email already verified' });
    const verifyToken = crypto.randomBytes(32).toString('hex');
    await pool.query('UPDATE users SET verify_token = $1 WHERE id = $2', [verifyToken, req.user.id]);
    const userEmail = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
    if (userEmail.rows.length) {
      sendVerificationEmail(userEmail.rows[0].email, verifyToken).catch(e => {
        console.error('[Resend] Failed to send verification email:', e.message);
      });
    }
    res.json({ message: 'Verification email sent.' });
  } catch(e) {
    res.status(500).json({ error: 'Failed to resend verification' });
  }
});

// Refresh token — exchange refresh token for new access token
router.post('/refresh', async (req, res) => {
  // Accept refresh token from request body or httpOnly cookie
  const refreshToken = req.body.refreshToken || req.cookies?.trackly_refresh;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });
  try {
    // Atomic rotate: UPDATE...RETURNING prevents TOCTOU race where two concurrent
    // refresh requests both read the same token before either rotates it
    const newRefreshToken = crypto.randomBytes(40).toString('hex');
    const result = await pool.query(
      'UPDATE users SET refresh_token = $1 WHERE refresh_token = $2 RETURNING id, email',
      [newRefreshToken, refreshToken]
    );
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid refresh token' });
    const user = result.rows[0];
    const accessToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '15m' });
    setTokenCookies(res, accessToken, newRefreshToken);
    res.json({ token: accessToken, refreshToken: newRefreshToken });
  } catch(e) {
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Update username
router.put('/username', auth, async (req, res) => {
  const { username } = req.body;
  const trimmed = username ? username.trim().toLowerCase() : null;
  if (trimmed) {
    if (trimmed.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
    if (trimmed.length > 30) return res.status(400).json({ error: 'Username must be 30 characters or less' });
    if (!/^[a-z0-9_.-]+$/.test(trimmed)) return res.status(400).json({ error: 'Username can only contain letters, numbers, dots, dashes, and underscores' });
    const dup = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2', [trimmed, req.user.id]);
    if (dup.rows.length) return res.status(400).json({ error: 'Username already taken' });
  }
  try {
    await pool.query('UPDATE users SET username = $1 WHERE id = $2', [trimmed, req.user.id]);
    res.json({ username: trimmed, message: 'Username updated' });
  } catch(e) {
    res.status(500).json({ error: 'Failed to update username' });
  }
});

// Change password
router.post('/change-password', auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
  if (typeof newPassword !== 'string') return res.status(400).json({ error: 'Invalid input' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  if (newPassword.length > 128) return res.status(400).json({ error: 'Password too long' });
  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    const ok = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!ok) return res.status(400).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    auditLog(req.user.id, 'change_password', 'user', req.user.id, {}, req.ip);
    res.json({ message: 'Password updated successfully' });
  } catch(e) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Delete account
router.delete('/account', auth, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required to delete account' });
  try {
    const result = await pool.query('SELECT password_hash, role FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    const ok = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!ok) return res.status(400).json({ error: 'Incorrect password' });
    // Brands are deleted via CASCADE
    auditLog(req.user.id, 'delete_account', 'user', req.user.id, { email: req.user.email }, req.ip);
    await pool.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    res.json({ message: 'Account deleted' });
  } catch(e) {
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Forgot password — generate reset token (stored in PostgreSQL)
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  try {
    const result = await pool.query('SELECT id, email FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    // Always return success to prevent email enumeration
    if (!result.rows.length) return res.json({ message: 'If an account exists with that email, a reset link has been generated.' });
    const user = result.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour expiry
    // Delete any existing tokens for this user, then insert new one
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);
    await pool.query(
      'INSERT INTO password_reset_tokens (token, user_id, email, expires_at) VALUES ($1, $2, $3, $4)',
      [token, user.id, user.email, expiresAt]
    );
    // Send password reset email
    sendPasswordResetEmail(user.email, token).catch(e => {
      console.error('[ForgotPassword] Failed to send reset email:', e.message);
    });
    res.json({ message: 'If an account exists with that email, a reset link has been generated.' });
  } catch(e) {
    console.error('[Forgot Password]', e.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Reset password with token
router.post('/reset-password', resetPasswordLimiter, async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password required' });
  if (typeof newPassword !== 'string') return res.status(400).json({ error: 'Invalid input' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (newPassword.length > 128) return res.status(400).json({ error: 'Password too long' });
  try {
    const result = await pool.query(
      'SELECT user_id, email FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW()',
      [token]
    );
    if (!result.rows.length) {
      // Clean up expired token if it exists
      await pool.query('DELETE FROM password_reset_tokens WHERE token = $1', [token]);
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    const entry = result.rows[0];
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, entry.user_id]);
    await pool.query('DELETE FROM password_reset_tokens WHERE token = $1', [token]);
    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch(e) {
    console.error('[Reset Password]', e.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    // SECURITY: Only select needed columns — never fetch password_hash
    const result = await pool.query('SELECT id, email, username, name, plan, role, api_keys, settings, created_at, google_id, avatar_url FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Auto-upgrade admin users to owner plan
    if (user.role === 'admin' && user.plan !== 'owner') {
      await pool.query('UPDATE users SET plan = $1 WHERE id = $2', ['owner', user.id]);
      user.plan = 'owner';
    }
    res.json({ user: safeUser(user) });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── 2FA (TOTP) Setup ─────────────────────────────────
// Step 1: Generate a TOTP secret and return the otpauth URL
router.post('/2fa/setup', auth, twoFASetupLimiter, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT email, settings FROM users WHERE id = $1', [req.user.id]);
    if (!userResult.rows.length) return res.status(404).json({ error: 'User not found' });
    const user = userResult.rows[0];
    if (user.settings?.totp_secret && user.settings?.totp_enabled) {
      return res.status(400).json({ error: '2FA is already enabled. Disable it first to reconfigure.' });
    }
    const secret = generateSecret();
    const otpauthUrl = getOTPAuthURL(secret, user.email);
    // Store secret as pending (not enabled until verified)
    await pool.query(
      `UPDATE users SET settings = settings || $1::jsonb WHERE id = $2`,
      [JSON.stringify({ totp_secret_pending: secret }), req.user.id]
    );
    res.json({ secret, otpauthUrl });
  } catch(e) {
    console.error('[2FA Setup]', e.message);
    res.status(500).json({ error: 'Failed to set up 2FA' });
  }
});

// Step 2: Verify the TOTP code to confirm setup
router.post('/2fa/verify', auth, twoFASetupLimiter, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: '2FA code required' });
  try {
    const userResult = await pool.query('SELECT settings FROM users WHERE id = $1', [req.user.id]);
    if (!userResult.rows.length) return res.status(404).json({ error: 'User not found' });
    const pendingSecret = userResult.rows[0].settings?.totp_secret_pending;
    if (!pendingSecret) return res.status(400).json({ error: 'No pending 2FA setup. Call /2fa/setup first.' });

    if (!verifyTOTP(pendingSecret, code)) {
      return res.status(400).json({ error: 'Invalid code. Check your authenticator app and try again.' });
    }

    // Enable 2FA and generate backup codes
    const backupCodes = generateBackupCodes();
    await pool.query(
      `UPDATE users SET settings = settings || $1::jsonb WHERE id = $2`,
      [JSON.stringify({
        totp_secret: pendingSecret,
        totp_enabled: true,
        totp_secret_pending: null,
        totp_backup_codes: backupCodes
      }), req.user.id]
    );
    auditLog(req.user.id, '2fa_enabled', 'user', req.user.id, {}, req.ip);
    res.json({ enabled: true, backupCodes, message: 'Two-factor authentication enabled. Save your backup codes!' });
  } catch(e) {
    console.error('[2FA Verify]', e.message);
    res.status(500).json({ error: 'Failed to verify 2FA' });
  }
});

// Disable 2FA
router.post('/2fa/disable', auth, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required to disable 2FA' });
  try {
    const userResult = await pool.query('SELECT password_hash, settings FROM users WHERE id = $1', [req.user.id]);
    if (!userResult.rows.length) return res.status(404).json({ error: 'User not found' });
    const ok = await bcrypt.compare(password, userResult.rows[0].password_hash);
    if (!ok) return res.status(400).json({ error: 'Incorrect password' });
    await pool.query(
      `UPDATE users SET settings = settings || $1::jsonb WHERE id = $2`,
      [JSON.stringify({
        totp_secret: null,
        totp_enabled: false,
        totp_secret_pending: null,
        totp_backup_codes: null
      }), req.user.id]
    );
    auditLog(req.user.id, '2fa_disabled', 'user', req.user.id, {}, req.ip);
    res.json({ enabled: false, message: 'Two-factor authentication disabled.' });
  } catch(e) {
    console.error('[2FA Disable]', e.message);
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

// Get 2FA status
router.get('/2fa/status', auth, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT settings FROM users WHERE id = $1', [req.user.id]);
    if (!userResult.rows.length) return res.status(404).json({ error: 'User not found' });
    const enabled = !!(userResult.rows[0].settings?.totp_enabled);
    const backupCodesRemaining = (userResult.rows[0].settings?.totp_backup_codes || []).length;
    res.json({ enabled, backupCodesRemaining });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Google Sign-In ─────────────────────────────────────
router.post('/google', async (req, res) => {
  const { credential, access_token } = req.body;
  if (!credential && !access_token) return res.status(400).json({ error: 'Google credential required' });
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(400).json({ error: 'Google Sign-In is not configured' });

  try {
    let googleId, email, name, avatarUrl;

    if (access_token) {
      // OAuth2 access token flow — verify by calling Google's userinfo API server-side
      const https = require('https');
      const userInfo = await new Promise((resolve, reject) => {
        const url = 'https://www.googleapis.com/oauth2/v3/userinfo';
        const gReq = https.get(url, { headers: { 'Authorization': 'Bearer ' + access_token } }, (resp) => {
          let data = '';
          resp.on('data', chunk => data += chunk);
          resp.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (resp.statusCode !== 200) return reject(new Error(parsed.error_description || parsed.error || 'Invalid access token'));
              resolve(parsed);
            } catch(e) { reject(new Error('Failed to parse Google response')); }
          });
        });
        gReq.on('error', reject);
      });

      googleId = userInfo.sub;
      email = userInfo.email?.toLowerCase();
      name = userInfo.name || email?.split('@')[0];
      avatarUrl = userInfo.picture || null;

      if (!userInfo.email_verified) {
        return res.status(400).json({ error: 'Google email is not verified' });
      }
    } else {
      // Legacy ID token flow — verify via tokeninfo API
      const https = require('https');
      const googlePayload = await new Promise((resolve, reject) => {
        const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
        https.get(url, (resp) => {
          let data = '';
          resp.on('data', chunk => data += chunk);
          resp.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (resp.statusCode !== 200) return reject(new Error(parsed.error_description || 'Invalid token'));
              resolve(parsed);
            } catch(e) { reject(new Error('Failed to parse Google response')); }
          });
        }).on('error', reject);
      });

      // Verify audience matches our client ID
      if (googlePayload.aud !== clientId) {
        return res.status(400).json({ error: 'Token audience mismatch' });
      }

      googleId = googlePayload.sub;
      email = googlePayload.email?.toLowerCase();
      name = googlePayload.name || email?.split('@')[0];
      avatarUrl = googlePayload.picture || null;
    }

    if (!email) return res.status(400).json({ error: 'Google account has no email' });

    // Case 1: Existing user with this google_id
    let user = (await pool.query(
      'SELECT id, email, username, name, plan, role, api_keys, settings, email_verified, created_at, google_id, avatar_url FROM users WHERE google_id = $1',
      [googleId]
    )).rows[0];

    if (!user) {
      // Case 2: Existing account with same email — link Google
      user = (await pool.query(
        'SELECT id, email, username, name, plan, role, api_keys, settings, email_verified, created_at, google_id, avatar_url FROM users WHERE LOWER(email) = $1',
        [email]
      )).rows[0];

      if (user) {
        await pool.query('UPDATE users SET google_id = $1, avatar_url = COALESCE(avatar_url, $2), email_verified = TRUE WHERE id = $3', [googleId, avatarUrl, user.id]);
        user.google_id = googleId;
        user.avatar_url = user.avatar_url || avatarUrl;
        user.email_verified = true;
      } else {
        // Case 3: Brand new user — auto-generate username from Google name/email
        const id = uid();
        const autoUsername = await generateUsername(name || email);
        const dummyHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
        await pool.query(
          `INSERT INTO users (id, email, username, name, password_hash, plan, google_id, avatar_url, email_verified)
           VALUES ($1, $2, $3, $4, $5, 'free', $6, $7, TRUE)`,
          [id, email, autoUsername, name, dummyHash, googleId, avatarUrl]
        );
        user = (await pool.query(
          'SELECT id, email, username, name, plan, role, api_keys, settings, email_verified, created_at, google_id, avatar_url FROM users WHERE id = $1',
          [id]
        )).rows[0];
        auditLog(id, 'register', 'user', id, { email, method: 'google' }, req.ip);
      }
    }

    // Issue tokens
    const accessToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '15m' });
    const newRefreshToken = crypto.randomBytes(40).toString('hex');
    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [newRefreshToken, user.id]);

    auditLog(user.id, 'login', 'user', user.id, { method: 'google' }, req.ip);
    setTokenCookies(res, accessToken, newRefreshToken);
    res.json({ token: accessToken, refreshToken: newRefreshToken, user: safeUser(user) });
  } catch(e) {
    console.error('[Google Auth]', e.message);
    res.status(400).json({ error: 'Google authentication failed' });
  }
});

// Logout — clear httpOnly cookies and invalidate refresh token
router.post('/logout', auth, async (req, res) => {
  try {
    await pool.query('UPDATE users SET refresh_token = NULL WHERE id = $1', [req.user.id]);
  } catch(e) { console.warn('[Logout] Failed to clear refresh token:', e.message); }
  clearTokenCookies(res);
  res.json({ message: 'Logged out' });
});


module.exports = router;
