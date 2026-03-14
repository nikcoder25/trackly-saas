/**
 * Recommendation engine — rule-based recommendations & playbooks
 * Epic 3.2-3.3: Generates actionable recommendations from analytics data
 */
const { pool } = require('../config/db');
const { createLogger } = require('./logger');
const log = createLogger('Recommendations');

// ── Playbook definitions ──────────────────────────────────
const PLAYBOOKS = {
  not_in_top_list: {
    id: 'not_in_top_list',
    title: 'Not Appearing in AI Top Lists',
    description: 'Your brand is not being included in AI-generated recommendation lists.',
    steps: [
      'Audit your website content — ensure clear, structured descriptions of services/products',
      'Add FAQ schema markup covering common customer questions',
      'Build more reviews on authoritative platforms (G2, Trustpilot, Google Reviews)',
      'Create comparison content vs competitors already appearing',
      'Publish expert content demonstrating thought leadership',
      'Ensure brand name is consistently used across all web properties'
    ]
  },
  misaligned_description: {
    id: 'misaligned_description',
    title: 'AI Describes Your Brand Inaccurately',
    description: 'AI platforms are providing outdated or incorrect information about your brand.',
    steps: [
      'Update your website with current, clear descriptions of services and pricing',
      'Claim and update business profiles on all major directories',
      'Create a comprehensive "About" page with structured data',
      'Issue press releases for major changes (new services, pricing updates)',
      'Submit correction requests to AI platforms where possible',
      'Monitor canonical facts regularly and update as your business changes'
    ]
  },
  negative_sentiment_spike: {
    id: 'negative_sentiment_spike',
    title: 'Negative Sentiment in AI Responses',
    description: 'AI platforms are expressing negative sentiment about your brand.',
    steps: [
      'Identify the specific negative statements being generated',
      'Address underlying issues (poor reviews, complaints, outdated info)',
      'Respond professionally to negative reviews on public platforms',
      'Create positive content addressing the concerns raised',
      'Encourage satisfied customers to leave detailed reviews',
      'Monitor sentiment weekly to detect improvement'
    ]
  },
  competitor_domination: {
    id: 'competitor_domination',
    title: 'Competitors Dominating Your Space',
    description: 'Competitors are consistently mentioned while your brand is absent.',
    steps: [
      'Analyze which competitors appear and study their online presence',
      'Identify content gaps — what do competitors have that you lack?',
      'Create better, more comprehensive content on your key topics',
      'Build authority through backlinks from industry publications',
      'Target the same review platforms where competitors have presence',
      'Consider paid PR to increase brand awareness and citations'
    ]
  },
  low_citation_authority: {
    id: 'low_citation_authority',
    title: 'Low Citation Authority Score',
    description: 'Your brand is mentioned but citations come from low-authority sources.',
    steps: [
      'Get featured on high-authority review sites in your industry',
      'Publish guest articles on authoritative industry blogs',
      'Build relationships with journalists and analysts',
      'Create original research or reports that others cite',
      'Ensure your website has proper technical SEO (schema, speed, mobile)'
    ]
  },
  visibility_declining: {
    id: 'visibility_declining',
    title: 'Visibility Is Declining Over Time',
    description: 'Your share of voice has been decreasing consistently.',
    steps: [
      'Review recent website changes that may have impacted visibility',
      'Check if competitors have launched new content or campaigns',
      'Update and expand your content to cover emerging topics',
      'Refresh outdated content with current information',
      'Increase publishing frequency on key topics',
      'Review and improve your backlink profile'
    ]
  }
};

/**
 * Run recommendation rules for a brand based on its analytics data.
 * @param {string} brandId
 * @param {object} analytics - { mentionRate, avgRank, sentiment, competitors, etc. }
 * @returns {Array<object>} Generated recommendations
 */
async function generateRecommendations(brandId, analytics) {
  const recommendations = [];

  try {
    // Get existing open recommendations to avoid duplicates
    const existing = await pool.query(
      "SELECT type, prompt FROM recommendations WHERE brand_id = $1 AND status = 'open'",
      [brandId]
    );
    const existingTypes = new Set(existing.rows.map(r => `${r.type}:${r.prompt || ''}`));

    // Rule 1: Low visibility — brand mentioned in less than 20% of runs
    if (analytics.overallMentionRate !== undefined && analytics.overallMentionRate < 0.2) {
      const key = 'low_visibility:';
      if (!existingTypes.has(key)) {
        recommendations.push({
          type: 'low_visibility',
          severity: analytics.overallMentionRate < 0.05 ? 'critical' : 'high',
          title: `Low AI visibility: ${(analytics.overallMentionRate * 100).toFixed(1)}% mention rate`,
          description: 'Your brand appears in fewer than 20% of AI responses. This means most potential customers asking AI for recommendations won\'t see your brand.',
          playbook_id: 'not_in_top_list',
          payload: { mentionRate: analytics.overallMentionRate }
        });
      }
    }

    // Rule 2: Competitor domination — competitors appear much more often
    if (analytics.topCompetitors && analytics.topCompetitors.length > 0) {
      for (const comp of analytics.topCompetitors) {
        if (comp.mentionRate > (analytics.overallMentionRate || 0) * 2 && comp.mentionRate > 0.3) {
          const key = `competitor_domination:${comp.name}`;
          if (!existingTypes.has(key)) {
            recommendations.push({
              type: 'competitor_domination',
              severity: 'high',
              title: `Competitor "${comp.name}" dominates with ${(comp.mentionRate * 100).toFixed(0)}% visibility`,
              description: `"${comp.name}" appears in ${(comp.mentionRate * 100).toFixed(0)}% of AI responses while your brand appears in ${(analytics.overallMentionRate * 100).toFixed(0)}%.`,
              playbook_id: 'competitor_domination',
              payload: { competitor: comp.name, competitorRate: comp.mentionRate, ownRate: analytics.overallMentionRate }
            });
            break; // Only create one per cycle
          }
        }
      }
    }

    // Rule 3: Negative sentiment spike
    if (analytics.sentimentDistribution) {
      const total = (analytics.sentimentDistribution.positive || 0) +
                    (analytics.sentimentDistribution.neutral || 0) +
                    (analytics.sentimentDistribution.negative || 0);
      if (total > 0) {
        const negRate = (analytics.sentimentDistribution.negative || 0) / total;
        if (negRate > 0.3) {
          const key = 'negative_sentiment:';
          if (!existingTypes.has(key)) {
            recommendations.push({
              type: 'negative_sentiment',
              severity: negRate > 0.5 ? 'critical' : 'high',
              title: `${(negRate * 100).toFixed(0)}% of AI mentions have negative sentiment`,
              description: 'A significant portion of AI responses about your brand contain negative sentiment.',
              playbook_id: 'negative_sentiment_spike',
              payload: { negativeRate: negRate, distribution: analytics.sentimentDistribution }
            });
          }
        }
      }
    }

    // Rule 4: Visibility declining
    if (analytics.trend && analytics.trend.direction === 'declining' && analytics.trend.changePercent < -20) {
      const key = 'visibility_declining:';
      if (!existingTypes.has(key)) {
        recommendations.push({
          type: 'visibility_declining',
          severity: 'high',
          title: `Visibility declined ${Math.abs(analytics.trend.changePercent)}% over the tracking period`,
          description: 'Your share of voice is consistently decreasing. This may indicate competitors gaining ground or changes in AI model training.',
          playbook_id: 'visibility_declining',
          payload: { trend: analytics.trend }
        });
      }
    }

    // Rule 5: Mentioned without citations (missed link opportunities)
    if (analytics.mentionedWithoutCitation > 0 && analytics.overallMentionRate > 0.1) {
      const key = 'missing_citations:';
      if (!existingTypes.has(key)) {
        recommendations.push({
          type: 'missing_citations',
          severity: 'medium',
          title: `${analytics.mentionedWithoutCitation} mentions without citations to your site`,
          description: 'AI platforms mention your brand but don\'t link to your website. Adding structured data and improving your web presence can help AI include citations.',
          playbook_id: 'low_citation_authority',
          payload: { count: analytics.mentionedWithoutCitation }
        });
      }
    }

    // Rule 6: Platform-specific weakness — brand visible on some platforms but absent on others
    if (analytics.platformBreakdown) {
      const platforms = Object.entries(analytics.platformBreakdown);
      if (platforms.length >= 2) {
        const avgRate = platforms.reduce((s, [, d]) => s + (d.mentionRate || 0), 0) / platforms.length;
        for (const [platform, data] of platforms) {
          const rate = data.mentionRate || 0;
          if (rate < avgRate * 0.3 && avgRate > 0.1) {
            const key = `platform_gap:${platform}`;
            if (!existingTypes.has(key)) {
              recommendations.push({
                type: 'platform_gap',
                prompt: platform,
                severity: 'medium',
                title: `Low visibility on ${platform} (${(rate * 100).toFixed(0)}% vs ${(avgRate * 100).toFixed(0)}% average)`,
                description: `Your brand performs significantly worse on ${platform} compared to other platforms. This may indicate platform-specific content gaps or different training data.`,
                playbook_id: 'not_in_top_list',
                payload: { platform, rate, avgRate }
              });
              break; // One platform gap per cycle
            }
          }
        }
      }
    }

    // Rule 7: Query-level blind spots — specific queries where brand never appears
    if (analytics.queryBreakdown) {
      const zeroQueries = Object.entries(analytics.queryBreakdown)
        .filter(([, d]) => d.runs >= 3 && d.mentions === 0)
        .map(([q]) => q);
      if (zeroQueries.length > 0 && analytics.overallMentionRate > 0.1) {
        const key = `query_blind_spot:${zeroQueries[0]}`;
        if (!existingTypes.has(key)) {
          recommendations.push({
            type: 'query_blind_spot',
            prompt: zeroQueries[0],
            severity: 'medium',
            title: `Never mentioned for "${zeroQueries[0]}"${zeroQueries.length > 1 ? ` (+${zeroQueries.length - 1} more)` : ''}`,
            description: `Your brand has never appeared in AI responses for ${zeroQueries.length} tracked ${zeroQueries.length === 1 ? 'query' : 'queries'} despite multiple runs. Create targeted content for these topics.`,
            playbook_id: 'not_in_top_list',
            payload: { queries: zeroQueries.slice(0, 5), count: zeroQueries.length }
          });
        }
      }
    }

    // Rule 8: Poor ranking position — mentioned but always ranked low
    if (analytics.avgRank && analytics.avgRank > 5 && analytics.overallMentionRate > 0.2) {
      const key = 'low_rank:';
      if (!existingTypes.has(key)) {
        recommendations.push({
          type: 'low_rank',
          severity: 'medium',
          title: `Average list position is #${analytics.avgRank.toFixed(1)} — aim for top 3`,
          description: 'Your brand appears in AI responses but is typically ranked low in recommendation lists. Top-3 positions get significantly more user attention.',
          playbook_id: 'low_citation_authority',
          payload: { avgRank: analytics.avgRank }
        });
      }
    }

    // Persist new recommendations
    const { uid } = require('./helpers');
    for (const rec of recommendations) {
      try {
        await pool.query(
          `INSERT INTO recommendations (id, brand_id, prompt, type, severity, title, description, playbook_id, payload, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open')`,
          [uid(), brandId, rec.prompt || null, rec.type, rec.severity, rec.title, rec.description, rec.playbook_id || null, JSON.stringify(rec.payload || {})]
        );
      } catch(e) {
        log.error('Failed to persist recommendation', { error: e.message, type: rec.type });
      }
    }

    return recommendations;
  } catch(e) {
    log.error('Recommendation generation failed', { error: e.message, brandId });
    return [];
  }
}

/**
 * Get playbook by ID
 */
function getPlaybook(playbookId) {
  return PLAYBOOKS[playbookId] || null;
}

/**
 * Get all playbooks
 */
function getAllPlaybooks() {
  return PLAYBOOKS;
}

module.exports = { generateRecommendations, getPlaybook, getAllPlaybooks, PLAYBOOKS };
