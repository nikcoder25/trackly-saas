/**
 * Centralized constants - mirrors the Express app's config/constants.js
 */

export const AUTH = {
  accessTokenMaxAge: 15 * 60 * 1000, // 15 minutes
  refreshTokenMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  passwordResetExpiry: 3600000, // 1 hour
  emailVerificationExpiry: 24 * 60 * 60 * 1000, // 24 hours
  bcryptRounds: 12,
};

export const BILLING_PORTAL_URL = 'https://customer.dodopayments.com/';

export const TOTP_CONFIG = {
  period: 30,
  digits: 6,
};

// PLAN_LIMITS values are kept in lockstep with PLAN_CREDITS in plan-config.ts
// (see PRICING_V3 spec, 2026-04-27). The fields below are the older parallel
// config that the API/brand validation paths still read; values in this map
// MUST match the equivalent field in PLAN_CREDITS or the dashboard's Plan
// Comparison table will drift from what the backend actually enforces.
//   trackedPromptsPerAccount ↔ PLAN_CREDITS[plan].trackedPromptsPerAccount
//   queries (deprecated)     ↔ same value (kept readable for one cycle)
//   platforms                ↔ PLAN_CREDITS[plan].maxPlatforms
//   brands                   ↔ PLAN_CREDITS[plan].brandsCap
//   minScheduleHours         ↔ AUTO_RUN_HOURS[PLAN_CREDITS[plan].autoRunFrequency]
export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free:       { brands: 1,    runsPerMonth: 4,   trackedPromptsPerAccount: 5,    queries: 5,    competitors: 0,   platforms: 2, prioritySupport: false, sentiment: false, scheduledRuns: true,  minScheduleHours: 168, geoAudits: 3 },
  trial:      { brands: 9999, runsPerMonth: 10,  trackedPromptsPerAccount: 30,   queries: 30,   competitors: 5,   platforms: 5, prioritySupport: false, sentiment: true,  scheduledRuns: true,  minScheduleHours: 24,  geoAudits: 20 },
  starter:    { brands: 3,    runsPerMonth: 15,  trackedPromptsPerAccount: 15,   queries: 15,   competitors: 3,   platforms: 2, prioritySupport: false, sentiment: false, scheduledRuns: true,  minScheduleHours: 48,  geoAudits: 20 },
  pro:        { brands: 9999, runsPerMonth: 30,  trackedPromptsPerAccount: 25,   queries: 25,   competitors: 8,   platforms: 3, prioritySupport: false, sentiment: true,  scheduledRuns: true,  minScheduleHours: 24,  geoAudits: 75 },
  agency:     { brands: 9999, runsPerMonth: 150, trackedPromptsPerAccount: 100,  queries: 100,  competitors: 20,  platforms: 5, prioritySupport: true,  sentiment: true,  scheduledRuns: true,  minScheduleHours: 24,  geoAudits: 300 },
  enterprise: { brands: 9999, runsPerMonth: 30,  trackedPromptsPerAccount: 9999, queries: 9999, competitors: 100, platforms: 5, prioritySupport: true,  sentiment: true,  scheduledRuns: true,  minScheduleHours: 24,  geoAudits: 5000 },
  owner:      { brands: 9999, runsPerMonth: 99999, trackedPromptsPerAccount: 99999, queries: 99999, competitors: 9999, platforms: 5, prioritySupport: true,  sentiment: true,  scheduledRuns: true,  minScheduleHours: 24,  geoAudits: 99999 },
};

export interface PlanLimits {
  brands: number;
  runsPerMonth: number;
  /**
   * Account-wide cap on tracked prompts (sum of `brand.queries.length`
   * across every brand the account owns). Authoritative as of v3
   * (2026-04-27).
   */
  trackedPromptsPerAccount: number;
  /**
   * @deprecated Read `trackedPromptsPerAccount` instead. Kept for one
   * deprecation cycle so any caller still using `limits.queries` keeps
   * compiling; holds the same number as `trackedPromptsPerAccount`.
   * Remove once the audit confirms no active reads remain.
   */
  queries: number;
  competitors: number;
  platforms: number;
  prioritySupport: boolean;
  sentiment: boolean;
  scheduledRuns: boolean;
  minScheduleHours: number;
  geoAudits: number;
}

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

// Free trial - 7 days from signup, 30 prompts, all 5 AI platforms.
export const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
// Email signups start with a short provisional trial so a bot can't spin up
// an account and start burning AI spend before the email is proven.
export const TRIAL_INITIAL_UNVERIFIED_MS = 24 * 60 * 60 * 1000;

// Anti-abuse caps for trial accounts. Overridable via env for ops.
// 30 matches PLAN_LIMITS.trial.trackedPromptsPerAccount so a trial user can
// execute one full single-query-batch run across all 5 platforms in a day
// (e.g. 6 queries × 5 platforms = 30 credits). Daily worst-case provider
// spend at this cap is ~$0.012 on economy models.
export const TRIAL_DAILY_PROMPT_CAP_PER_USER = parseInt(
  process.env.TRIAL_DAILY_PROMPT_CAP_PER_USER || '30', 10
);
export const TRIAL_DAILY_GLOBAL_PROMPT_CAP = parseInt(
  process.env.TRIAL_DAILY_GLOBAL_PROMPT_CAP || '5000', 10
);
export const SIGNUP_IP_BLOCK_HOURLY_LIMIT = parseInt(
  process.env.SIGNUP_IP_BLOCK_HOURLY_LIMIT || '5', 10
);

/**
 * Returns 'free' if the user's trial has expired, otherwise the plan as-is.
 * The stored plan in the DB isn't mutated here - it's re-evaluated on every
 * read so the countdown stays accurate until an upgrade or explicit clear.
 */
export function getEffectivePlan(plan: string | undefined | null, trialEndsAt: string | Date | null | undefined): string {
  const p = plan || 'free';
  if (p !== 'trial') return p;
  if (!trialEndsAt) return 'free';
  const end = typeof trialEndsAt === 'string' ? new Date(trialEndsAt) : trialEndsAt;
  if (isNaN(end.getTime())) return 'free';
  return end.getTime() > Date.now() ? 'trial' : 'free';
}

export const API_ENDPOINTS = {
  google: {
    userinfo: 'https://www.googleapis.com/oauth2/v3/userinfo',
    tokeninfo: 'https://oauth2.googleapis.com/tokeninfo',
  },
};

/* ── Marketing pricing plans (single source of truth for UI) ── */
export interface PricingPlan {
  name: string;
  price: string;
  annualPrice: string;
  sub: string;
  /** Hero metric shown prominently on each card; the AI credits/month figure
   *  (the dashboard's Plan Comparison treats this as the primary quota). */
  headline: string;
  features: string[];
  cta: string;
  featured?: boolean;
}

// Mirrors the dashboard's Plan Comparison table (sourced from PLAN_CREDITS in
// plan-config.ts and PLAN_LIMITS above). Keep the numbers here in lockstep
// with that table — the billing UI is the source of truth for what users
// actually get on each plan. v3 spec (2026-04-27). No Enterprise tier on
// the public site.
export const PRICING_PLANS: PricingPlan[] = [
  {
    name: 'Free', price: '$0', annualPrice: '$0',
    sub: 'Try it out', cta: 'Start Free',
    headline: '150 AI credits/month',
    features: [
      '1 brand',
      '5 tracked prompts',
      '2 AI platforms (Gemini & Grok)',
      'Weekly auto-runs',
      '3 GEO audits/month',
    ],
  },
  {
    name: 'Starter', price: '$9', annualPrice: '$7',
    sub: 'Perfect for getting started', cta: 'Get Started',
    headline: '750 AI credits/month',
    features: [
      '3 brands',
      '15 tracked prompts',
      '2 AI platforms (ChatGPT & Claude)',
      'Competitor tracking (3)',
      'Auto-runs every 2 days',
      '20 GEO audits/month',
    ],
  },
  {
    name: 'Pro', price: '$29', annualPrice: '$23',
    sub: 'For growing businesses', cta: 'Start Pro', featured: true,
    headline: '2,500 AI credits/month',
    features: [
      'Unlimited brands',
      '25 tracked prompts',
      '3 AI platforms',
      'Competitor tracking (8)',
      'Daily auto-runs',
      'Sentiment analysis',
      '75 GEO audits/month',
    ],
  },
  {
    name: 'Agency', price: '$89', annualPrice: '$71',
    sub: 'For agencies & teams', cta: 'Start Agency',
    headline: '8,000 AI credits/month',
    features: [
      'Unlimited brands',
      '100 tracked prompts',
      '5 AI platforms (all)',
      'Competitor tracking (20)',
      'Premium AI models',
      'Daily auto-runs',
      'Sentiment analysis',
      'Priority support',
      'API access',
      '300 GEO audits/month',
    ],
  },
];

/* ── Shared comparison table data (homepage + pricing page) ── */
export const PRICING_COMPARISON = {
  headers: ['Feature', 'Livesov', 'Ahrefs', 'Semrush'],
  rows: [
    ['AI Brand Tracking', '\u2713 (6 platforms)', '\u2717', '\u2717'],
    ['Starting Price', '$0/mo', '$99/mo', '$129/mo'],
    ['AI Response Proof', '\u2713', '\u2717', '\u2717'],
    ['Share of Voice', '\u2713 Automatic', 'Limited', 'Limited'],
    ['Sentiment Analysis', '\u2713 Built-in', '\u2717', '\u2717'],
    ['Competitor Tracking', '\u2713 Up to 20+', '\u2717', '\u2717'],
    ['AI Response Monitoring', '\u2713 Automatic', '\u2717', '\u2717'],
    ['GEO URL Audits', '\u2713 Up to 300/mo', '\u2717', '\u2717'],
  ],
};

export const PLATFORM_COLORS: Record<string, string> = {
  ChatGPT: '#19c37d',
  Perplexity: '#20b8cd',
  Claude: '#d97706',
  Gemini: '#4285f4',
  Grok: '#1d9bf0',
};

// Plan-specific default platforms - mirrors backend PLAN_DEFAULT_PLATFORMS
export const PLAN_DEFAULT_PLATFORMS: Record<string, string[]> = {
  starter: ['ChatGPT', 'Claude'],
  free: ['Gemini', 'Grok'],
};

export function getPlanPlatforms(plan: string): string[] {
  return PLAN_DEFAULT_PLATFORMS[plan] || Object.keys(PLATFORM_COLORS);
}

// Common countries for the brand location dropdown. Users can also type a
// custom value via the datalist.
export const COUNTRIES: string[] = [
  'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany',
  'France', 'Spain', 'Italy', 'Netherlands', 'Sweden', 'Norway', 'Denmark',
  'Ireland', 'Belgium', 'Switzerland', 'Austria', 'Portugal', 'Poland',
  'Finland', 'Greece', 'India', 'Pakistan', 'Bangladesh', 'Sri Lanka',
  'Singapore', 'Malaysia', 'Indonesia', 'Philippines', 'Thailand', 'Vietnam',
  'Japan', 'South Korea', 'China', 'Hong Kong', 'Taiwan', 'New Zealand',
  'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain',
  'Israel', 'Turkey', 'Egypt', 'South Africa', 'Nigeria', 'Kenya', 'Ghana',
  'Brazil', 'Mexico', 'Argentina', 'Chile', 'Colombia', 'Peru',
  'Russia', 'Ukraine', 'Czech Republic', 'Hungary', 'Romania', 'Bulgaria',
];
