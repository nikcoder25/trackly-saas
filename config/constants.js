/**
 * Centralized constants — all hardcoded values in one place.
 * Grouped by category for easy discovery and modification.
 */

// ─── API ENDPOINTS ──────────────────────────────────────────────
const API_ENDPOINTS = {
  openai: {
    chat: 'https://api.openai.com/v1/chat/completions',
    files: 'https://api.openai.com/v1/files',
    batches: 'https://api.openai.com/v1/batches',
  },
  perplexity: {
    chat: 'https://api.perplexity.ai/chat/completions',
  },
  gemini: {
    base: 'https://generativelanguage.googleapis.com/v1beta/models/',
  },
  grok: {
    chat: 'https://api.x.ai/v1/chat/completions',
    responses: 'https://api.x.ai/v1/responses',
  },
  claude: {
    messages: 'https://api.anthropic.com/v1/messages',
    batches: 'https://api.anthropic.com/v1/messages/batches',
  },
  deepseek: {
    chat: 'https://api.deepseek.com/chat/completions',
  },
  google: {
    userinfo: 'https://www.googleapis.com/oauth2/v3/userinfo',
    tokeninfo: 'https://oauth2.googleapis.com/tokeninfo',
  },
  dodopayments: {
    live: 'https://live.dodopayments.com',
    test: 'https://test.dodopayments.com',
  },
};

// ─── TIMEOUTS (ms) ──────────────────────────────────────────────
const TIMEOUTS = {
  emailApi: 10000,          // 10s — email provider API
  paymentApi: 15000,        // 15s — DodoPayments checkout
  batchResults: 30000,      // 30s — batch result fetching (Claude/OpenAI)
  batchPollInterval: 10000, // 10s between batch status polls
  batchMaxWait: 5 * 60 * 1000, // 5 min max wait for batch completion
  gracefulShutdownDb: 5000, // 5s — DB pool close on shutdown
  gracefulShutdownMax: 10000, // 10s — force exit on shutdown
  cleanupInterval: 24 * 60 * 60 * 1000, // 24h — cleanup job interval
  cacheSweepInterval: 60 * 60 * 1000,   // 1h — memory cache sweep
  rateLimitCleanup: 300000, // 5 min — stale rate-limit entry cleanup
};

// ─── RATE LIMITING ──────────────────────────────────────────────
const RATE_LIMITS = {
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
  },
  api: {
    windowMs: 60 * 1000, // 1 minute
    max: 120,
  },
  run: {
    windowMs: 60 * 1000, // 1 minute
    max: 5,
  },
  loginAccount: {
    windowMs: 15 * 60 * 1000,
    max: 10,
  },
  twoFA: {
    windowMs: 15 * 60 * 1000,
    max: 5,
  },
  forgotPassword: {
    windowMs: 60 * 60 * 1000,
    max: 5,
  },
  resetPassword: {
    windowMs: 60 * 60 * 1000,
    max: 10,
  },
  verifyEmail: {
    windowMs: 60 * 60 * 1000,
    max: 20,
  },
  twoFASetup: {
    windowMs: 15 * 60 * 1000,
    max: 10,
  },
  admin: {
    windowMs: 15 * 60 * 1000,
    max: 10,
  },
};

// ─── CACHE ──────────────────────────────────────────────────────
const CACHE = {
  staticTtlMs: 7 * 24 * 60 * 60 * 1000,  // 7 days for non-search models
  searchTtlMs: 24 * 60 * 60 * 1000,       // 24h for search models
  maxMemoryEntries: 10000,
};

// ─── TOKEN / COOKIE EXPIRATION ──────────────────────────────────
const AUTH = {
  accessTokenMaxAge: 15 * 60 * 1000,         // 15 minutes
  refreshTokenMaxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  passwordResetExpiry: 3600000,               // 1 hour
  bcryptRounds: 12,
};

// ─── AI PLATFORM SETTINGS ───────────────────────────────────────
const AI = {
  maxOutputTokens: 300,
  systemPrompt: 'Recommendation ssistant. Name specific businesses/brands with full names. List 5-10 with brief descriptions. Max 200 words.',
  fetchMaxRetries: 2,
  networkBaseDelay: 500,      // 0.5s backoff for network errors
  rateLimitBaseDelay: 3000,   // 3s backoff for rate limits
  rateLimitJitterMax: 3000,   // 0-3s jitter
  anthropicVersion: '2023-06-01',
};

// ─── BATCH PROCESSING ───────────────────────────────────────────
const BATCH = {
  promptRunInsert: 20,   // PR_BATCH — prompt runs per INSERT batch
  citationInsert: 30,    // CIT_BATCH — citations per INSERT batch
  cronBatchSize: 5,      // brands processed in parallel during cron
  costMultiplier: 0.5,   // batch API discount (50% of standard cost)
};

// ─── BRAND RUN SETTINGS ─────────────────────────────────────────
const RUN = {
  maxLockAgeMs: 10 * 60 * 1000,  // 10 min — auto-release stuck locks
  failThreshold: 3,               // skip platform after N consecutive failures
  stableRunThreshold: 3,          // reuse results after N identical runs
  webhookMaxRetries: 3,
  maxCitationsPerResult: 10,
  sovHistoryMaxDays: 90,
};

// ─── DATA RETENTION (days) ──────────────────────────────────────
const RETENTION = {
  apiLogsDays: 7,
  notificationsDays: 30,
  webhookEventsDays: 30,
  promptRunsDays: 90,
  dailyCostsDays: 90,
};

// ─── RECOMMENDATION THRESHOLDS ──────────────────────────────────
const THRESHOLDS = {
  lowVisibility: 0.2,             // mention rate below 20%
  criticalVisibility: 0.05,       // mention rate below 5%
  competitorDomination: 0.3,      // competitor mention rate above 30%
  competitorMultiplier: 2,        // competitor rate > N× own rate
  negativeSentiment: 0.3,         // 30% negative = high severity
  criticalNegativeSentiment: 0.5, // 50% negative = critical
  visibilityDecline: -20,         // 20% decline triggers alert
  missingCitationMinRate: 0.1,    // only flag if mention rate > 10%
  platformGapMultiplier: 0.3,     // flag platform < 30% of average
  poorRankPosition: 5,            // average rank > 5 = low
  poorRankMinMentionRate: 0.2,    // only flag if mention rate > 20%
  queryBlindSpotMinRuns: 3,       // need 3+ runs to flag blind spot
  visibilityDropMultiplier: 0.7,  // drop detected below 70% of baseline
  visibilityGainMultiplier: 1.3,  // gain detected above 130% of baseline
  visibilityGainAbsoluteMin: 0.1, // minimum absolute gain to flag
};

// ─── ANALYTICS ──────────────────────────────────────────────────
const ANALYTICS = {
  failureRateRed: 0.5,     // platform status = red
  failureRateAmber: 0.2,   // platform status = amber
  defaultPromptRunLimit: 20,
  totalPlatforms: 7,
};

// ─── UI NOTIFICATION SETTINGS ───────────────────────────────────
const UI = {
  maxNotifications: 5,
  notificationDuration: 3500,   // ms
  maxPollErrors: 15,
  apiCacheTtl: 30000,           // 30s frontend API cache
};

// ─── PLATFORM COLOR THEMES ─────────────────────────────────────
const PLATFORM_COLORS = {
  ChatGPT:      '#19c37d',
  Perplexity:   '#20b8cd',
  Claude:       '#d97706',
  Gemini:       '#4285f4',
  Grok:         '#1d9bf0',
  'Google AIO': '#34a853',
  DeepSeek:     '#4a9eff',
};

// ─── EMAIL TEMPLATE COLORS ─────────────────────────────────────
const EMAIL_COLORS = {
  primary: '#4f46e5',
  muted: '#666',
  light: '#999',
  success: '#16a34a',
  danger: '#dc2626',
  neutral: '#6b7280',
  border: '#e5e7eb',
  bgLight: '#f3f4f6',
  bgLighter: '#f9fafb',
};

// ─── SEO / BRANDING ────────────────────────────────────────────
const BRANDING = {
  siteUrl: 'https://trackly.so',
  themeColor: '#FF6154',
};

// ─── DAILY COST BUDGETS (per plan, USD) ────────────────────────
const DAILY_COST_BUDGETS = {
  free: 0.50,
  pro: 2.00,
  agency: 8.00,
  enterprise: 50.00,
  owner: 9999,
};

// ─── TOTP / 2FA ────────────────────────────────────────────────
const TOTP = {
  period: 30,   // seconds
  digits: 6,
};

module.exports = {
  API_ENDPOINTS,
  TIMEOUTS,
  RATE_LIMITS,
  CACHE,
  AUTH,
  AI,
  BATCH,
  RUN,
  RETENTION,
  THRESHOLDS,
  ANALYTICS,
  UI,
  PLATFORM_COLORS,
  EMAIL_COLORS,
  BRANDING,
  DAILY_COST_BUDGETS,
  TOTP,
};
