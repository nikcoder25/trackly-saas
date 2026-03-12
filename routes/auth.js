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

router.get('/me', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: safeUser(user) });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
