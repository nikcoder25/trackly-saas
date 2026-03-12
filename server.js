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
const authRoutes    = require('./routes/auth');
const brandRoutes   = require('./routes/brands');
const adminRoutes   = require('./routes/admin');
const seoRoutes     = require('./routes/seo');
const paymentRoutes = require('./routes/payments');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── INITIALIZE DATABASE ─────────────────────────────────────────
initDB().catch(e => {
  console.error('[DB] Failed to initialize PostgreSQL:', e.message);
  process.exit(1);
});

// ─── MIDDLEWARE ───────────────────────────────────────────────────
app.set('trust proxy', 1); // Trust first proxy (Railway, Render, etc.)

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP to allow inline scripts/styles in SPA
  crossOriginEmbedderPolicy: false
}));

// Gzip compression
app.use(compression());

// CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true,
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
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.includes('/run') // Don't rate-limit query runs
});
app.use('/api/', apiLimiter);

app.use(express.static(path.join(__dirname, 'public')));

// ─── API ROUTES ──────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/brands',   brandRoutes);
app.use('/api',          adminRoutes);
app.use('/api/payments', paymentRoutes);

// ─── Admin panel page (secured with ADMIN_SECRET) ───────────────
app.get('/admin', (req, res) => {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return res.status(404).send('Not found');
  // Accept secret via X-Admin-Key header (preferred) or query param (legacy)
  const provided = req.headers['x-admin-key'] || req.query.key || '';
  // Use timing-safe comparison to prevent timing attacks
  if (typeof provided !== 'string' || provided.length !== secret.length) {
    return res.status(404).send('Not found');
  }
  try {
    const crypto = require('crypto');
    if (!crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) {
      return res.status(404).send('Not found');
    }
  } catch(e) {
    return res.status(404).send('Not found');
  }
  // Set Cache-Control to prevent caching of admin page with secret in URL
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(path.join(__dirname, 'admin.html'));
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
