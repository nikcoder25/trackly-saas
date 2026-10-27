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
  // Free plans do NOT auto-run: the cron scheduler's plan filter (see
  // src/app/api/cron/route.ts - `u.plan IN ('starter','pro',...)`) excludes
  // 'free', so scheduledRuns must be false here to match reality. It was
  // `true` with minScheduleHours 168, which made the pricing/UsageSection UI
  // advertise a weekly auto-run that never fired. Manual runs still work.
  free:       { brands: 1,    runsPerMonth: 4,   trackedPromptsPerAccount: 5,    queries: 5,    competitors: 0,   platforms: 2, prioritySupport: false, sentiment: false, scheduledRuns: false, minScheduleHours: 168, geoAudits: 3 },
  trial:      { brands: 9999, runsPerMonth: 40,  trackedPromptsPerAccount: 30,   queries: 30,   competitors: 5,   platforms: 5, prioritySupport: false, sentiment: true,  scheduledRuns: true,  minScheduleHours: 24,  geoAudits: 20 },
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
// 60 lets a trial user complete one full "Run all engines" scan in a day even
// for a larger brand (up to 12 tracked prompts × 5 platforms = 60 calls); at
// 30 an 11-prompt × 5-platform scan (55 calls) was permanently blocked. Kept
// in step with PLAN_CREDITS.trial.manualDailyCap (also 60). Daily worst-case
// provider spend at this cap is ~$0.03 on economy models; the monthly credit
// cap (500), the 30-day run cap (40) and the global daily cap still bound it.
export const TRIAL_DAILY_PROMPT_CAP_PER_USER = parseInt(
  process.env.TRIAL_DAILY_PROMPT_CAP_PER_USER || '60', 10
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
  /** Google rank tracking credits a month (1 credit = 1 keyword check to the
   *  top 30, top 100 = 2 credits). Mirrors RANK_CREDITS_BY_PLAN in
   *  src/lib/rank-tracking/credits.ts. 0 = no rank tracking. */
  rankCredits: number;
  /** Google rank tracking bullets, shown above the AI visibility features. */
  rankFeatures: string[];
  cta: string;
  featured?: boolean;
}

// Mirrors the dashboard's Plan Comparison table (sourced from PLAN_CREDITS in
// plan-config.ts and PLAN_LIMITS above). Keep the numbers here in lockstep
// with that table - the billing UI is the source of truth for what users
// actually get on each plan. v3 spec (2026-04-27). No Enterprise tier on
// the public site.
// Agency's 8,000 monthly credits (PLAN_CREDITS.agency.monthlyCredits in
// plan-config.ts) cover a daily scan of only floor(8000 / 30 / 5) prompts on
// all five engines, well under the 100-prompt cap. Same maths as the /pricing
// credit table (dailyPromptCapacity); tests/marketing-claim-accuracy.test.ts
// checks it against PLAN_CREDITS so the card cannot drift.
const AGENCY_MONTHLY_CREDITS = 8000;
export const AGENCY_DAILY_FULL_SCAN_PROMPTS = Math.floor(
  AGENCY_MONTHLY_CREDITS / 30 / PLAN_LIMITS.agency.platforms,
);

export const PRICING_PLANS: PricingPlan[] = [
  {
    name: 'Free', price: '$0', annualPrice: '$0',
    sub: 'Try it out', cta: 'Start Free',
    headline: '150 AI credits/month',
    rankCredits: 0,
    rankFeatures: [],
    features: [
      '1 brand',
      '5 tracked prompts',
      '2 AI platforms (you pick from 5)',
      'Manual runs only',
      '3 GEO audits/month',
    ],
  },
  {
    name: 'Starter', price: '$19', annualPrice: '$15',
    sub: 'Perfect for getting started', cta: 'Get Started',
    headline: '750 AI credits/month',
    rankCredits: 1000,
    rankFeatures: [
      '1,000 credits (250 keywords weekly)',
      'City-level tracking',
    ],
    features: [
      '3 brands',
      '15 tracked prompts (shared across all brands)',
      '2 AI platforms (you pick from 5)',
      'Competitor tracking (3)',
      'Auto-runs every 2 days',
      '20 GEO audits/month',
    ],
  },
  {
    name: 'Pro', price: '$49', annualPrice: '$39',
    sub: 'For growing businesses', cta: 'Start Pro', featured: true,
    headline: '2,500 AI credits/month',
    rankCredits: 4000,
    rankFeatures: [
      '4,000 credits (1,000 keywords weekly)',
      'City-level tracking, top 100',
      'Client share links',
    ],
    features: [
      'Unlimited brands',
      '25 tracked prompts (shared across all brands)',
      '3 AI platforms (you pick from 5)',
      'Competitor tracking (8)',
      'Daily auto-runs',
      'Sentiment analysis',
      '75 GEO audits/month',
    ],
  },
  {
    name: 'Agency', price: '$129', annualPrice: '$103',
    sub: 'For agencies & teams', cta: 'Start Agency',
    headline: '8,000 AI credits/month',
    rankCredits: 20000,
    rankFeatures: [
      '20,000 credits (5,000 keywords weekly)',
      'Daily checks available',
      'White-label PDF reports',
      'Rank drop alerts',
    ],
    features: [
      'Unlimited brands',
      '100 tracked prompts (shared across all brands)',
      '5 AI platforms (all)',
      'Competitor tracking (20)',
      'Premium AI models',
      `Daily auto-runs (about ${AGENCY_DAILY_FULL_SCAN_PROMPTS} prompts on all 5 engines)`,
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
    // Ahrefs (Brand Radar) and Semrush (AI Toolkit) do track AI answers, as
    // paid add-ons. Keep this hedged: their engine lists change often.
    ['AI Brand Tracking', '\u2713 (up to 5 platforms)', 'Paid add-on', 'Paid add-on'],
    ['Starting Price', '$19/mo', '$99/mo', '$129/mo'],
    ['AI Response Proof', '\u2713', 'With add-on', 'With add-on'],
    ['Share of Voice', '\u2713 Automatic', 'With add-on', 'With add-on'],
    ['Sentiment Analysis', '\u2713 Built-in', '\u2717', 'Partial'],
    ['Competitor Tracking', '\u2713 Up to 20', 'With add-on', 'With add-on'],
    ['AI Response Monitoring', '\u2713 Automatic', 'Paid add-on', 'Paid add-on'],
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
