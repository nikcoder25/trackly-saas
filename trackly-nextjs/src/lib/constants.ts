/**
 * Centralized constants — mirrors the Express app's config/constants.js
 */

export const AUTH = {
  accessTokenMaxAge: 15 * 60 * 1000, // 15 minutes
  refreshTokenMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  passwordResetExpiry: 3600000, // 1 hour
  bcryptRounds: 12,
};

export const BILLING_PORTAL_URL = 'https://customer.dodopayments.com/';

export const TOTP_CONFIG = {
  period: 30,
  digits: 6,
};

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: { brands: 1, prompts: 5, queries: 5, competitors: 0, platforms: 2, apiAccess: false, prioritySupport: false, sentiment: false, scheduledRuns: false, minScheduleHours: 999, geoAudits: 3 },
  starter: { brands: 1, prompts: 30, queries: 30, competitors: 2, platforms: 2, apiAccess: false, prioritySupport: false, sentiment: true, scheduledRuns: true, minScheduleHours: 72, geoAudits: 25 },
  pro: { brands: 5, prompts: 250, queries: 250, competitors: 5, platforms: 5, apiAccess: false, prioritySupport: false, sentiment: true, scheduledRuns: true, minScheduleHours: 24, geoAudits: 100 },
  agency: { brands: 20, prompts: 1000, queries: 1000, competitors: 20, platforms: 5, apiAccess: false, prioritySupport: true, sentiment: true, scheduledRuns: true, minScheduleHours: 12, geoAudits: 500 },
  enterprise: { brands: 100, prompts: 10000, queries: 10000, competitors: 100, platforms: 5, apiAccess: true, prioritySupport: true, sentiment: true, scheduledRuns: true, minScheduleHours: 6, geoAudits: 5000 },
  owner: { brands: 9999, prompts: 99999, queries: 99999, competitors: 9999, platforms: 5, apiAccess: true, prioritySupport: true, sentiment: true, scheduledRuns: true, minScheduleHours: 1, geoAudits: 99999 },
};

export interface PlanLimits {
  brands: number;
  prompts: number;
  queries: number;
  competitors: number;
  platforms: number;
  apiAccess: boolean;
  prioritySupport: boolean;
  sentiment: boolean;
  scheduledRuns: boolean;
  minScheduleHours: number;
  geoAudits: number;
}

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
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
  annualPrice?: string;
  sub: string;
  features: string[];
  cta: string;
  featured?: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  { name: 'Free', price: '$0', annualPrice: '$0', sub: 'Try it out', cta: 'Start Free', features: ['1 brand', '5 prompts/month', '2 AI platforms', 'Manual runs only', 'Basic dashboard', 'No competitor tracking', '3 GEO audits/month'] },
  { name: 'Starter', price: '$9', annualPrice: '$7', sub: 'Perfect for getting started', cta: 'Get Started', features: ['1 brand', '30 prompts/month', '2 AI platforms', 'Every 3 days schedule', 'SOV tracking', 'Competitor tracking (2)', 'Sentiment analysis', '25 GEO audits/month'] },
  { name: 'Pro', price: '$29', annualPrice: '$23', sub: 'For growing businesses', cta: 'Start Pro', featured: true, features: ['Everything in Starter, plus:', '5 brands', '250 prompts/month', '5 AI platforms', 'Daily schedule', 'SOV tracking', 'Sentiment analysis', 'Competitor tracking (5)', 'Evidence & proof export', 'Custom queries', 'Email alerts', '100 GEO audits/month'] },
  { name: 'Agency', price: '$89', annualPrice: '$71', sub: 'For agencies & teams', cta: 'Start Agency', features: ['Everything in Pro, plus:', '20 brands', '1,000 prompts/month', '12-hour schedule', 'Competitor tracking (20)', 'Team collaboration', 'Priority support', '500 GEO audits/month'] },
  { name: 'Enterprise', price: 'Custom', annualPrice: 'Custom', sub: 'For large organizations', cta: 'Contact Us', features: ['Everything in Agency, plus:', '100 brands', '10,000 prompts/month', '6-hour schedule', 'Competitor tracking (100)', 'API access', 'Dedicated support', '5,000 GEO audits/month', 'Custom integrations'] },
];

export const PLATFORM_COLORS: Record<string, string> = {
  ChatGPT: '#19c37d',
  Perplexity: '#20b8cd',
  Claude: '#d97706',
  Gemini: '#4285f4',
  Grok: '#1d9bf0',
};
