/**
 * Plan limits and enforcement
 */
const { pool } = require('../config/db');

// Monthly prompt-based model (like Otterly, Peec, Knowatoa)
// All queries run automatically on schedule — no manual "Run Queries" button
// Starter plan uses 2 cheapest platforms (Gemini $0.10, DeepSeek $0.27 per 1M input tokens)
const PLAN_LIMITS = {
    free:       { brands: 1,    prompts: 5,     queries: 5,     competitors: 0,    platforms: 2,  apiAccess: false, prioritySupport: false, sentiment: false, scheduledRuns: false, minScheduleHours: 999 },
    starter:    { brands: 1,    prompts: 30,    queries: 30,    competitors: 0,    platforms: 2,  apiAccess: false, prioritySupport: false, sentiment: false, scheduledRuns: true, minScheduleHours: 168 },
    pro:        { brands: 5,    prompts: 250,   queries: 250,   competitors: 5,    platforms: 7,  apiAccess: false, prioritySupport: false, sentiment: true,  scheduledRuns: true, minScheduleHours: 24 },
    agency:     { brands: 20,   prompts: 1000,  queries: 1000,  competitors: 20,   platforms: 7,  apiAccess: false, prioritySupport: false, sentiment: true,  scheduledRuns: true, minScheduleHours: 12 },
    enterprise: { brands: 100,  prompts: 10000, queries: 10000, competitors: 100,  platforms: 7,  apiAccess: true,  prioritySupport: true,  sentiment: true,  scheduledRuns: true, minScheduleHours: 6 },
    owner:      { brands: 9999, prompts: 99999, queries: 99999, competitors: 9999, platforms: 7,  apiAccess: true,  prioritySupport: true,  sentiment: true,  scheduledRuns: true, minScheduleHours: 1 }
};

function getPlanLimits(plan) {
    return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

async function getUserPlan(userId) {
    const result = await pool.query('SELECT plan FROM users WHERE id = $1', [userId]);
    return result.rows[0]?.plan || 'free';
}

module.exports = { PLAN_LIMITS, getPlanLimits, getUserPlan };
