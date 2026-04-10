/**
 * DataForSEO API integration — Google AI Overviews detection
 *
 * Uses the SERP API to check whether Google shows an AI Overview for each
 * of the brand's tracked queries, and whether the brand is mentioned in it.
 *
 * Credentials: DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD env vars (Basic Auth).
 */
const https = require('https');
const { createLogger } = require('./logger');
const { DATAFORSEO } = require('../config/constants');

const log = createLogger('DataForSEO');

// ── Credentials ─────────────────────────────────────────────────
function getCredentials() {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return null;
  return Buffer.from(`${login}:${password}`).toString('base64');
}

// ── Low-level API call ──────────────────────────────────────────
function apiRequest(path, body) {
  const auth = getCredentials();
  if (!auth) return Promise.reject(new Error('DataForSEO credentials not configured'));

  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.dataforseo.com',
      path,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: DATAFORSEO.requestTimeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode === 200 && parsed.status_code === 20000) {
            resolve(parsed);
          } else {
            const errMsg = parsed.status_message || `HTTP ${res.statusCode}`;
            reject(new Error(`DataForSEO API error: ${errMsg}`));
          }
        } catch (e) {
          reject(new Error(`DataForSEO response parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('DataForSEO request timeout')); });
    req.write(payload);
    req.end();
  });
}

// ── Check AI Overview for a single keyword ──────────────────────
// Returns: { hasAiOverview, content, brandMentioned, citations, competitorMentions, position }
async function checkAiOverview(keyword, brandName, competitors, options = {}) {
  const { locationCode, languageCode } = options;

  const taskData = {
    keyword,
    location_code: locationCode || DATAFORSEO.defaultLocationCode,
    language_code: languageCode || DATAFORSEO.defaultLanguageCode,
    device: 'desktop',
    os: 'windows',
  };

  const response = await apiRequest('/v3/serp/google/organic/live/advanced', [taskData]);

  const task = response.tasks && response.tasks[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(`DataForSEO task error: ${task?.status_message || 'No task returned'}`);
  }

  const items = task.result?.[0]?.items || [];

  // Find AI Overview item — DataForSEO reports it as type "ai_overview"
  const aiOverviewItem = items.find(item => item.type === 'ai_overview');

  if (!aiOverviewItem) {
    return {
      hasAiOverview: false,
      content: null,
      brandMentioned: false,
      citations: [],
      competitorMentions: [],
      position: null,
      serpFeatures: extractSerpFeatures(items),
    };
  }

  // Extract text content from AI Overview
  const content = extractAiOverviewText(aiOverviewItem);
  const citations = extractAiOverviewCitations(aiOverviewItem);

  // Check if brand is mentioned in the AI Overview
  const brandMentioned = isBrandMentioned(content, citations, brandName);

  // Check competitor mentions
  const competitorMentions = findCompetitorMentions(content, citations, competitors || []);

  return {
    hasAiOverview: true,
    content,
    brandMentioned,
    citations,
    competitorMentions,
    position: aiOverviewItem.rank_group || aiOverviewItem.position || 1,
    serpFeatures: extractSerpFeatures(items),
  };
}

// ── Batch check AI Overviews for multiple keywords ──────────────
async function checkAiOverviewsBatch(keywords, brandName, competitors, options = {}) {
  const auth = getCredentials();
  if (!auth) throw new Error('DataForSEO credentials not configured');

  const { locationCode, languageCode, concurrency } = options;
  const maxConcurrent = concurrency || DATAFORSEO.batchConcurrency;
  const results = new Map();

  // Process in batches to respect rate limits
  for (let i = 0; i < keywords.length; i += maxConcurrent) {
    const batch = keywords.slice(i, i + maxConcurrent);
    const tasks = batch.map(keyword =>
      checkAiOverview(keyword, brandName, competitors, { locationCode, languageCode })
        .then(result => ({ keyword, ...result, error: null }))
        .catch(err => ({
          keyword,
          hasAiOverview: false,
          content: null,
          brandMentioned: false,
          citations: [],
          competitorMentions: [],
          position: null,
          serpFeatures: [],
          error: err.message,
        }))
    );

    const batchResults = await Promise.all(tasks);
    for (const r of batchResults) {
      results.set(r.keyword, r);
    }

    // Rate-limit pause between batches (except for the last batch)
    if (i + maxConcurrent < keywords.length) {
      await new Promise(resolve => setTimeout(resolve, DATAFORSEO.batchDelayMs));
    }
  }

  return results;
}

// ── Helpers ─────────────────────────────────────────────────────

function extractAiOverviewText(item) {
  // AI Overview content can be in several nested structures
  const parts = [];

  if (item.text) parts.push(item.text);

  // Walk through nested items/references
  if (item.items && Array.isArray(item.items)) {
    for (const sub of item.items) {
      if (sub.text) parts.push(sub.text);
      if (sub.title) parts.push(sub.title);
      if (sub.items && Array.isArray(sub.items)) {
        for (const nested of sub.items) {
          if (nested.text) parts.push(nested.text);
          if (nested.title) parts.push(nested.title);
        }
      }
    }
  }

  // Check references array
  if (item.references && Array.isArray(item.references)) {
    for (const ref of item.references) {
      if (ref.text) parts.push(ref.text);
      if (ref.title) parts.push(ref.title);
    }
  }

  return parts.join('\n').trim();
}

function extractAiOverviewCitations(item) {
  const citations = [];

  function collectUrls(obj) {
    if (!obj) return;
    if (obj.url) citations.push({ url: obj.url, title: obj.title || '', domain: obj.domain || extractDomain(obj.url) });
    if (obj.source) citations.push({ url: obj.source, title: obj.title || '', domain: extractDomain(obj.source) });
    if (Array.isArray(obj.items)) obj.items.forEach(collectUrls);
    if (Array.isArray(obj.references)) obj.references.forEach(collectUrls);
  }

  collectUrls(item);

  // Deduplicate by URL
  const seen = new Set();
  return citations.filter(c => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isBrandMentioned(content, citations, brandName) {
  if (!brandName) return false;
  const lower = (content || '').toLowerCase();
  const brandLower = brandName.toLowerCase();

  // Check text content
  if (lower.includes(brandLower)) return true;

  // Check brand name without common suffixes (LLC, Inc, etc.)
  const stripped = brandLower.replace(/\s+(llc|inc|corp|ltd|co|company|group)\.?$/i, '').trim();
  if (stripped !== brandLower && lower.includes(stripped)) return true;

  // Check citation domains/titles
  for (const cite of citations) {
    const domain = (cite.domain || '').toLowerCase();
    const title = (cite.title || '').toLowerCase();
    if (domain.includes(stripped) || title.includes(stripped)) return true;
  }

  return false;
}

function findCompetitorMentions(content, citations, competitors) {
  if (!competitors || !competitors.length) return [];
  const lower = (content || '').toLowerCase();
  const mentioned = [];

  for (const comp of competitors) {
    const compLower = comp.toLowerCase().trim();
    if (!compLower) continue;

    // Strip TLD for domain-style competitors
    const compName = compLower.replace(/\.(com|net|org|co|io|biz)$/i, '').replace(/[.-]/g, ' ').trim();

    if (lower.includes(compLower) || lower.includes(compName)) {
      mentioned.push(comp);
      continue;
    }

    // Check citations
    for (const cite of citations) {
      const domain = (cite.domain || '').toLowerCase();
      const title = (cite.title || '').toLowerCase();
      if (domain.includes(compName) || title.includes(compLower)) {
        mentioned.push(comp);
        break;
      }
    }
  }

  return mentioned;
}

function extractSerpFeatures(items) {
  const features = [];
  const featureTypes = new Set();

  for (const item of items) {
    if (!item.type || featureTypes.has(item.type)) continue;
    // Track interesting SERP features
    if (['ai_overview', 'featured_snippet', 'knowledge_graph', 'people_also_ask',
         'local_pack', 'video', 'top_stories', 'images', 'shopping',
         'related_searches'].includes(item.type)) {
      featureTypes.add(item.type);
      features.push({
        type: item.type,
        position: item.rank_group || item.position || null,
      });
    }
  }

  return features;
}

// ── Availability check ──────────────────────────────────────────
function isConfigured() {
  return !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

module.exports = {
  checkAiOverview,
  checkAiOverviewsBatch,
  isConfigured,
  // Exported for testing
  extractAiOverviewText,
  extractAiOverviewCitations,
  isBrandMentioned,
  findCompetitorMentions,
  extractSerpFeatures,
};
