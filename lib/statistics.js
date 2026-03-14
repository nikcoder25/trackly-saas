/**
 * Statistics helper — confidence intervals and metric calculations
 * Epic 1.2: Confidence intervals for mention rates and rank metrics
 */

/**
 * Wilson score interval for binomial proportion (mention rate).
 * More accurate than normal approximation for small sample sizes.
 * @param {number} successes - Number of mentions
 * @param {number} total - Total runs
 * @param {number} confidence - Confidence level (default 0.95)
 * @returns {{ rate: number, low: number, high: number }}
 */
function wilsonInterval(successes, total, confidence = 0.95) {
  if (total === 0) return { rate: 0, low: 0, high: 0 };

  const p = successes / total;

  // Z-scores for common confidence levels
  const zMap = { 0.90: 1.645, 0.95: 1.96, 0.99: 2.576 };
  const z = zMap[confidence] || 1.96;
  const z2 = z * z;

  const denominator = 1 + z2 / total;
  const center = p + z2 / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);

  const low = Math.max(0, (center - spread) / denominator);
  const high = Math.min(1, (center + spread) / denominator);

  return {
    rate: Math.round(p * 10000) / 10000,
    low: Math.round(low * 10000) / 10000,
    high: Math.round(high * 10000) / 10000
  };
}

/**
 * Calculate mean and standard deviation for a numeric array (e.g., rank positions).
 * @param {number[]} values
 * @returns {{ mean: number, stdDev: number, min: number, max: number, count: number }}
 */
function descriptiveStats(values) {
  if (!values || values.length === 0) {
    return { mean: 0, stdDev: 0, min: 0, max: 0, count: 0 };
  }

  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (n > 1 ? n - 1 : 1);

  return {
    mean: Math.round(mean * 100) / 100,
    stdDev: Math.round(Math.sqrt(variance) * 100) / 100,
    min: Math.min(...values),
    max: Math.max(...values),
    count: n
  };
}

/**
 * Calculate trend direction and magnitude from a time series.
 * Uses simple linear regression.
 * @param {Array<{date: string, value: number}>} series
 * @returns {{ slope: number, direction: string, changePercent: number }}
 */
function trendAnalysis(series) {
  if (!series || series.length < 2) {
    return { slope: 0, direction: 'stable', changePercent: 0 };
  }

  const n = series.length;
  const xVals = series.map((_, i) => i);
  const yVals = series.map(s => s.value);

  const xMean = xVals.reduce((s, v) => s + v, 0) / n;
  const yMean = yVals.reduce((s, v) => s + v, 0) / n;

  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xVals[i] - xMean) * (yVals[i] - yMean);
    den += (xVals[i] - xMean) * (xVals[i] - xMean);
  }

  const slope = den !== 0 ? num / den : 0;
  const first = yVals[0];
  const last = yVals[n - 1];
  const changePercent = first !== 0 ? Math.round(((last - first) / first) * 100) : 0;

  let direction = 'stable';
  if (slope > 0.5) direction = 'improving';
  else if (slope < -0.5) direction = 'declining';

  return {
    slope: Math.round(slope * 100) / 100,
    direction,
    changePercent
  };
}

/**
 * Detect anomalies/events by comparing current vs baseline metrics.
 * @param {object} current - Current period metrics
 * @param {object} baseline - Baseline period metrics
 * @returns {Array<{type: string, severity: string, message: string, data: object}>}
 */
function detectDiagnosticEvents(current, baseline) {
  const events = [];

  // Visibility drop
  if (baseline.mentionRate > 0 && current.mentionRate < baseline.mentionRate * 0.7) {
    events.push({
      type: 'visibility_drop',
      severity: 'high',
      message: `Visibility dropped from ${(baseline.mentionRate * 100).toFixed(1)}% to ${(current.mentionRate * 100).toFixed(1)}%`,
      data: { from: baseline.mentionRate, to: current.mentionRate }
    });
  }

  // Visibility gain
  if (current.mentionRate > baseline.mentionRate * 1.3 && current.mentionRate - baseline.mentionRate > 0.1) {
    events.push({
      type: 'visibility_gain',
      severity: 'info',
      message: `Visibility improved from ${(baseline.mentionRate * 100).toFixed(1)}% to ${(current.mentionRate * 100).toFixed(1)}%`,
      data: { from: baseline.mentionRate, to: current.mentionRate }
    });
  }

  // Rank change
  if (baseline.avgRank && current.avgRank) {
    const rankDiff = current.avgRank - baseline.avgRank;
    if (rankDiff > 2) {
      events.push({
        type: 'rank_dropped',
        severity: 'medium',
        message: `Average rank dropped from #${baseline.avgRank.toFixed(1)} to #${current.avgRank.toFixed(1)}`,
        data: { from: baseline.avgRank, to: current.avgRank }
      });
    } else if (rankDiff < -2) {
      events.push({
        type: 'rank_improved',
        severity: 'info',
        message: `Average rank improved from #${baseline.avgRank.toFixed(1)} to #${current.avgRank.toFixed(1)}`,
        data: { from: baseline.avgRank, to: current.avgRank }
      });
    }
  }

  // Sentiment shift
  if (baseline.sentimentScore !== undefined && current.sentimentScore !== undefined) {
    const sentDiff = current.sentimentScore - baseline.sentimentScore;
    if (sentDiff < -0.5) {
      events.push({
        type: 'sentiment_negative',
        severity: 'high',
        message: 'Sentiment shifted toward negative',
        data: { from: baseline.sentimentScore, to: current.sentimentScore }
      });
    }
  }

  // New competitors
  if (current.newCompetitors && current.newCompetitors.length > 0) {
    for (const comp of current.newCompetitors) {
      events.push({
        type: 'new_competitor',
        severity: 'medium',
        message: `New competitor "${comp}" started appearing`,
        data: { competitor: comp }
      });
    }
  }

  return events;
}

module.exports = { wilsonInterval, descriptiveStats, trendAnalysis, detectDiagnosticEvents };
