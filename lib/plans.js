/**
 * Plan limits and enforcement
 */
const { pool } = require('../config/db');

// Monthly prompt-based model (like Otterly, Peec, Knowatoa)
// All queries run automatically on schedule — no manual "Run Queries" button
// Starter plan uses 2 cheapest platforms (Gemini $0.10, Grok $0.30 per 1M input tokens)
const PLAN_LIMITS = {
    free:       { brands: 9999, runsPerMonth: 3,     queries: 5,     prompts: 5,     competitors: 0,    platforms: 2,  apiAccess: false, prioritySupport: false, sentiment: false, scheduledRuns: false, minScheduleHours: 999, geoAudits: 3 },
    starter:    { brands: 9999, runsPerMonth: 10,    queries: 30,    prompts: 30,    competitors: 3,    platforms: 2,  apiAccess: false, prioritySupport: false, sentiment: true,  scheduledRuns: true,  minScheduleHours: 72,  geoAudits: 20 },
    pro:        { brands: 9999, runsPerMonth: 30,    queries: 100,   prompts: 100,   competitors: 8,    platforms: 6,  apiAccess: false, prioritySupport: true,  sentiment: true,  scheduledRuns: true,  minScheduleHours: 24,  geoAudits: 75 },
    agency:     { brands: 9999, runsPerMonth: 30,    queries: 500,   prompts: 500,   competitors: 20,   platforms: 6,  apiAccess: false, prioritySupport: true,  sentiment: true,  scheduledRuns: true,  minScheduleHours: 12,  geoAudits: 300 },
    enterprise: { brands: 100,  runsPerMonth: 30,    queries: 50000, prompts: 50000, competitors: 100,  platforms: 6,  apiAccess: true,  prioritySupport: true,  sentiment: true,  scheduledRuns: true,  minScheduleHours: 6,   geoAudits: 5000 },
    owner:      { brands: 9999, runsPerMonth: 99999, queries: 99999, prompts: 99999, competitors: 9999, platforms: 6,  apiAccess: true,  prioritySupport: true,  sentiment: true,  scheduledRuns: true,  minScheduleHours: 24,  geoAudits: 99999 }
};

function getPlanLimits(plan) {
    return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

async function getUserPlan(userId) {
    const result = await pool.query('SELECT plan FROM users WHERE id = $1', [userId]);
    return result.rows[0]?.plan || 'free';
}

module.exports = { PLAN_LIMITS, getPlanLimits, getUserPlan };
