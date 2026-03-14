/**
 * Trackly - AI Visibility Tracker SaaS Server
 * Stack: Node.js + Express + PostgreSQL + JWT auth
 */

require('dotenv').config();

// ─── ENV VAR VALIDATION ─────────────────────────────────────────
const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
  console.error('  Set them in your .env file or environment.');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && !process.env.ALLOWED_ORIGINS) {
  console.warn('[WARN] ALLOWED_ORIGINS not set in production. CORS will reject all cross-origin requests.');
}

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const compression  = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit    = require('express-rate-limit');
const cron         = require('node-cron');
const path         = require('path');

const { pool, initDB, notify, auditLog, cleanupApiLogs, cleanupNotifications, cleanupResetTokens, cleanupWebhookEvents, cleanupPromptRuns } = require('./config/db');
const { auth }         = require('./middleware/auth');
const { getServerKeys } = require('./lib/helpers');
const { createLogger }  = require('./lib/logger');
const log = createLogger('Server');

// Route modules
const authRoutes    = require('./routes/auth');
const brandRoutes   = require('./routes/brands');
const adminRoutes   = require('./routes/admin');
const seoRoutes     = require('./routes/seo');
const paymentRoutes  = require('./routes/payments');
const analyticsRoutes = require('./routes/analytics');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── INITIALIZE DATABASE ─────────────────────────────────────────
initDB().catch(e => {
  log.error('Failed to initialize PostgreSQL', { error: e.message });
  process.exit(1);
});

// ─── MIDDLEWARE ───────────────────────────────────────────────────
app.set('trust proxy', 1); // Trust first proxy (Railway, Render, etc.)

// HTTPS enforcement in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      // Validate Host header against ALLOWED_ORIGINS to prevent host header injection
      const allowedHosts = (process.env.ALLOWED_ORIGINS || '')
        .split(',').map(s => { try { return new URL(s.trim()).host; } catch { return s.trim(); } }).filter(Boolean);
      const host = req.headers.host || '';
      if (allowedHosts.length && !allowedHosts.includes(host)) {
        return res.status(400).send('Invalid host');
      }
      return res.redirect(301, 'https://' + host + req.url);
    }
    // HSTS header — force HTTPS for 1 year
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
}

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://accounts.google.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://accounts.google.com"],
      frameSrc: ["https://accounts.google.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' } // needed for Google Sign-In popup
}));

// Gzip compression
app.use(compression());

// CORS — require explicit ALLOWED_ORIGINS in all environments
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : (process.env.NODE_ENV === 'production' ? false : true),
  credentials: true
}));

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// ─── CSRF PROTECTION ─────────────────────────────────────────────
// Validate Origin header on state-changing requests to prevent cross-site
// form submissions. Safe because browsers always send Origin on POST/PUT/DELETE.
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.headers.origin;
  if (!origin) return next(); // Server-to-server or same-origin (older browsers omit Origin)
  const allowed = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : null;
  // In dev mode (no ALLOWED_ORIGINS), allow all origins
  if (!allowed) return next();
  if (allowed.includes(origin)) return next();
  return res.status(403).json({ error: 'Forbidden — origin not allowed' });
});

// Rate limit handler — includes retryAfter in response body
function rateLimitHandler(windowMs) {
  return (req, res) => {
    const retryAfterSec = Math.ceil(windowMs / 1000);
    res.setHeader('Retry-After', retryAfterSec);
    res.status(429).json({
      error: `Too many requests. Please retry after ${retryAfterSec} seconds.`,
      retryAfter: retryAfterSec
    });
  };
}

// Shared key generator — per-user when authenticated, per-IP otherwise
function userOrIpKey(prefix) {
  return (req) => {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
        return prefix + decoded.id;
      } catch(e) { /* fall through to IP */ }
    }
    return prefix + req.ip;
  };
}

// Rate limiting — auth endpoints (prevent brute force)
const AUTH_WINDOW = 15 * 60 * 1000;
const authLimiter = rateLimit({
  windowMs: AUTH_WINDOW, // 15 minutes
  max: 20, // 20 attempts per window
  handler: rateLimitHandler(AUTH_WINDOW),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Rate limiting — API endpoints (general, excludes long-running run endpoint)
const API_WINDOW = 60 * 1000;
const apiLimiter = rateLimit({
  windowMs: API_WINDOW, // 1 minute
  max: 120, // 120 requests per minute
  handler: rateLimitHandler(API_WINDOW),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
  skip: (req) => /\/brands\/[^/]+\/run$/.test(req.path), // Only skip the exact run endpoint (has its own limiter)
  keyGenerator: userOrIpKey('user:')
});
app.use('/api/', apiLimiter);

// Rate limiting — run endpoint (prevent abuse of expensive AI queries)
const RUN_WINDOW = 60 * 1000;
const runLimiter = rateLimit({
  windowMs: RUN_WINDOW, // 1 minute
  max: 5, // 5 runs per minute per user
  handler: rateLimitHandler(RUN_WINDOW),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
  keyGenerator: userOrIpKey('run:')
});
app.use('/api/brands/:id/run', runLimiter);

// Static assets — cache CSS/JS for 1 day (they're unversioned, so not too aggressive)
// HTML has no-cache so users always get the latest SPA shell
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// ─── CONFIG ENDPOINT (public — serves non-secret configuration) ──
app.get('/api/config', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null
  });
});

// ─── API ROUTES ──────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/brands',   brandRoutes);
app.use('/api',          adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api',          analyticsRoutes);

// ─── Admin panel page (secured with JWT-based admin auth) ───────
app.get('/admin', async (req, res) => {
  // Support both legacy ADMIN_SECRET and JWT auth via cookie/header
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return res.status(404).send('Not found');
  // Accept secret via X-Admin-Key header only (query param removed for security — secrets in URLs leak via logs, referrer headers, and browser history)
  const provided = req.headers['x-admin-key'] || '';
  // Use timing-safe comparison to prevent timing attacks
  if (typeof provided !== 'string') {
    return res.status(404).send('Not found');
  }
  try {
    const crypto = require('crypto');
    const providedBuf = Buffer.from(provided);
    const secretBuf = Buffer.from(secret);
    if (providedBuf.length !== secretBuf.length || !crypto.timingSafeEqual(providedBuf, secretBuf)) {
      return res.status(404).send('Not found');
    }
  } catch(e) {
    return res.status(404).send('Not found');
  }
  // Set Cache-Control to prevent caching of admin page with secret in URL
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ─── METHODOLOGY PAGE (public, SEO-friendly) ───────────────────
app.get('/methodology', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── SEO LANDING PAGES ──────────────────────────────────────────
app.use('/', seoRoutes);

// ─── SCHEDULED RUNS (cron) ───────────────────────────────────────
const { runBrandQueries } = require('./routes/brands');

// Cron concurrency — process up to 5 brands simultaneously to avoid
// sequential bottleneck at scale (300+ users with scheduled brands).
const CRON_BATCH_SIZE = parseInt(process.env.CRON_BATCH_SIZE, 10) || 5;

// Helper: try to acquire PostgreSQL advisory lock (non-blocking, session-level)
// Used to prevent duplicate cron jobs when running multiple server instances
async function withCronLock(lockId, fn) {
  let client;
  try {
    client = await pool.connect();
  } catch(e) {
    // Cannot get DB connection — skip this cron cycle rather than running unprotected
    log.warn('Cron lock: failed to get DB connection, skipping cycle', { error: e.message });
    return;
  }
  try {
    const lockResult = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [lockId]);
    if (!lockResult.rows[0]?.acquired) {
      return; // Another instance holds this lock
    }
    try {
      await fn();
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [lockId]).catch(() => {});
    }
  } catch(e) {
    // Lock query failed — skip rather than running unprotected (prevents duplicate runs)
    log.warn('Cron lock acquisition failed, skipping cycle', { error: e.message, lockId });
  } finally {
    client.release();
  }
}

cron.schedule('0 * * * *', async () => {
  await withCronLock(1001, async () => {
  try {
    // Only fetch brands that have a schedule configured (avoid full table scan)
    const result = await pool.query(
      `SELECT b.* FROM brands b JOIN users u ON b.user_id = u.id
       WHERE b.data->>'schedule' IS NOT NULL AND (b.data->>'schedule')::int > 0`
    );
    if (!result.rows.length) return;
    log.info(`Found ${result.rows.length} brands with active schedules`);
    const now = Date.now();

    // Filter to brands that are due for a run
    const dueBrands = [];
    for (const row of result.rows) {
      const brand = { id: row.id, userId: row.user_id, ...row.data };
      if (!brand.schedule) continue;
      const lastRun = brand.runs?.length ? new Date(brand.runs[brand.runs.length-1].time).getTime() : 0;
      const intervalMs = brand.schedule * 3600 * 1000;
      if (now - lastRun >= intervalMs) {
        dueBrands.push(brand);
      }
    }

    if (!dueBrands.length) return;
    log.info(`${dueBrands.length} brands due for scheduled run`, { batchSize: CRON_BATCH_SIZE });

    // Process in parallel batches of CRON_BATCH_SIZE
    for (let i = 0; i < dueBrands.length; i += CRON_BATCH_SIZE) {
      const batch = dueBrands.slice(i, i + CRON_BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (brand) => {
          log.info(`Running scheduled queries for brand: ${brand.name}`);
          try {
            await runBrandQueries(brand);
            auditLog(brand.userId, 'scheduled_run', 'brand', brand.id, { brandName: brand.name, schedule: brand.schedule }, null);
          } catch(e) {
            log.error(`Scheduled run failed for ${brand.name}`, { error: e.message });
            auditLog(brand.userId, 'scheduled_run_failed', 'brand', brand.id, { brandName: brand.name, error: e.message }, null);
            notify(brand.userId, 'run_failed', 'Scheduled Run Failed', `Scheduled run for "${brand.name}" failed: ${e.message}`, { brandId: brand.id });
          }
        })
      );
    }
    log.info(`Scheduled runs complete: ${dueBrands.length} brands processed`);
  } catch(e) {
    log.error('Cron job error', { error: e.message });
  }
  }); // end withCronLock
});

// ─── SCHEDULED REPORTS (cron — every Monday 8am and 1st of month 8am) ──
const { sendReportEmail, isEmailConfigured } = require('./lib/email');

cron.schedule('0 8 * * 1', () => sendScheduledReports('weekly'));  // Monday 8am
cron.schedule('0 8 1 * *', () => sendScheduledReports('monthly')); // 1st of month 8am

async function sendScheduledReports(frequency) {
  if (!isEmailConfigured()) return;
  try {
    // Find users with this report frequency configured
    const users = await pool.query(
      `SELECT id, email, settings FROM users WHERE settings->'reportSchedule'->>'frequency' = $1`,
      [frequency]
    );
    if (!users.rows.length) return;
    log.info(`Sending ${frequency} reports to ${users.rows.length} users`);

    for (const user of users.rows) {
      const reportSettings = user.settings?.reportSchedule || {};
      const brandFilter = reportSettings.brandIds || [];

      // Get user's brands (or specific ones if configured)
      let brandsQuery;
      if (brandFilter.length) {
        brandsQuery = await pool.query(
          'SELECT * FROM brands WHERE user_id = $1 AND id = ANY($2::text[])',
          [user.id, brandFilter]
        );
      } else {
        brandsQuery = await pool.query('SELECT * FROM brands WHERE user_id = $1', [user.id]);
      }

      for (const row of brandsQuery.rows) {
        const data = row.data;
        const runs = data.runs || [];
        if (!runs.length) continue;

        const lastRun = runs[runs.length - 1];
        const totalMentions = runs.reduce((sum, r) => sum + (r.allResults || []).filter(m => m.mentioned).length, 0);
        const avgSov = runs.length ? runs.reduce((sum, r) => sum + (r.sov || 0), 0) / runs.length : 0;
        const sovTrend = runs.length >= 2 ? (runs[runs.length - 1].sov || 0) - (runs[runs.length - 2].sov || 0) : 0;

        const platformStats = {};
        if (lastRun.allResults) {
          for (const r of lastRun.allResults) {
            if (!platformStats[r.platform]) platformStats[r.platform] = { total: 0, mentioned: 0 };
            platformStats[r.platform].total++;
            if (r.mentioned) platformStats[r.platform].mentioned++;
          }
        }

        const report = {
          totalRuns: runs.length,
          totalMentions,
          averageSov: parseFloat(avgSov.toFixed(1)),
          sovTrend,
          lastRunSov: lastRun.sov || 0,
          platformStats,
          period: { from: runs[0]?.date || null, to: lastRun.date || null }
        };

        try {
          await sendReportEmail(user.email, data.name, report);
        } catch(e) {
          log.error(`Failed to send report for brand ${data.name}`, { userId: user.id, error: e.message });
        }
      }

      // Update lastSent timestamp
      await pool.query(
        `UPDATE users SET settings = jsonb_set(settings, '{reportSchedule,lastSent}', $1::jsonb) WHERE id = $2`,
        [JSON.stringify(new Date().toISOString()), user.id]
      );
    }
    log.info(`${frequency} reports sent`);
  } catch(e) {
    log.error('Report cron error', { error: e.message });
  }
}

// ─── Password reset page ─────────────────────────────────────────
app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── LEGAL PAGES ─────────────────────────────────────────────────
['privacy', 'terms', 'cookies'].forEach(page => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', `${page}.html`));
  });
});

// ─── CATCH-ALL: serve app for SPA routing ────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── ERROR TRACKING MIDDLEWARE ───────────────────────────────────
// Must be AFTER all routes to catch unhandled errors
app.use((err, req, res, next) => {
  const errorInfo = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    userId: req.user?.id || null,
    error: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    statusCode: err.statusCode || 500
  };
  log.error('Unhandled route error', errorInfo);
  if (res.headersSent) return next(err);
  res.status(errorInfo.statusCode).json({ error: 'Internal server error' });
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
  // Log loaded API key counts for debugging rotation
  const keys = getServerKeys();
  const keyInfo = Object.entries(keys)
    .map(([platform, arr]) => `${platform}: ${arr.length} key(s)`)
    .join(', ');
  log.info(`API Keys: ${keyInfo}`);

  // Cleanup old data at startup and every 24h
  const runAllCleanups = () => {
    cleanupApiLogs();
    cleanupNotifications();
    cleanupResetTokens();
    cleanupWebhookEvents();
    cleanupPromptRuns();
  };
  runAllCleanups();
  setInterval(runAllCleanups, 24 * 60 * 60 * 1000);
});

// ─── GRACEFUL SHUTDOWN ───────────────────────────────────────────
function shutdown(signal) {
  log.info(`${signal} received. Shutting down gracefully...`);
  server.close(() => {
    pool.end().then(() => {
      log.info('Database connections closed.');
      process.exit(0);
    });
  });
  // Force exit after 10s if graceful shutdown fails
  setTimeout(() => { process.exit(1); }, 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
