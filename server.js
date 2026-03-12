/**
 * Trackly - AI Visibility Tracker SaaS Server
 * Stack: Node.js + Express + PostgreSQL + JWT auth
 */

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const cron    = require('node-cron');
const path    = require('path');

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
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true,
  credentials: true
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── API ROUTES ──────────────────────────────────────────────────
app.use('/api/auth',   authRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api',        adminRoutes);

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
app.listen(PORT, () => {
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
