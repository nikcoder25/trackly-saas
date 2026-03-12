/**
 * Trackly - AI Visibility Tracker SaaS Server
 * Stack: Node.js + Express + PostgreSQL + JWT auth
 */

require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const compression = require('compression');
const rateLimit   = require('express-rate-limit');
const cron        = require('node-cron');
const path        = require('path');

const { pool, initDB } = require('./config/db');
const { auth }         = require('./middleware/auth');

// Route modules
const authRoutes  = require('./routes/auth');
const brandRoutes = require('./routes/brands');
const adminRoutes = require('./routes/admin');
const seoRoutes   = require('./routes/seo');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── INITIALIZE DATABASE ─────────────────────────────────────────
initDB().catch(e => {
  console.error('[DB] Failed to initialize PostgreSQL:', e.message);
  process.exit(1);
});

// ─── MIDDLEWARE ───────────────────────────────────────────────────
app.set('trust proxy', 1); // Trust first proxy (Railway, Render, etc.)

// HTTPS enforcement in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, 'https://' + req.headers.host + req.url);
    }
    // HSTS header — force HTTPS for 1 year
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
}

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP to allow inline scripts/styles in SPA
  crossOriginEmbedderPolicy: false
}));

// Gzip compression
app.use(compression());

// CORS — require explicit whitelist in production
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : (process.env.NODE_ENV === 'production' ? false : true),
  credentials: true
}));

app.use(express.json({ limit: '2mb' }));

// Rate limiting — auth endpoints (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per window
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Rate limiting — API endpoints (general, excludes long-running run endpoint)
// Uses user ID when authenticated, falls back to IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.includes('/run'), // Don't rate-limit query runs
  keyGenerator: (req) => {
    // Per-user rate limiting for authenticated requests
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
        return 'user:' + decoded.id;
      } catch(e) { /* fall through to IP */ }
    }
    return req.ip;
  }
});
app.use('/api/', apiLimiter);

app.use(express.static(path.join(__dirname, 'public')));

// ─── API ROUTES ──────────────────────────────────────────────────
app.use('/api/auth',   authRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api',        adminRoutes);

// ─── Admin panel page (secured with JWT-based admin auth) ───────
app.get('/admin', async (req, res) => {
  // Support both legacy ADMIN_SECRET and JWT auth via cookie/header
  const secret = process.env.ADMIN_SECRET;
  if (secret && req.query.key === secret) {
    return res.sendFile(path.join(__dirname, 'admin.html'));
  }
  // JWT-based: check Authorization header or trackly_token cookie
  const jwt = require('jsonwebtoken');
  const tokenHeader = (req.headers.authorization || '').replace('Bearer ', '');
  const token = tokenHeader || req.query.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const result = await pool.query('SELECT role FROM users WHERE id = $1', [decoded.id]);
      if (result.rows[0] && result.rows[0].role === 'admin') {
        return res.sendFile(path.join(__dirname, 'admin.html'));
      }
    } catch(e) { /* invalid token */ }
  }
  return res.status(404).send('Not found');
});

// ─── SEO LANDING PAGES ──────────────────────────────────────────
app.use('/', seoRoutes);

// ─── SCHEDULED RUNS (cron) ───────────────────────────────────────
const { runBrandQueries } = require('./routes/brands');

cron.schedule('0 * * * *', async () => {
  try {
    const result = await pool.query('SELECT b.* FROM brands b JOIN users u ON b.user_id = u.id');
    const now = Date.now();
    for (const row of result.rows) {
      const brand = { id: row.id, userId: row.user_id, ...row.data };
      if (!brand.schedule) continue;
      const lastRun = brand.runs?.length ? new Date(brand.runs[brand.runs.length-1].time).getTime() : 0;
      const intervalMs = brand.schedule * 3600 * 1000; // schedule is in hours
      if (now - lastRun >= intervalMs) {
        console.log(`[Cron] Running scheduled queries for brand: ${brand.name}`);
        try {
          await runBrandQueries(brand);
        } catch(e) {
          console.error(`[Cron] Error for ${brand.name}:`, e.message);
        }
      }
    }
  } catch(e) {
    console.error('[Cron] Error:', e.message);
  }
});

// ─── Password reset page ─────────────────────────────────────────
app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── CATCH-ALL: serve app for SPA routing ────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── START ────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║  Trackly SaaS Server Running             ║
  ║  http://localhost:${PORT}                  ║
  ║                                          ║
  ║  Database: PostgreSQL                    ║
  ║  JWT_SECRET: ${process.env.JWT_SECRET ? 'SET ✓' : 'NOT SET ✗'}                     ║
  ╚══════════════════════════════════════════╝
  `);
});

// ─── GRACEFUL SHUTDOWN ───────────────────────────────────────────
function shutdown(signal) {
  console.log(`[Server] ${signal} received. Shutting down gracefully...`);
  server.close(() => {
    pool.end().then(() => {
      console.log('[Server] Database connections closed.');
      process.exit(0);
    });
  });
  // Force exit after 10s if graceful shutdown fails
  setTimeout(() => { process.exit(1); }, 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
