import { NextRequest } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { verifyRequestAuth } from '@/lib/auth';
import { getPlanLimits } from '@/lib/constants';
import { pool } from '@/lib/db';

// ── Helpers ──────────────────────────────────────────────────────────────────

function isValidUrl(str: string): boolean {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// ── Scoring functions ────────────────────────────────────────────────────────

interface CategoryResult {
  score: number;
  label: string;
  findings: string[];
}

function scoreContentStructure(html: string, bodyText: string): CategoryResult {
  let score = 0;
  const findings: string[] = [];

  const hasH1 = /<h1[\s>]/i.test(html);
  if (hasH1) { score += 15; findings.push('Has clear H1 heading'); }
  else { findings.push('Missing H1 heading'); }

  const h2Matches = html.match(/<h2[\s>]/gi) || [];
  if (h2Matches.length >= 2) { score += 15; findings.push(`Has ${h2Matches.length} H2 sections`); }
  else if (h2Matches.length === 1) { score += 8; findings.push('Has only 1 H2 section — consider adding more'); }
  else { findings.push('Missing H2 headings for content structure'); }

  if (/<h3[\s>]/i.test(html)) { score += 5; findings.push('Uses H3 sub-headings'); }

  if (/<(ul|ol)[\s>]/i.test(html)) { score += 10; findings.push('Uses lists for structured content'); }
  else { findings.push('No lists found — consider using bullet or numbered lists'); }

  if (/<table[\s>]/i.test(html)) { score += 5; findings.push('Has tabular data'); }

  const wc = wordCount(bodyText);
  if (wc > 1000) { score += 30; findings.push(`Strong content length (${wc} words)`); }
  else if (wc > 300) { score += 15; findings.push(`Adequate content length (${wc} words)`); }
  else { findings.push(`Content is thin (${wc} words) — aim for 1000+`); }

  // Average paragraph word length
  const paragraphs = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
  if (paragraphs.length > 0) {
    const avgWords = paragraphs.reduce((sum, p) => sum + wordCount(stripTags(p)), 0) / paragraphs.length;
    if (avgWords > 50) { score += 10; findings.push('Paragraphs have good depth'); }
  }

  // FAQ-like sections (question marks in headings)
  const headings = html.match(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi) || [];
  const hasFaq = headings.some(h => stripTags(h).includes('?'));
  if (hasFaq) { score += 10; findings.push('Has FAQ-style heading sections'); }
  else { findings.push('Missing FAQ section — adding questions in headings helps AI citation'); }

  return { score: Math.min(score, 100), label: 'Content Structure', findings };
}

function scoreSchemaData(html: string): CategoryResult {
  let score = 0;
  const findings: string[] = [];

  const ldJsonBlocks = html.match(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];

  if (ldJsonBlocks.length > 0) {
    score += 30;
    findings.push('Has JSON-LD structured data');

    const combined = ldJsonBlocks.join(' ').toLowerCase();

    if (combined.includes('"organization"')) { score += 15; findings.push('Has Organization schema'); }
    else { findings.push('Missing Organization schema'); }

    if (combined.includes('"faqpage"')) { score += 20; findings.push('Has FAQPage schema'); }
    else { findings.push('Missing FAQPage schema — highly valuable for AI citation'); }

    if (combined.includes('"product"') || combined.includes('"service"')) { score += 15; findings.push('Has Product/Service schema'); }
    else { findings.push('Missing Product/Service schema'); }

    if (combined.includes('"breadcrumblist"')) { score += 10; findings.push('Has BreadcrumbList schema'); }
    else { findings.push('Missing BreadcrumbList schema'); }

    // Check for any other schema types beyond what we already checked
    const knownTypes = ['organization', 'faqpage', 'product', 'service', 'breadcrumblist'];
    const typeMatches = combined.match(/"@type"\s*:\s*"([^"]+)"/g) || [];
    const otherTypes = typeMatches.some(t => {
      const typeName = t.replace(/"@type"\s*:\s*"/i, '').replace(/"$/, '').toLowerCase();
      return !knownTypes.includes(typeName);
    });
    if (otherTypes) { score += 10; findings.push('Has additional schema types'); }
  } else {
    findings.push('No JSON-LD structured data found — this is critical for AI discoverability');
    findings.push('Missing Organization schema');
    findings.push('Missing FAQPage schema');
  }

  return { score: Math.min(score, 100), label: 'Structured Data', findings };
}

function scoreAuthoritySignals(html: string, bodyText: string): CategoryResult {
  let score = 0;
  const findings: string[] = [];

  // External links
  const allLinks = html.match(/<a[^>]+href\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>/gi) || [];
  // Filter to truly external (different domain would need the page's own domain, so just count absolute http links)
  const externalLinks = allLinks.length;
  if (externalLinks > 3) { score += 25; findings.push(`Has ${externalLinks} external citations`); }
  else if (externalLinks > 0) { score += 15; findings.push(`Has ${externalLinks} external link(s) — aim for more citations`); }
  else { findings.push('No external citations found — adding references boosts credibility'); }

  // Author information
  const hasAuthor = /author/i.test(html) && (
    /<meta[^>]+name\s*=\s*["']author["'][^>]*>/i.test(html) ||
    /class\s*=\s*["'][^"']*author[^"']*["']/i.test(html) ||
    /rel\s*=\s*["']author["']/i.test(html) ||
    /byline/i.test(html)
  );
  if (hasAuthor) { score += 15; findings.push('Has author attribution'); }
  else { findings.push('Missing author information — add an author byline'); }

  // Publish / modified date
  const hasDate = /<meta[^>]+property\s*=\s*["']article:(published_time|modified_time)["'][^>]*>/i.test(html) ||
    /<time[^>]*datetime/i.test(html) ||
    /datePublished|dateModified/i.test(html);
  if (hasDate) { score += 10; findings.push('Has publish/modified date'); }
  else { findings.push('Missing publish date — signals content freshness to AI'); }

  // Statistics / numbers
  const numberPattern = /\d{1,3}(,\d{3})+|\d+(\.\d+)?%|\$\d/;
  if (numberPattern.test(bodyText)) { score += 10; findings.push('Contains statistics and numerical data'); }
  else { findings.push('Content lacks statistics — adding data points strengthens authority'); }

  // Blockquotes
  if (/<blockquote[\s>]/i.test(html) || /<q[\s>]/i.test(html)) { score += 10; findings.push('Uses quotes/blockquotes'); }
  else { findings.push('No blockquotes — consider adding expert quotes'); }

  // Authoritative domains
  const authoritativeDomains = /\.gov|\.edu|wikipedia\.org|nature\.com|sciencedirect\.com|pubmed/i;
  if (authoritativeDomains.test(html)) { score += 15; findings.push('References authoritative domains'); }
  else { findings.push('No references to authoritative domains (.gov, .edu, etc.)'); }

  // "Source" or "according to" phrases
  const sourcePatterns = /\b(source|according to|cited by|research shows|studies show|data from)\b/i;
  if (sourcePatterns.test(bodyText)) { score += 15; findings.push('Uses source-attribution language'); }
  else { findings.push('Missing source-attribution phrases like "according to"'); }

  return { score: Math.min(score, 100), label: 'Authority Signals', findings };
}

function scoreTechnicalSeo(html: string, fetchTimeMs: number, url: string): CategoryResult {
  let score = 0;
  const findings: string[] = [];

  if (/<title[\s>]/i.test(html)) { score += 10; findings.push('Has title tag'); }
  else { findings.push('Missing title tag'); }

  if (/<meta[^>]+name\s*=\s*["']description["'][^>]*>/i.test(html)) { score += 10; findings.push('Has meta description'); }
  else { findings.push('Missing meta description'); }

  if (/<link[^>]+rel\s*=\s*["']canonical["'][^>]*>/i.test(html)) { score += 10; findings.push('Has canonical URL'); }
  else { findings.push('Missing canonical URL'); }

  if (/<meta[^>]+property\s*=\s*["']og:/i.test(html)) { score += 10; findings.push('Has Open Graph tags'); }
  else { findings.push('Missing Open Graph tags'); }

  // Heading hierarchy check: h1 appears before h2, h2 before h3
  const headingOrder = (html.match(/<h([1-6])[\s>]/gi) || []).map(m => parseInt(m.replace(/<h/i, '').replace(/[\s>]/g, ''), 10));
  let properHierarchy = true;
  let minSeen = 7;
  for (const level of headingOrder) {
    if (level < minSeen) {
      if (level < minSeen - 1 && minSeen < 7) { properHierarchy = false; break; }
      minSeen = level;
    }
  }
  // Simpler check: has h1 and h2, and first heading is h1
  if (headingOrder.length > 0 && headingOrder[0] === 1 && headingOrder.includes(2)) {
    score += 10;
    findings.push('Proper heading hierarchy');
  } else {
    findings.push('Heading hierarchy could be improved');
  }

  if (fetchTimeMs < 3000) { score += 15; findings.push(`Fast page load (${fetchTimeMs}ms)`); }
  else { findings.push(`Slow page load (${fetchTimeMs}ms) — aim for under 3 seconds`); }

  // Alt text on images
  const images = html.match(/<img[^>]*>/gi) || [];
  if (images.length > 0) {
    const withAlt = images.filter(img => /alt\s*=\s*["'][^"']+["']/i.test(img));
    if (withAlt.length === images.length) { score += 10; findings.push('All images have alt text'); }
    else if (withAlt.length > 0) { score += 5; findings.push(`${withAlt.length}/${images.length} images have alt text`); }
    else { findings.push('Images are missing alt text'); }
  } else {
    score += 10; // No images, no penalty
  }

  if (/<link[^>]+hreflang/i.test(html)) { score += 5; findings.push('Has hreflang tags for internationalization'); }

  if (url.startsWith('https://')) { score += 10; findings.push('HTTPS enabled'); }
  else { findings.push('Not using HTTPS — security concern for AI trust'); }

  if (/<meta[^>]+name\s*=\s*["']viewport["'][^>]*>/i.test(html)) { score += 10; findings.push('Has mobile viewport meta tag'); }
  else { findings.push('Missing mobile viewport meta tag'); }

  return { score: Math.min(score, 100), label: 'Technical SEO', findings };
}

function scoreAiReadability(html: string, bodyText: string): CategoryResult {
  let score = 0;
  const findings: string[] = [];

  // Marketing buzzword density
  const buzzwords = /\b(revolutionary|game[- ]changing|best[- ]in[- ]class|cutting[- ]edge|world[- ]class|synergy|disruptive|next[- ]generation|paradigm[- ]shift|unparalleled|unmatched|groundbreaking|innovative|leverage|holistic|scalable|bleeding[- ]edge)\b/gi;
  const buzzMatches = bodyText.match(buzzwords) || [];
  const words = wordCount(bodyText);
  const buzzDensity = words > 0 ? buzzMatches.length / words : 0;
  if (buzzDensity <= 0.03 && buzzMatches.length <= 2) { score += 20; findings.push('Uses clear, factual language'); }
  else { findings.push(`Too many marketing buzzwords (${buzzMatches.length} found) — use factual tone`); }

  // Definition-like structures: "X is..." patterns
  const definitionPattern = /\b[A-Z][a-z]+(?:\s+[A-Z]?[a-z]+)*\s+is\s+(?:a|an|the|defined as)\b/;
  if (definitionPattern.test(bodyText)) { score += 20; findings.push('Has definition-style structures ("X is a...")'); }
  else { findings.push('Add definition structures ("X is a...") for AI-friendly content'); }

  // Comparison content
  const comparisonPattern = /\b(vs\.?|versus|compare|compared to|better than|alternative to|difference between)\b/i;
  if (comparisonPattern.test(bodyText)) { score += 15; findings.push('Has comparison content'); }
  else { findings.push('No comparison content found — "vs" and "compare" patterns help AI'); }

  // Numbered steps/processes
  const hasSteps = /\b(step\s+\d|first,?\s|second,?\s|third,?\s|\d+\.\s+[A-Z])/m.test(bodyText) || /<ol[\s>]/i.test(html);
  if (hasSteps) { score += 15; findings.push('Contains numbered steps/processes'); }
  else { findings.push('Add numbered steps or processes for better AI parsing'); }

  // Text-to-HTML ratio
  const textLength = bodyText.length;
  const htmlLength = html.length;
  const ratio = htmlLength > 0 ? textLength / htmlLength : 0;
  if (ratio > 0.3) { score += 15; findings.push(`Good text-to-HTML ratio (${Math.round(ratio * 100)}%)`); }
  else { findings.push(`Low text-to-HTML ratio (${Math.round(ratio * 100)}%) — reduce boilerplate markup`); }

  // Ad/popup indicators
  const adPatterns = /class\s*=\s*["'][^"']*(ad-container|ad-wrapper|popup-overlay|modal-ad|adsense|dfp-ad|ad-slot|banner-ad|interstitial)[^"']*["']/gi;
  const adMatches = html.match(adPatterns) || [];
  if (adMatches.length === 0) { score += 15; findings.push('No excessive ad indicators detected'); }
  else { findings.push(`Found ${adMatches.length} ad-related elements — reduce ad clutter`); }

  return { score: Math.min(score, 100), label: 'AI Readability', findings };
}

// ── Recommendations generator ────────────────────────────────────────────────

function generateRecommendations(categories: Record<string, CategoryResult>): string[] {
  const recs: { priority: number; text: string }[] = [];

  const cs = categories.contentStructure;
  if (cs.score < 60) {
    recs.push({ priority: cs.score, text: 'Improve content structure by adding clear H1/H2 headings and using lists for key points' });
  }
  if (cs.findings.some(f => f.includes('FAQ'))) {
    recs.push({ priority: cs.score + 5, text: 'Add FAQ-style sections with question-based headings to help AI platforms cite your answers directly' });
  }

  const sd = categories.schemaData;
  if (sd.score < 50) {
    recs.push({ priority: sd.score, text: 'Add JSON-LD structured data (especially FAQPage and Organization schemas) to boost AI discoverability' });
  }
  if (sd.findings.some(f => f.includes('FAQPage'))) {
    recs.push({ priority: sd.score + 5, text: 'Implement FAQPage schema markup to help AI platforms find and cite your FAQ content' });
  }

  const auth = categories.authoritySignals;
  if (auth.findings.some(f => f.includes('publish date'))) {
    recs.push({ priority: auth.score, text: 'Include a visible publish date and last-modified date to signal content freshness' });
  }
  if (auth.findings.some(f => f.includes('citations') || f.includes('external'))) {
    recs.push({ priority: auth.score + 2, text: 'Add more factual citations and external references to authoritative sources' });
  }
  if (auth.findings.some(f => f.includes('author'))) {
    recs.push({ priority: auth.score + 3, text: 'Add clear author attribution with credentials to build E-E-A-T signals' });
  }

  const tech = categories.technicalSeo;
  if (tech.findings.some(f => f.includes('meta description'))) {
    recs.push({ priority: tech.score, text: 'Add a concise meta description that summarizes what the page offers' });
  }
  if (tech.findings.some(f => f.includes('Open Graph'))) {
    recs.push({ priority: tech.score + 2, text: 'Add Open Graph meta tags for better content previewing by AI and social platforms' });
  }

  const ai = categories.aiReadability;
  if (ai.findings.some(f => f.includes('buzzwords'))) {
    recs.push({ priority: ai.score, text: 'Replace marketing buzzwords with clear, factual language that AI platforms prefer to cite' });
  }
  if (ai.findings.some(f => f.includes('definition'))) {
    recs.push({ priority: ai.score + 3, text: 'Add definition-style sentences ("X is a...") so AI platforms can directly quote your content' });
  }
  if (ai.findings.some(f => f.includes('comparison'))) {
    recs.push({ priority: ai.score + 5, text: 'Include comparison content (vs, alternatives) to appear in AI comparison queries' });
  }

  // Sort by priority (lowest score = highest priority) and take top 3-5
  recs.sort((a, b) => a.priority - b.priority);
  const unique = [...new Set(recs.map(r => r.text))];
  return unique.slice(0, 5);
}

// ── Extract meta info ────────────────────────────────────────────────────────

function extractMeta(html: string): { title: string; description: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]).trim() : '';

  const descMatch = html.match(/<meta[^>]+name\s*=\s*["']description["'][^>]+content\s*=\s*["']([^"']*)["']/i) ||
    html.match(/<meta[^>]+content\s*=\s*["']([^"']*)["'][^>]+name\s*=\s*["']description["']/i);
  const description = descMatch ? descMatch[1].trim() : '';

  return { title, description };
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Determine auth status and apply rate limiting
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const user = verifyRequestAuth(req);

    let rateLimitKey: string;
    let maxRequests: number;
    if (user) {
      rateLimitKey = `geo-audit:user:${user.id}`;
      maxRequests = 10;
    } else {
      rateLimitKey = `geo-audit:ip:${ip}`;
      maxRequests = 2;
    }

    const { allowed, retryAfter } = await rateLimit(rateLimitKey, 60 * 60 * 1000, maxRequests);
    if (!allowed) return rateLimitResponse(retryAfter);

    // Check monthly GEO audit limit based on plan
    let userPlan = 'free';
    if (user) {
      const planResult = await pool.query('SELECT plan FROM users WHERE id = $1', [user.id]);
      userPlan = planResult.rows[0]?.plan || 'free';
    }
    const limits = getPlanLimits(userPlan);
    const monthlyKey = user ? `geo-audit-monthly:${user.id}` : `geo-audit-monthly:ip:${ip}`;
    const monthlyCheck = await rateLimit(monthlyKey, 30 * 24 * 60 * 60 * 1000, limits.geoAudits);
    if (!monthlyCheck.allowed) {
      return Response.json({
        error: `Monthly GEO audit limit reached (${limits.geoAudits} audits/month on ${userPlan} plan). Upgrade for more audits.`,
        planLimit: true
      }, { status: 429 });
    }

    // Parse and validate input
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== 'string' || !url.trim()) {
      return Response.json({ error: 'URL is required.' }, { status: 400 });
    }

    const trimmedUrl = url.trim();
    if (!isValidUrl(trimmedUrl)) {
      return Response.json({ error: 'Invalid URL. Must be a valid http or https URL.' }, { status: 400 });
    }

    // Fetch the page
    const fetchStart = Date.now();
    let html: string;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const response = await fetch(trimmedUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'LivesovBot/1.0 (GEO Audit; +https://livesov.com)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return Response.json(
          { error: `Failed to fetch URL: HTTP ${response.status}` },
          { status: 422 }
        );
      }

      html = await response.text();
    } catch (err: unknown) {
      const message = err instanceof Error && err.name === 'AbortError'
        ? 'URL fetch timed out (10s limit)'
        : 'Failed to fetch URL. Ensure the URL is accessible.';
      return Response.json({ error: message }, { status: 422 });
    }
    const fetchTimeMs = Date.now() - fetchStart;

    // Extract body text for analysis
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyHtml = bodyMatch ? bodyMatch[1] : html;
    // Strip scripts and styles before extracting text
    const cleanedBody = bodyHtml
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
    const bodyText = stripTags(cleanedBody);

    // Score each category
    const categories = {
      contentStructure: scoreContentStructure(html, bodyText),
      schemaData: scoreSchemaData(html),
      authoritySignals: scoreAuthoritySignals(html, bodyText),
      technicalSeo: scoreTechnicalSeo(html, fetchTimeMs, trimmedUrl),
      aiReadability: scoreAiReadability(html, bodyText),
    };

    const scores = Object.values(categories).map(c => c.score);
    const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    const recommendations = generateRecommendations(categories);
    const meta = extractMeta(html);

    return Response.json({
      url: trimmedUrl,
      overallScore,
      categories,
      recommendations,
      meta: {
        title: meta.title,
        description: meta.description,
        wordCount: wordCount(bodyText),
        fetchTimeMs,
      },
    });
  } catch (error) {
    console.error('GEO audit error:', error);
    return Response.json(
      { error: 'Something went wrong. Please try again later.' },
      { status: 500 }
    );
  }
}
