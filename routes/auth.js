/**
 * Authentication routes — register, login, me
 */
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const router  = express.Router();

const { pool, auditLog } = require('../config/db');
const { auth, JWT_SECRET } = require('../middleware/auth');
const { uid, safeUser } = require('../lib/helpers');
const { getPlanLimits } = require('../lib/plans');
const crypto = require('crypto');

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Invalid input' });
  if (email.length > 254) return res.status(400).json({ error: 'Email too long' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email format' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (password.length > 128) return res.status(400).json({ error: 'Password too long' });
  if (name && (typeof name !== 'string' || name.length > 100)) return res.status(400).json({ error: 'Name must be 100 characters or less' });

  try {
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length) return res.status(400).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const id = uid();
    const userName = name || email.split('@')[0];
    const verifyToken = crypto.randomBytes(32).toString('hex');
    await pool.query(
      'INSERT INTO users (id, email, name, password_hash, plan, verify_token) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, email.toLowerCase(), userName, hash, 'free', verifyToken]
    );

    // In production, send verification email. For now, log it.
    console.log(`[Auth] Verification token for ${email}: ${verifyToken}`);
    console.log(`[Auth] Verify link: /api/auth/verify-email?token=${verifyToken}`);

    const accessToken = jwt.sign({ id, email: email.toLowerCase() }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = crypto.randomBytes(40).toString('hex');
    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refreshToken, id]);

    auditLog(id, 'register', 'user', id, { email: email.toLowerCase() }, req.ip);
    res.json({ token: accessToken, refreshToken, user: { id, email: email.toLowerCase(), name: userName, plan: 'free', emailVerified: false, createdAt: new Date().toISOString(), hasKeys: [], limits: getPlanLimits('free') } });
  } catch(e) {
    console.error('[Register]', e.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const result = await pool.query('SELECT id, email, name, plan, role, password_hash, api_keys, settings, created_at FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    const user = result.rows[0];
    if (!user) return res.status(400).json({ error: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(400).json({ error: 'Invalid email or password' });

    const accessToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = crypto.randomBytes(40).toString('hex');
    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refreshToken, user.id]);

    auditLog(user.id, 'login', 'user', user.id, {}, req.ip);
    res.json({ token: accessToken, refreshToken, user: safeUser(user) });
  } catch(e) {
    console.error('[Login]', e.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Email verification
router.get('/verify-email', async (req, res) => {
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

// Resend verification email
router.post('/resend-verification', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT email_verified FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    if (result.rows[0].email_verified) return res.json({ message: 'Email already verified' });
    const verifyToken = crypto.randomBytes(32).toString('hex');
    await pool.query('UPDATE users SET verify_token = $1 WHERE id = $2', [verifyToken, req.user.id]);
    console.log(`[Auth] Re-verification token for user ${req.user.id}: ${verifyToken}`);
    res.json({ message: 'Verification email sent.', _devToken: process.env.NODE_ENV !== 'production' ? verifyToken : undefined });
  } catch(e) {
    res.status(500).json({ error: 'Failed to resend verification' });
  }
});

// Refresh token — exchange refresh token for new access token
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });
  try {
    const result = await pool.query('SELECT id, email, refresh_token FROM users WHERE refresh_token = $1', [refreshToken]);
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid refresh token' });
    const user = result.rows[0];
    // Rotate refresh token
    const newRefreshToken = crypto.randomBytes(40).toString('hex');
    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [newRefreshToken, user.id]);
    const accessToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '15m' });
    res.json({ token: accessToken, refreshToken: newRefreshToken });
  } catch(e) {
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Change password
router.post('/change-password', auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    const ok = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!ok) return res.status(400).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(newPassword, 10);
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

// Forgot password — generate reset token
const resetTokens = new Map(); // In-memory store; use DB/Redis in production

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  try {
    const result = await pool.query('SELECT id, email FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    // Always return success to prevent email enumeration
    if (!result.rows.length) return res.json({ message: 'If an account exists with that email, a reset link has been generated.' });
    const user = result.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    resetTokens.set(token, { userId: user.id, email: user.email, expires: Date.now() + 3600000 }); // 1 hour expiry
    // Clean up expired tokens
    for (const [key, val] of resetTokens) {
      if (val.expires < Date.now()) resetTokens.delete(key);
    }
    // In production, send email with reset link. For now, log it.
    console.log(`[Auth] Password reset token for ${user.email}: ${token}`);
    console.log(`[Auth] Reset link: /reset-password?token=${token}`);
    res.json({ message: 'If an account exists with that email, a reset link has been generated.', _devToken: process.env.NODE_ENV !== 'production' ? token : undefined });
  } catch(e) {
    console.error('[Forgot Password]', e.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const entry = resetTokens.get(token);
  if (!entry || entry.expires < Date.now()) {
    resetTokens.delete(token);
    return res.status(400).json({ error: 'Invalid or expired reset token' });
  }
  try {
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, entry.userId]);
    resetTokens.delete(token);
    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch(e) {
    console.error('[Reset Password]', e.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    // SECURITY: Only select needed columns — never fetch password_hash
    const result = await pool.query('SELECT id, email, name, plan, role, api_keys, settings, created_at FROM users WHERE id = $1', [req.user.id]);
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

module.exports = router;
