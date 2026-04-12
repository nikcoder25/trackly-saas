/**
 * Plan limits and enforcement
 */
const { pool } = require('../config/db');

// Per-query prompt model (like Peec, Knowatoa) — fully automated daily tracking
// 1 tracked prompt = 1 query monitored daily across all platforms in the plan
// No manual "Run Queries" button — all runs are scheduled via cron
// Unlimited brands on all plans — prompts/month is the only usage gate
const PLAN_LIMITS = {
    free:       { brands: 9999, prompts: 5,     queries: 9999,  competitors: 0,    platforms: 2,  apiAccess: false, prioritySupport: false, sentiment: false, scheduledRuns: true, minScheduleHours: 24 },
    starter:    { brands: 9999, prompts: 30,    queries: 9999,  competitors: 3,    platforms: 2,  apiAccess: false, prioritySupport: false, sentiment: true,  scheduledRuns: true, minScheduleHours: 24 },
    pro:        { brands: 9999, prompts: 150,   queries: 9999,  competitors: 10,   platforms: 6,  apiAccess: false, prioritySupport: false, sentiment: true,  scheduledRuns: true, minScheduleHours: 24 },
    agency:     { brands: 9999, prompts: 500,   queries: 9999,  competitors: 30,   platforms: 6,  apiAccess: false, prioritySupport: true,  sentiment: true,  scheduledRuns: true, minScheduleHours: 24 },
    enterprise: { brands: 9999, prompts: 5000,  queries: 9999,  competitors: 100,  platforms: 6,  apiAccess: true,  prioritySupport: true,  sentiment: true,  scheduledRuns: true, minScheduleHours: 24 },
    owner:      { brands: 9999, prompts: 99999, queries: 9999,  competitors: 9999, platforms: 6,  apiAccess: true,  prioritySupport: true,  sentiment: true,  scheduledRuns: true, minScheduleHours: 1 }
};

function getPlanLimits(plan) {
    return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

async function getUserPlan(userId) {
    const result = await pool.query('SELECT plan FROM users WHERE id = $1', [userId]);
    return result.rows[0]?.plan || 'free';
}

module.exports = { PLAN_LIMITS, getPlanLimits, getUserPlan };
