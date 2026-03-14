/**
 * Alert rules engine — evaluates conditions and triggers actions
 * Epic 6.2: Configurable alerts for visibility changes
 */
const { pool, notify } = require('../config/db');
const { createLogger } = require('./logger');
const log = createLogger('Alerts');

/**
 * Evaluate all alert rules for a brand after a run completes.
 * @param {string} brandId
 * @param {object} runData - { sov, previousSov, platforms, mentions, etc. }
 */
async function evaluateAlerts(brandId, runData) {
  try {
    const rules = await pool.query(
      "SELECT * FROM alert_rules WHERE brand_id = $1 AND enabled = TRUE",
      [brandId]
    );

    for (const rule of rules.rows) {
      const triggered = checkCondition(rule, runData);
      if (triggered) {
        await triggerAlert(rule, runData);
      }
    }
  } catch(e) {
    log.error('Alert evaluation failed', { error: e.message, brandId });
  }
}

/**
 * Check if an alert condition is met.
 */
function checkCondition(rule, runData) {
  const params = rule.condition_params || {};

  switch (rule.condition_type) {
    case 'visibility_drop': {
      const threshold = params.threshold || 10; // percent drop
      const drop = (runData.previousSov || 0) - (runData.sov || 0);
      return drop >= threshold;
    }
    case 'brand_disappeared': {
      // Brand was mentioned before but not in current run
      return runData.previousSov > 0 && runData.sov === 0;
    }
    case 'negative_sentiment': {
      const threshold = params.threshold || 0.3;
      const results = runData.allResults || [];
      const mentioned = results.filter(r => r.mentioned);
      if (mentioned.length === 0) return false;
      const negCount = mentioned.filter(r => r.sentiment === 'negative').length;
      return (negCount / mentioned.length) >= threshold;
    }
    case 'new_competitor': {
      return runData.newCompetitors && runData.newCompetitors.length > 0;
    }
    case 'sov_below': {
      const threshold = params.threshold || 20;
      return (runData.sov || 0) < threshold;
    }
    default:
      return false;
  }
}

/**
 * Trigger an alert action.
 */
async function triggerAlert(rule, runData) {
  try {
    // Don't re-trigger within 24 hours (check BEFORE updating)
    if (rule.last_triggered_at) {
      const lastTriggered = new Date(rule.last_triggered_at).getTime();
      if (Date.now() - lastTriggered < 24 * 60 * 60 * 1000) return;
    }

    // Update last triggered timestamp
    await pool.query(
      "UPDATE alert_rules SET last_triggered_at = NOW() WHERE id = $1",
      [rule.id]
    );

    const message = buildAlertMessage(rule, runData);

    switch (rule.action_type) {
      case 'email':
        // Send email notification (uses existing email system)
        try {
          const { sendAlertEmail, isEmailConfigured } = require('./email');
          if (isEmailConfigured()) {
            const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [rule.user_id]);
            if (userResult.rows.length) {
              await sendAlertEmail(userResult.rows[0].email, rule.name, message);
            }
          }
        } catch(e) {
          log.error('Alert email failed', { error: e.message });
        }
        break;
      case 'in_app':
        await notify(rule.user_id, 'alert', rule.name, message, {
          alertRuleId: rule.id,
          brandId: rule.brand_id,
          conditionType: rule.condition_type
        });
        break;
      case 'webhook':
        // Webhook alerts handled by existing webhook system
        break;
      default:
        // Default to in-app notification
        await notify(rule.user_id, 'alert', rule.name, message, {
          alertRuleId: rule.id,
          brandId: rule.brand_id
        });
    }

    log.info('Alert triggered', { ruleId: rule.id, ruleName: rule.name, conditionType: rule.condition_type });
  } catch(e) {
    log.error('Alert trigger failed', { error: e.message, ruleId: rule.id });
  }
}

function buildAlertMessage(rule, runData) {
  switch (rule.condition_type) {
    case 'visibility_drop':
      return `Visibility dropped from ${runData.previousSov || 0}% to ${runData.sov || 0}%`;
    case 'brand_disappeared':
      return `Brand is no longer appearing in AI responses (SOV was ${runData.previousSov}%)`;
    case 'negative_sentiment':
      return `Negative sentiment detected in AI responses about your brand`;
    case 'new_competitor':
      return `New competitors detected: ${(runData.newCompetitors || []).join(', ')}`;
    case 'sov_below':
      return `Share of voice is below threshold: ${runData.sov || 0}%`;
    default:
      return `Alert condition "${rule.condition_type}" was triggered`;
  }
}

module.exports = { evaluateAlerts };
