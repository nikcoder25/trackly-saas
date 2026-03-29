/**
 * Centralized constants — mirrors the Express app's config/constants.js
 */

export const AUTH = {
  accessTokenMaxAge: 15 * 60 * 1000, // 15 minutes
  refreshTokenMaxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  passwordResetExpiry: 3600000, // 1 hour
  bcryptRounds: 12,
};

export const TOTP_CONFIG = {
  period: 30,
  digits: 6,
};

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: { brands: 1, prompts: 5, queries: 5, competitors: 0, platforms: 2, apiAccess: false, prioritySupport: false, sentiment: false, scheduledRuns: false, minScheduleHours: 999 },
  starter: { brands: 1, prompts: 30, queries: 30, competitors: 0, platforms: 2, apiAccess: false, prioritySupport: false, sentiment: false, scheduledRuns: true, minScheduleHours: 168 },
  pro: { brands: 5, prompts: 250, queries: 250, competitors: 5, platforms: 5, apiAccess: false, prioritySupport: false, sentiment: true, scheduledRuns: true, minScheduleHours: 24 },
  agency: { brands: 20, prompts: 1000, queries: 1000, competitors: 20, platforms: 5, apiAccess: false, prioritySupport: false, sentiment: true, scheduledRuns: true, minScheduleHours: 12 },
  enterprise: { brands: 100, prompts: 10000, queries: 10000, competitors: 100, platforms: 5, apiAccess: true, prioritySupport: true, sentiment: true, scheduledRuns: true, minScheduleHours: 6 },
  owner: { brands: 9999, prompts: 99999, queries: 99999, competitors: 9999, platforms: 5, apiAccess: true, prioritySupport: true, sentiment: true, scheduledRuns: true, minScheduleHours: 1 },
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

export const PLATFORM_COLORS: Record<string, string> = {
  ChatGPT: '#19c37d',
  Perplexity: '#20b8cd',
  Claude: '#d97706',
  Gemini: '#4285f4',
  Grok: '#1d9bf0',
};
