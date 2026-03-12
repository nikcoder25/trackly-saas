/**
 * Authentication routes — register, login, me
 */
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const router  = express.Router();

const { pool } = require('../config/db');
const { auth, JWT_SECRET } = require('../middleware/auth');
const { uid, safeUser } = require('../lib/helpers');
const { getPlanLimits } = require('../lib/plans');

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email format' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length) return res.status(400).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const id = uid();
    const userName = name || email.split('@')[0];
    await pool.query(
      'INSERT INTO users (id, email, name, password_hash, plan) VALUES ($1, $2, $3, $4, $5)',
      [id, email.toLowerCase(), userName, hash, 'free']
    );

    const token = jwt.sign({ id, email: email.toLowerCase() }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id, email: email.toLowerCase(), name: userName, plan: 'free', createdAt: new Date().toISOString(), hasKeys: [], limits: getPlanLimits('free') } });
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

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: safeUser(user) });
  } catch(e) {
    console.error('[Login]', e.message);
    res.status(500).json({ error: 'Login failed' });
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
    await pool.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    res.json({ message: 'Account deleted' });
  } catch(e) {
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Forgot password — generate reset token
const crypto = require('crypto');
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
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
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
