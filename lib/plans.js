/**
 * Plan limits and enforcement
 */
const { pool } = require('../config/db');

// Free plan uses 2 cheapest platforms (Gemini $0.10, DeepSeek $0.27 per 1M input tokens)
// Pro and above get all 8 platforms
const PLAN_LIMITS = {
  free:   { brands: 1,    queries: 10,   runsPerDay: 2,     competitors: 0,    scheduledRuns: false, platforms: 2  },
  pro:    { brands: 5,    queries: 25,   runsPerDay: 10,    competitors: 5,    scheduledRuns: true,  platforms: 8  },
  agency: { brands: 20,   queries: 50,   runsPerDay: 50,    competitors: 20,   scheduledRuns: true,  platforms: 8  },
  owner:  { brands: 9999, queries: 9999, runsPerDay: 99999, competitors: 9999, scheduledRuns: true,  platforms: 8  }
};

function getPlanLimits(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

async function getUserPlan(userId) {
  const result = await pool.query('SELECT plan FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.plan || 'free';
}

module.exports = { PLAN_LIMITS, getPlanLimits, getUserPlan };
