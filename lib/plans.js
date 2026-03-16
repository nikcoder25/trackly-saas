/**
 * Plan limits and enforcement
 */
const { pool } = require('../config/db');

// Prompt-based model (like Otterly, Peec, Knowatoa) — total prompts across all brands
// Each prompt is tracked daily across all enabled AI platforms automatically
// Free plan uses 2 cheapest platforms (Gemini $0.10, DeepSeek $0.27 per 1M input tokens)
const PLAN_LIMITS = {
  free:       { brands: 1,    prompts: 3,     competitors: 0,    scheduledRuns: false, platforms: 2,  apiAccess: false, prioritySupport: false, sentiment: false },
  pro:        { brands: 5,    prompts: 25,    competitors: 5,    scheduledRuns: true,  platforms: 8,  apiAccess: false, prioritySupport: false, sentiment: true  },
  agency:     { brands: 20,   prompts: 100,   competitors: 20,   scheduledRuns: true,  platforms: 8,  apiAccess: false, prioritySupport: false, sentiment: true  },
  enterprise: { brands: 100,  prompts: 500,   competitors: 100,  scheduledRuns: true,  platforms: 8,  apiAccess: true,  prioritySupport: true,  sentiment: true  },
  owner:      { brands: 9999, prompts: 99999, competitors: 9999, scheduledRuns: true,  platforms: 8,  apiAccess: true,  prioritySupport: true,  sentiment: true  }
};

function getPlanLimits(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

async function getUserPlan(userId) {
  const result = await pool.query('SELECT plan FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.plan || 'free';
}

module.exports = { PLAN_LIMITS, getPlanLimits, getUserPlan };
