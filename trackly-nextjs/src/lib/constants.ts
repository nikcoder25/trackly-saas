/**
 * Centralized constants — mirrors the Express app's config/constants.js
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

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free:       { brands: 9999, runsPerMonth: 3,   queries: 5,    competitors: 0,   platforms: 2, prioritySupport: false, sentiment: false, scheduledRuns: false, minScheduleHours: 999, geoAudits: 3 },
  trial:      { brands: 9999, runsPerMonth: 10,  queries: 30,   competitors: 5,   platforms: 6, prioritySupport: false, sentiment: true,  scheduledRuns: true,  minScheduleHours: 24,  geoAudits: 20 },
  starter:    { brands: 9999, runsPerMonth: 10,  queries: 30,   competitors: 3,   platforms: 2, prioritySupport: false, sentiment: true,  scheduledRuns: true,  minScheduleHours: 72,  geoAudits: 20 },
  pro:        { brands: 9999, runsPerMonth: 30,  queries: 100,  competitors: 8,   platforms: 6, prioritySupport: true,  sentiment: true,  scheduledRuns: true,  minScheduleHours: 24,  geoAudits: 75 },
  agency:     { brands: 9999, runsPerMonth: 30,  queries: 500,  competitors: 20,  platforms: 6, prioritySupport: true,  sentiment: true,  scheduledRuns: true,  minScheduleHours: 24,  geoAudits: 300 },
  enterprise: { brands: 100, runsPerMonth: 30, queries: 50000, competitors: 100, platforms: 6, prioritySupport: true,  sentiment: true,  scheduledRuns: true,  minScheduleHours: 24,  geoAudits: 5000 },
  owner:      { brands: 9999, runsPerMonth: 99999, queries: 99999, competitors: 9999, platforms: 6, prioritySupport: true,  sentiment: true,  scheduledRuns: true,  minScheduleHours: 24,  geoAudits: 99999 },
};

export interface PlanLimits {
  brands: number;
  runsPerMonth: number;
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

// Free trial — 7 days from signup, 30 prompts, all 6 AI platforms.
export const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
// Email signups start with a short provisional trial so a bot can't spin up
// an account and start burning AI spend before the email is proven.
export const TRIAL_INITIAL_UNVERIFIED_MS = 24 * 60 * 60 * 1000;

// Anti-abuse caps for trial accounts. Overridable via env for ops.
export const TRIAL_DAILY_PROMPT_CAP_PER_USER = parseInt(
  process.env.TRIAL_DAILY_PROMPT_CAP_PER_USER || '10', 10
);
export const TRIAL_DAILY_GLOBAL_PROMPT_CAP = parseInt(
  process.env.TRIAL_DAILY_GLOBAL_PROMPT_CAP || '5000', 10
);
export const SIGNUP_IP_BLOCK_HOURLY_LIMIT = parseInt(
  process.env.SIGNUP_IP_BLOCK_HOURLY_LIMIT || '5', 10
);

/**
 * Returns 'free' if the user's trial has expired, otherwise the plan as-is.
 * The stored plan in the DB isn't mutated here — it's re-evaluated on every
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
  features: string[];
  cta: string;
  featured?: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  { name: 'Free', price: '$0', annualPrice: '$0', sub: 'Try it out', cta: 'Start Free', features: ['Unlimited brands', '5 tracked queries', '2 AI platforms (ChatGPT & Claude)', 'Basic dashboard', '3 GEO audits/month'] },
  { name: 'Starter', price: '$9', annualPrice: '$7', sub: 'Perfect for getting started', cta: 'Get Started', features: ['Unlimited brands', '30 tracked queries', 'ChatGPT & Claude', 'SOV tracking', 'Competitor tracking (3)', 'Sentiment analysis', '20 GEO audits/month'] },
  { name: 'Pro', price: '$29', annualPrice: '$23', sub: 'For growing businesses', cta: 'Start Pro', featured: true, features: ['Everything in Starter, plus:', 'Unlimited brands', '100 tracked queries', '6 AI platforms', 'Competitor tracking (8)', 'Evidence & proof export', 'Email alerts', '75 GEO audits/month'] },
  { name: 'Agency', price: '$89', annualPrice: '$71', sub: 'For agencies & teams', cta: 'Start Agency', features: ['Everything in Pro, plus:', 'Unlimited brands', '500 tracked queries', 'Competitor tracking (20)', 'Team collaboration', 'Priority support', '300 GEO audits/month'] },
  { name: 'Enterprise', price: 'Custom', annualPrice: 'Custom', sub: 'For large organizations', cta: 'Contact Us', features: ['Everything in Agency, plus:', 'Unlimited brands', '50,000 tracked queries', 'Competitor tracking (100)', 'API access', 'Dedicated support', '5,000 GEO audits/month', 'Custom integrations'] },
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
    ['GEO URL Audits', '\u2713 (up to 300/mo)', '\u2717', '\u2717'],
  ],
};

export const PLATFORM_COLORS: Record<string, string> = {
  ChatGPT: '#19c37d',
  Perplexity: '#20b8cd',
  Claude: '#d97706',
  Gemini: '#4285f4',
  Grok: '#1d9bf0',
  'Google AI Overviews': '#34a853',
};

// Plan-specific default platforms — mirrors backend PLAN_DEFAULT_PLATFORMS
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
