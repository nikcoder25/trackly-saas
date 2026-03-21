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
if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.error('[FATAL] JWT_SECRET must be at least 32 characters in production for security.');
  console.error('  Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && !process.env.ENCRYPTION_KEY) {
  console.warn('[WARN] ENCRYPTION_KEY not set in production — falling back to JWT_SECRET.');
  console.warn('       Rotating JWT_SECRET will make ALL encrypted API keys UNRECOVERABLE.');
  console.warn('       Set ENCRYPTION_KEY: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
}

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const compression  = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit    = require('express-rate-limit');
const cron         = require('node-cron');
const path         = require('path');

const { pool, initDB, notify, auditLog, cleanupApiLogs, cleanupNotifications, cleanupResetTokens, cleanupWebhookEvents, cleanupPromptRuns, cleanupResponseCache, cleanupDailyCosts } = require('./config/db');
const { auth }         = require('./middleware/auth');
const { getServerKeys } = require('./lib/helpers');
const { createLogger }  = require('./lib/logger');
const { RATE_LIMITS, TIMEOUTS } = require('./config/constants');
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
        return res.status(400).json({ error: 'Invalid host' });
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
      scriptSrc: ["'self'", "https://accounts.google.com", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://accounts.google.com", "https://www.googleapis.com"],
      frameSrc: ["https://accounts.google.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' } // needed for Google Sign-In popup
}));

// Gzip compression — skip SSE streaming endpoints so results arrive in real-time.
// Check raw req.url string (always available) rather than req.query (may not be parsed yet)
// or res.getHeader (not set until route handler runs).
app.use(compression({
  filter: (req, res) => {
    if (req.url && /\/run\?.*stream=1/.test(req.url)) return false;
    return compression.filter(req, res);
  }
}));

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
  const allowed = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : null;
  // In dev mode (no ALLOWED_ORIGINS), allow all origins
  if (!allowed) return next();
  if (!origin) {
    // In production, reject state-changing requests without Origin header
    // unless they come with a valid Authorization header (API/server-to-server calls)
    const hasAuth = req.headers.authorization || req.cookies?.trackly_token;
    if (!hasAuth) return res.status(403).json({ error: 'Forbidden — missing origin header' });
    return next();
  }
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
const authLimiter = rateLimit({
  windowMs: RATE_LIMITS.auth.windowMs,
  max: RATE_LIMITS.auth.max,
  handler: rateLimitHandler(RATE_LIMITS.auth.windowMs),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Rate limiting — API endpoints (general, excludes long-running run endpoint)
const apiLimiter = rateLimit({
  windowMs: RATE_LIMITS.api.windowMs,
  max: RATE_LIMITS.api.max,
  handler: rateLimitHandler(RATE_LIMITS.api.windowMs),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false, keyGeneratorIpFallback: false },
  skip: (req) => /\/brands\/[^/]+\/run$/.test(req.path), // Only skip the exact run endpoint (has its own limiter)
  keyGenerator: userOrIpKey('user:')
});
app.use('/api/', apiLimiter);

// Rate limiting — run endpoint (prevent abuse of expensive AI queries)
const runLimiter = rateLimit({
  windowMs: RATE_LIMITS.run.windowMs,
  max: RATE_LIMITS.run.max,
  handler: rateLimitHandler(RATE_LIMITS.run.windowMs),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false, keyGeneratorIpFallback: false },
  keyGenerator: userOrIpKey('run:')
});
app.use('/api/brands/:id/run', runLimiter);

// Static assets — versioned CSS/JS (with ?v= query string) get long cache;
// HTML has no-cache so users always get the latest SPA shell.
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  etag: true,
  immutable: true,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (filePath.endsWith('.min.js') || filePath.endsWith('.min.css')) {
      // Minified assets are versioned via query string — cache aggressively
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// ─── HEALTH CHECK (before auth — accessible to monitoring tools) ──
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', time: new Date().toISOString() });
  } catch(e) {
    res.status(503).json({ status: 'error', time: new Date().toISOString() });
  }
});

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
  if (!secret) return res.status(404).json({ error: 'Not found' });
  // Accept secret via X-Admin-Key header only (query param removed for security — secrets in URLs leak via logs, referrer headers, and browser history)
  const provided = req.headers['x-admin-key'] || '';
  // Use timing-safe comparison to prevent timing attacks
  if (typeof provided !== 'string') {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    const crypto = require('crypto');
    const providedBuf = Buffer.from(provided);
    const secretBuf = Buffer.from(secret);
    if (providedBuf.length !== secretBuf.length || !crypto.timingSafeEqual(providedBuf, secretBuf)) {
      return res.status(404).json({ error: 'Not found' });
    }
  } catch(e) {
    return res.status(404).json({ error: 'Not found' });
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
// In cluster mode, only worker 1 runs cron jobs to prevent duplicates.
// The advisory lock is a second safety net for multi-instance deployments.
const IS_CRON_WORKER = !process.env.CLUSTER_WORKER_ID || process.env.CLUSTER_WORKER_ID === '1';
const { runBrandQueries } = require('./routes/brands');
const { getUserPlan, getPlanLimits } = require('./lib/plans');

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

IS_CRON_WORKER && cron.schedule('0 * * * *', async () => {
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

    // Filter to brands that are due for a run (enforce plan-based minimum schedule + brand count limit)
    const dueBrands = [];
    const planCache = {}; // cache user plans to avoid repeated DB queries
    const userBrandCounts = {}; // track how many brands per user we'll allow to run
    for (const row of result.rows) {
      const brand = { id: row.id, userId: row.user_id, ...row.data };
      if (!brand.schedule) continue;

      // Enforce plan-based minimum schedule interval
      if (!planCache[brand.userId]) {
        const userPlan = await getUserPlan(brand.userId);
        planCache[brand.userId] = getPlanLimits(userPlan);
        userBrandCounts[brand.userId] = 0;
      }
      const limits = planCache[brand.userId];

      // Enforce brand count limit — skip brands beyond the plan's allowed count
      userBrandCounts[brand.userId] = (userBrandCounts[brand.userId] || 0) + 1;
      if (userBrandCounts[brand.userId] > limits.brands) {
        continue;
      }

      const effectiveSchedule = Math.max(brand.schedule, limits.minScheduleHours || 168);

      const lastRun = brand.runs?.length ? new Date(brand.runs[brand.runs.length-1].time).getTime() : 0;
      const intervalMs = effectiveSchedule * 3600 * 1000;
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

IS_CRON_WORKER && cron.schedule('0 8 * * 1', () => sendScheduledReports('weekly').catch(e => log.error('Weekly report cron failed', { error: e.message })));   // Monday 8am
IS_CRON_WORKER && cron.schedule('0 8 1 * *', () => sendScheduledReports('monthly').catch(e => log.error('Monthly report cron failed', { error: e.message }))); // 1st of month 8am

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

// ─── Login & Signup pages (direct URL access) ──────────────────
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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
    cleanupResponseCache();
    cleanupDailyCosts();
  };
  runAllCleanups();
  setInterval(runAllCleanups, TIMEOUTS.cleanupInterval);
});

// ─── GRACEFUL SHUTDOWN ───────────────────────────────────────────
function shutdown(signal) {
  log.info(`${signal} received. Shutting down gracefully...`);
  server.close(() => {
    const poolCloseTimeout = setTimeout(() => {
      log.warn('Database pool close timed out, forcing exit.');
      process.exit(1);
    }, TIMEOUTS.gracefulShutdownDb);
    pool.end().then(() => {
      clearTimeout(poolCloseTimeout);
      log.info('Database connections closed.');
      process.exit(0);
    }).catch(() => {
      clearTimeout(poolCloseTimeout);
      log.warn('Database pool close failed, forcing exit.');
      process.exit(1);
    });
  });
  // Force exit if graceful shutdown fails
  setTimeout(() => { process.exit(1); }, TIMEOUTS.gracefulShutdownMax);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
