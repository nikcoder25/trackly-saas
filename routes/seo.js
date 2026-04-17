/**
 * SEO landing pages — platform-specific and educational content
 */
const express = require('express');
const router  = express.Router();

// Escape HTML attribute values to prevent injection
function escAttr(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function seoPage({ title, description, keywords, h1, subtitle, content, canonical, jsonLd }) {
  // Escape attribute-context values (title, description, keywords, canonical)
  const safeTitle = escAttr(title);
  const safeDesc = escAttr(description);
  const safeKeywords = escAttr(keywords);
  const safeCanonical = escAttr(canonical);
  // Build breadcrumb JSON-LD
  const breadcrumbLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://livesov.com/" },
      { "@type": "ListItem", "position": 2, "name": title, "item": `https://livesov.com${canonical}` }
    ]
  });
  // Build page-specific JSON-LD if provided
  const extraLd = jsonLd ? `\n<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle}</title>
<meta name="description" content="${safeDesc}">
<meta name="keywords" content="${safeKeywords}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta name="author" content="Livesov">
<link rel="canonical" href="https://livesov.com${safeCanonical}">
<meta property="og:type" content="article">
<meta property="og:url" content="https://livesov.com${safeCanonical}">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDesc}">
<meta property="og:site_name" content="Livesov">
<meta property="og:image" content="https://livesov.com/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${safeTitle}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDesc}">
<meta name="twitter:image" content="https://livesov.com/og-image.png">
<meta name="theme-color" content="#FF6154">
<meta property="og:locale" content="en_US">
<link rel="icon" href="/favicon.ico" type="image/x-icon">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<script type="application/ld+json">${breadcrumbLd}</script>${extraLd}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400..800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
:root{--bg:#ffffff;--bg2:#f5f3f0;--bg3:#fafafa;--border:#e8e5e1;--text:#1a1a2e;--muted:#64748b;--primary:#FF6154;--accent:#6366f1;--success:#10b981;--font:'Inter',system-ui,-apple-system,sans-serif;--mono:'JetBrains Mono',monospace;--radius:12px;--radius-sm:8px;}
body{font-family:var(--font);background:var(--bg);color:var(--text);min-height:100vh;-webkit-font-smoothing:antialiased;}
a{color:var(--primary);text-decoration:none;}a:hover{text-decoration:underline;}
.seo-nav{display:flex;align-items:center;padding:16px 48px;border-bottom:1px solid rgba(0,0,0,.06);background:rgba(255,255,255,.92);position:sticky;top:0;z-index:50;backdrop-filter:blur(20px);}
.seo-nav-logo{font-size:24px;font-weight:800;letter-spacing:-1px;color:var(--text);text-decoration:none;}.seo-nav-logo span{color:var(--primary);}
.seo-nav-links{display:flex;gap:28px;margin-left:40px;}.seo-nav-links a{color:var(--muted);font-size:14px;font-weight:500;}
.seo-nav-right{margin-left:auto;}.seo-btn{padding:10px 24px;font-family:var(--font);font-size:14px;font-weight:700;cursor:pointer;border:none;background:var(--primary);color:#fff;text-decoration:none;display:inline-block;border-radius:var(--radius-sm);transition:all .2s;box-shadow:0 1px 2px rgba(255,97,84,.3);}
.seo-btn:hover{background:#e8503f;transform:translateY(-1px);box-shadow:0 4px 12px rgba(255,97,84,.3);text-decoration:none;}
.seo-hero{text-align:center;padding:80px 20px 60px;max-width:800px;margin:0 auto;}
.seo-hero h1{font-size:clamp(28px,5vw,48px);font-weight:800;letter-spacing:-2px;line-height:1.15;margin-bottom:20px;color:var(--text);}
.seo-hero h1 span{background:linear-gradient(135deg,var(--primary),var(--accent));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.seo-hero p{color:var(--muted);font-size:17px;line-height:1.7;margin-bottom:32px;}
.seo-content{max-width:800px;margin:0 auto;padding:0 20px 60px;}
.seo-content h2{font-size:24px;font-weight:700;margin:40px 0 16px;letter-spacing:-0.5px;color:var(--text);}
.seo-content h3{font-size:18px;font-weight:700;margin:28px 0 12px;color:var(--text);}
.seo-content p{color:var(--muted);font-size:15px;line-height:1.8;margin-bottom:16px;}
.seo-content ul{list-style:none;margin-bottom:20px;}.seo-content ul li{font-size:14px;color:var(--muted);padding:8px 0;border-bottom:1px solid var(--border);}
.seo-content ul li::before{content:'\\2713 ';color:var(--success);font-weight:700;}
.seo-content .highlight{background:var(--bg2);border:1px solid var(--border);padding:24px;margin:20px 0;border-radius:var(--radius);}
.seo-cta{text-align:center;padding:60px 20px;background:var(--bg2);border-top:1px solid var(--border);}
.seo-cta h2{font-size:28px;font-weight:800;margin-bottom:12px;color:var(--text);}
.seo-cta p{color:var(--muted);font-size:15px;margin-bottom:24px;}
.seo-footer{border-top:1px solid var(--border);padding:28px 48px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;background:var(--bg2);}
.seo-footer-text{font-size:13px;color:var(--muted);}
.seo-footer-links{display:flex;gap:20px;flex-wrap:wrap;}.seo-footer-links a{color:var(--muted);font-size:13px;font-weight:500;}
@media(max-width:768px){.seo-nav{padding:14px 20px;}.seo-nav-links{display:none;}.seo-footer{flex-direction:column;text-align:center;padding:24px 20px;}}
</style>
</head>
<body>
<header>
<nav class="seo-nav" aria-label="Main navigation">
  <a href="/" class="seo-nav-logo">Live<span>sov</span></a>
  <div class="seo-nav-links">
    <a href="/#features">Features</a>
    <a href="/pricing">Pricing</a>
    <a href="/how-it-works">How it Works</a>
    <a href="/use-cases">Use Cases</a>
    <a href="/integrations">Integrations</a>
    <a href="/blog">Blog</a>
    <a href="/about">About</a>
  </div>
  <div class="seo-nav-right"><a class="seo-btn" href="/signup">Start Tracking Free</a></div>
</nav>
</header>
<main>
<section class="seo-hero" aria-label="Hero">
  <h1>${h1}</h1>
  <p>${subtitle}</p>
  <a class="seo-btn" href="/signup" style="padding:14px 36px;font-size:15px;">Start Tracking Free</a>
</section>
<article class="seo-content">
${content}
</article>
<section class="seo-cta" aria-label="Call to action">
  <h2>Ready to track your AI visibility?</h2>
  <p>Monitor your brand across ChatGPT, Perplexity, Claude, Gemini, Grok & Google AI Overviews.</p>
  <a class="seo-btn" href="/signup" style="padding:14px 36px;font-size:15px;">Get Started Free</a>
  <p style="font-size:13px;color:var(--muted);margin-top:12px;">No credit card required.</p>
</section>
</main>
<footer class="seo-footer">
  <div class="seo-footer-text">&copy; 2026 Livesov — AI Visibility Tracker</div>
  <div class="seo-footer-links">
    <a href="/">Home</a>
    <a href="/pricing">Pricing</a>
    <a href="/how-it-works">How it Works</a>
    <a href="/use-cases">Use Cases</a>
    <a href="/integrations">Integrations</a>
    <a href="/blog">Blog</a>
    <a href="/about">About</a>
    <a href="/contact">Contact</a>
    <a href="/changelog">Changelog</a>
    <a href="/chatgpt-brand-tracking">ChatGPT Tracking</a>
    <a href="/perplexity-brand-tracking">Perplexity Tracking</a>
    <a href="/gemini-brand-tracking">Gemini Tracking</a>
    <a href="/claude-brand-tracking">Claude Tracking</a>
    <a href="/grok-brand-tracking">Grok Tracking</a>
    <a href="/google-ai-overviews-tracking">Google AI Overviews Tracking</a>
    <a href="/geo-optimization">GEO Guide</a>
    <a href="/vs/semrush">vs Semrush</a>
    <a href="/vs/ahrefs">vs Ahrefs</a>
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
  </div>
</footer>
</body></html>`;
}

// ChatGPT landing page
router.get('/chatgpt-brand-tracking', (req, res) => {
  res.send(seoPage({
    title: 'ChatGPT Brand Tracking — Monitor Your Brand Mentions in ChatGPT | Livesov',
    description: 'Track how ChatGPT mentions your brand. See real OpenAI API responses, measure share of voice, and get proof of your brand visibility in ChatGPT answers.',
    keywords: 'ChatGPT brand tracking, ChatGPT brand monitoring, track brand in ChatGPT, ChatGPT mentions, ChatGPT SEO, ChatGPT visibility',
    h1: 'Track Your Brand in <span>ChatGPT</span>',
    subtitle: 'See exactly how ChatGPT answers questions about your industry and whether it recommends your brand. Real API responses, real proof.',
    canonical: '/chatgpt-brand-tracking',
    jsonLd: { "@context": "https://schema.org", "@type": "WebPage", "name": "ChatGPT Brand Tracking", "description": "Track how ChatGPT mentions your brand with real OpenAI API responses.", "url": "https://livesov.com/chatgpt-brand-tracking", "isPartOf": { "@type": "WebSite", "name": "Livesov", "url": "https://livesov.com" } },
    content: `
<h2>Why Track Your Brand in ChatGPT?</h2>
<p>ChatGPT has over 200 million weekly active users. When someone asks "What's the best [your industry] company?", does ChatGPT mention your brand? If not, you're missing out on one of the most influential recommendation engines in the world.</p>
<p>Livesov queries ChatGPT using the official OpenAI API with your custom keywords and captures the complete, unmodified response. You see exactly what ChatGPT says — no screenshots, no guessing.</p>

<h2>How ChatGPT Brand Tracking Works</h2>
<div class="highlight">
<h3>1. Add Your Keywords</h3>
<p>Enter the questions your customers ask — e.g., "Best HVAC company in Austin TX", "Top rated plumber near me", "Which CRM is best for small business?"</p>
<h3>2. Run Tracking</h3>
<p>Livesov sends your queries to ChatGPT via the official OpenAI API and captures the full response.</p>
<h3>3. See Results</h3>
<p>Each response is analyzed for brand mentions, sentiment, and recommendations. Results are stored as verifiable proof you can share with clients.</p>
</div>

<h2>What You Get</h2>
<ul>
<li>Complete ChatGPT responses saved as evidence</li>
<li>Brand mention detection with highlight</li>
<li>Sentiment analysis (positive, negative, neutral)</li>
<li>Recommendation detection</li>
<li>Share of Voice percentage</li>
<li>CSV export for client reporting</li>
<li>Historical tracking across multiple runs</li>
</ul>

<h2>ChatGPT vs Google: Why It Matters</h2>
<p>Traditional SEO focuses on Google rankings. But increasingly, users ask ChatGPT for recommendations instead of searching Google. This is called <strong>Generative Engine Optimization (GEO)</strong> — and it requires a completely different tracking approach.</p>
<p>Unlike Google where you can see your position in search results, ChatGPT has no "ranking page." The only way to know if ChatGPT recommends you is to ask it — and that's exactly what Livesov does.</p>

<h2>Who Needs ChatGPT Tracking?</h2>
<p><strong>Local businesses</strong> — HVAC, plumbers, dentists, lawyers, restaurants. When locals ask ChatGPT for recommendations, are you there?</p>
<p><strong>SEO agencies</strong> — Offer AI visibility tracking as a service. Show clients real proof of their ChatGPT presence.</p>
<p><strong>SaaS companies</strong> — Monitor if ChatGPT recommends your product when users ask for solutions in your category.</p>

<h2>Track More AI Platforms</h2>
<p>ChatGPT is just one platform. Livesov also tracks your brand across <a href="/perplexity-brand-tracking">Perplexity AI</a>, <a href="/gemini-brand-tracking">Google Gemini</a>, <a href="/claude-brand-tracking">Claude AI</a>, <a href="/grok-brand-tracking">Grok (xAI)</a>, and <a href="/google-ai-overviews-tracking">Google AI Overviews</a>. Learn more about optimizing for all AI platforms in our <a href="/geo-optimization">GEO Optimization Guide</a>.</p>
`
  }));
});

// Perplexity landing page
router.get('/perplexity-brand-tracking', (req, res) => {
  res.send(seoPage({
    title: 'Perplexity Brand Tracking — Monitor Brand Mentions in Perplexity AI | Livesov',
    description: 'Track how Perplexity AI mentions and cites your brand. See real search-grounded responses with citations, measure visibility, and export proof.',
    keywords: 'Perplexity brand tracking, Perplexity brand monitoring, track brand in Perplexity, Perplexity AI mentions, Perplexity SEO, Perplexity visibility',
    h1: 'Track Your Brand in <span>Perplexity AI</span>',
    subtitle: 'Perplexity is the fastest-growing AI search engine. See if it mentions and cites your brand with real, search-grounded responses.',
    canonical: '/perplexity-brand-tracking',
    jsonLd: { "@context": "https://schema.org", "@type": "WebPage", "name": "Perplexity Brand Tracking", "description": "Track how Perplexity AI mentions and cites your brand with search-grounded responses.", "url": "https://livesov.com/perplexity-brand-tracking", "isPartOf": { "@type": "WebSite", "name": "Livesov", "url": "https://livesov.com" } },
    content: `
<h2>Why Perplexity Matters for Your Brand</h2>
<p>Perplexity AI is an AI-powered search engine that provides cited, real-time answers. Unlike ChatGPT which relies on training data, Perplexity actively searches the web — making it a direct competitor to Google for informational queries.</p>
<p>When Perplexity answers "What's the best [product] in [category]?", it pulls from live web data and provides citations. If your brand appears in these answers with a citation to your website, that's high-value visibility.</p>

<h2>How Perplexity Tracking Works</h2>
<div class="highlight">
<p>Livesov uses the Perplexity Sonar Pro API with search grounding enabled. This means the responses you see in Livesov match what users see on perplexity.ai — real-time, web-grounded answers with citations.</p>
</div>

<h2>What Makes Perplexity Different</h2>
<ul>
<li>Search-grounded responses with real-time web data</li>
<li>Citations and source URLs in every answer</li>
<li>Growing market share as a Google alternative</li>
<li>Higher commercial intent than ChatGPT queries</li>
<li>Livesov captures all citations from Perplexity responses</li>
</ul>

<h2>Optimize for Perplexity</h2>
<p>Perplexity pulls from web content, reviews, and authoritative sources. To improve your Perplexity visibility:</p>
<ul>
<li>Build authoritative content that Perplexity can cite</li>
<li>Get mentioned on review sites and industry directories</li>
<li>Ensure your website is crawlable by AI bots</li>
<li>Track your mentions regularly with Livesov to measure progress</li>
</ul>

<h2>Track More AI Platforms</h2>
<p>Don't stop at Perplexity. Track your brand across <a href="/chatgpt-brand-tracking">ChatGPT</a>, <a href="/gemini-brand-tracking">Google Gemini</a>, <a href="/claude-brand-tracking">Claude AI</a>, <a href="/grok-brand-tracking">Grok</a>, and <a href="/google-ai-overviews-tracking">Google AI Overviews</a>. See our <a href="/geo-optimization">GEO Guide</a> for optimization strategies.</p>
`
  }));
});

// Gemini landing page
router.get('/gemini-brand-tracking', (req, res) => {
  res.send(seoPage({
    title: 'Google Gemini & AI Overviews Brand Tracking — Monitor AI Visibility | Livesov',
    description: 'Track how Google Gemini and Google AI Overviews mention your brand. Monitor your visibility in Google\'s AI-powered search with real API responses.',
    keywords: 'Gemini brand tracking, Gemini brand monitoring, Google AI visibility, Google Gemini tracking',
    h1: 'Track Your Brand in <span>Google Gemini</span>',
    subtitle: 'Gemini is Google\'s AI assistant. Track your brand visibility in Gemini\'s responses.',
    canonical: '/gemini-brand-tracking',
    jsonLd: { "@context": "https://schema.org", "@type": "WebPage", "name": "Google Gemini & AI Overviews Brand Tracking", "description": "Track your brand visibility in Google Gemini and Google AI Overviews.", "url": "https://livesov.com/gemini-brand-tracking", "isPartOf": { "@type": "WebSite", "name": "Livesov", "url": "https://livesov.com" } },
    content: `
<h2>Google AI is Changing Search</h2>
<p>Google Gemini is Google's AI assistant, used by millions for recommendations and research. If your brand isn't mentioned in Gemini's responses, you're missing a growing discovery channel.</p>
<p>Livesov tracks <strong>Google Gemini</strong> using Google's official API to capture complete AI responses.</p>

<h2>Why Gemini Tracking is Critical</h2>
<ul>
<li>Users increasingly rely on AI summaries instead of clicking links</li>
<li>Your SEO rankings don't guarantee Gemini mentions</li>
<li>Gemini draws from Google's Knowledge Graph and web data</li>
<li>Livesov captures complete Gemini responses as proof</li>
</ul>

<h2>What Livesov Tracks</h2>
<div class="highlight">
<h3>Google Gemini</h3>
<p>Queries the Gemini 2.0 Flash model for AI assistant-style responses. Tracks if your brand appears when users ask Gemini for recommendations.</p>
</div>

<h2>Optimize for Google AI</h2>
<p>Google's AI pulls from its search index, Knowledge Graph, and web data. To improve your Gemini visibility:</p>
<ul>
<li>Maintain strong traditional SEO fundamentals</li>
<li>Get featured in Google's Knowledge Graph</li>
<li>Build authority through reviews, citations, and backlinks</li>
<li>Create comprehensive, well-structured content</li>
<li>Track your AI visibility with Livesov to measure what works</li>
</ul>

<h2>Track More AI Platforms</h2>
<p>Go beyond Google. Track your brand across <a href="/chatgpt-brand-tracking">ChatGPT</a>, <a href="/perplexity-brand-tracking">Perplexity AI</a>, <a href="/claude-brand-tracking">Claude</a>, <a href="/grok-brand-tracking">Grok</a>, and <a href="/google-ai-overviews-tracking">Google AI Overviews</a>. Learn more in our <a href="/geo-optimization">GEO Guide</a>.</p>
`
  }));
});

// Claude landing page
router.get('/claude-brand-tracking', (req, res) => {
  res.send(seoPage({
    title: 'Claude Brand Tracking — Monitor Brand Mentions in Claude AI | Livesov',
    description: 'Track how Anthropic\'s Claude AI mentions your brand. See real API responses, sentiment analysis, and proof of visibility.',
    keywords: 'Claude brand tracking, Claude AI monitoring, Anthropic Claude tracking, Claude brand visibility, Claude AI mentions',
    h1: 'Track Your Brand in <span>Claude AI</span>',
    subtitle: 'Claude by Anthropic is used by millions for research and recommendations. See if it mentions your brand.',
    canonical: '/claude-brand-tracking',
    jsonLd: { "@context": "https://schema.org", "@type": "WebPage", "name": "Claude Brand Tracking", "description": "Track how Anthropic's Claude AI mentions your brand.", "url": "https://livesov.com/claude-brand-tracking", "isPartOf": { "@type": "WebSite", "name": "Livesov", "url": "https://livesov.com" } },
    content: `
<h2>Why Track Your Brand in Claude?</h2>
<p>Claude by Anthropic is one of the most trusted AI assistants, known for thoughtful, nuanced responses. Businesses, researchers, and consumers use Claude daily for recommendations and research. Livesov monitors your brand's presence in Claude's responses using the official Anthropic API.</p>

<h2>What You Get</h2>
<ul>
<li>Real Claude API responses (Claude Sonnet model)</li>
<li>Brand mention detection across all name variations</li>
<li>Sentiment and recommendation analysis</li>
<li>Full response saved as verifiable proof</li>
<li>Historical tracking and SOV measurement</li>
</ul>

<h2>Track More AI Platforms</h2>
<p>Also track your brand across <a href="/chatgpt-brand-tracking">ChatGPT</a>, <a href="/perplexity-brand-tracking">Perplexity AI</a>, <a href="/gemini-brand-tracking">Google Gemini</a>, <a href="/grok-brand-tracking">Grok</a>, and <a href="/google-ai-overviews-tracking">Google AI Overviews</a>. See our <a href="/geo-optimization">GEO Guide</a> for optimization strategies.</p>
`
  }));
});

// Grok landing page
router.get('/grok-brand-tracking', (req, res) => {
  res.send(seoPage({
    title: 'Grok Brand Tracking — Monitor Brand Mentions in Grok (xAI) | Livesov',
    description: 'Track how xAI\'s Grok mentions your brand. Monitor your visibility on X/Twitter\'s AI assistant with real API responses.',
    keywords: 'Grok brand tracking, Grok AI monitoring, xAI Grok tracking, Grok brand visibility, X AI tracking',
    h1: 'Track Your Brand in <span>Grok (xAI)</span>',
    subtitle: 'Grok powers AI on X (Twitter) and is used by millions. Track if it recommends your brand.',
    canonical: '/grok-brand-tracking',
    jsonLd: { "@context": "https://schema.org", "@type": "WebPage", "name": "Grok Brand Tracking", "description": "Track how xAI's Grok mentions your brand.", "url": "https://livesov.com/grok-brand-tracking", "isPartOf": { "@type": "WebSite", "name": "Livesov", "url": "https://livesov.com" } },
    content: `
<h2>Why Track Grok?</h2>
<p>Grok by xAI is integrated into X (Twitter) and has access to real-time social data. When users ask Grok for recommendations, it draws from both its training data and live social signals. Livesov monitors your brand's visibility in Grok responses using the official xAI API.</p>

<h2>What You Get</h2>
<ul>
<li>Real Grok API responses (Grok-3-mini model)</li>
<li>Brand mention and recommendation detection</li>
<li>Sentiment analysis of how Grok describes your brand</li>
<li>Evidence export for client reporting</li>
</ul>

<h2>Track More AI Platforms</h2>
<p>Also track your brand across <a href="/chatgpt-brand-tracking">ChatGPT</a>, <a href="/perplexity-brand-tracking">Perplexity AI</a>, <a href="/gemini-brand-tracking">Google Gemini</a>, <a href="/claude-brand-tracking">Claude</a>, and <a href="/google-ai-overviews-tracking">Google AI Overviews</a>. See our <a href="/geo-optimization">GEO Guide</a> for optimization strategies.</p>
`
  }));
});

// Google AI Overviews landing page
router.get('/google-ai-overviews-tracking', (req, res) => {
  res.send(seoPage({
    title: 'Google AI Overviews Tracking — Monitor Your Brand in AI-Generated Search Results | Livesov',
    description: 'Track how Google AI Overviews mentions your brand. See when your business appears in AI-generated search summaries above organic results.',
    keywords: 'Google AI Overviews tracking, Google AI Overviews brand monitoring, AI Overviews visibility, Google SGE tracking, AI search results tracking, Google AI brand mentions',
    h1: 'Track Your Brand in <span>Google AI Overviews</span>',
    subtitle: 'Google AI Overviews appear above organic search results for millions of queries. Monitor whether your brand is featured in these AI-generated summaries.',
    canonical: '/google-ai-overviews-tracking',
    jsonLd: { "@context": "https://schema.org", "@type": "WebPage", "name": "Google AI Overviews Brand Tracking", "description": "Track how Google AI Overviews mentions your brand in AI-generated search summaries.", "url": "https://livesov.com/google-ai-overviews-tracking", "isPartOf": { "@type": "WebSite", "name": "Livesov", "url": "https://livesov.com" } },
    content: `
<h2>Why Track Google AI Overviews?</h2>
<p>Google AI Overviews (formerly Search Generative Experience / SGE) displays AI-generated summaries at the top of search results. These overviews appear for a growing percentage of queries and are seen before any organic result. If your brand isn't appearing in AI Overviews, you're losing visibility to competitors who are.</p>
<p>Livesov monitors your brand's presence in Google AI Overviews using the DataForSEO API, capturing the full AI-generated summary so you can see exactly how Google presents your brand.</p>

<h2>How Google AI Overviews Tracking Works</h2>
<div class="highlight">
<h3>1. Add Your Keywords</h3>
<p>Enter the search queries your customers use — e.g., "Best HVAC company in Austin TX", "Top rated plumber near me", "Which CRM is best for small business?"</p>
<h3>2. Run Tracking</h3>
<p>Livesov queries Google via the DataForSEO API and captures the AI Overview summary that appears above organic results.</p>
<h3>3. See Your Results</h3>
<p>View the full AI Overview text, check if your brand is mentioned, track your visibility over time, and compare against competitors.</p>
</div>

<h2>What Makes AI Overviews Different</h2>
<ul>
<li><strong>Prime placement</strong> — AI Overviews appear above all organic results, getting the first view from searchers</li>
<li><strong>AI-curated content</strong> — Google's AI selects and summarizes information from across the web</li>
<li><strong>Direct links</strong> — AI Overviews include cited sources, driving traffic to featured brands</li>
<li><strong>Growing coverage</strong> — Google is expanding AI Overviews to more query types and regions</li>
</ul>

<h2>What You Get</h2>
<ul>
<li>Full AI Overview text captured via DataForSEO API</li>
<li>Brand mention and citation detection</li>
<li>Historical tracking of your AI Overview visibility</li>
<li>Competitor comparison — see who Google features instead of you</li>
<li>Evidence export for client reporting and SEO audits</li>
</ul>

<h2>Who Should Track AI Overviews?</h2>
<p><strong>Local businesses</strong> — When someone searches for services in your area, does Google's AI Overview mention your business?</p>
<p><strong>SEO agencies</strong> — Demonstrate to clients whether their brand appears in AI-generated search summaries alongside traditional rankings.</p>
<p><strong>E-commerce brands</strong> — Monitor if Google's AI recommends your products when users search for product categories.</p>
<p><strong>SaaS companies</strong> — Track whether AI Overviews feature your product when users search for solutions in your category.</p>

<h2>Track More AI Platforms</h2>
<p>Google AI Overviews is just one platform. Livesov also tracks your brand across <a href="/chatgpt-brand-tracking">ChatGPT</a>, <a href="/perplexity-brand-tracking">Perplexity AI</a>, <a href="/gemini-brand-tracking">Google Gemini</a>, <a href="/claude-brand-tracking">Claude AI</a>, and <a href="/grok-brand-tracking">Grok (xAI)</a>. Learn more about optimizing for all AI platforms in our <a href="/geo-optimization">GEO Optimization Guide</a>.</p>
`
  }));
});

// GEO guide page
router.get('/geo-optimization', (req, res) => {
  res.send(seoPage({
    title: 'Generative Engine Optimization (GEO) Guide — How to Get Your Brand Mentioned by AI | Livesov',
    description: 'Learn about Generative Engine Optimization (GEO) and Answer Engine Optimization (AEO). Understand how to optimize your brand for AI search engines like ChatGPT, Perplexity, and Google AI Overviews.',
    keywords: 'generative engine optimization, GEO, answer engine optimization, AEO, AI SEO, LLM optimization, LLMO, AI search optimization, how to rank in ChatGPT, how to appear in AI answers',
    h1: 'Generative Engine Optimization <span>(GEO)</span> Guide',
    subtitle: 'The complete guide to making your brand visible in AI-generated answers. Also known as Answer Engine Optimization (AEO) or LLM Optimization (LLMO).',
    canonical: '/geo-optimization',
    jsonLd: { "@context": "https://schema.org", "@type": "Article", "headline": "Generative Engine Optimization (GEO) Guide", "description": "The complete guide to making your brand visible in AI-generated answers.", "url": "https://livesov.com/geo-optimization", "author": { "@type": "Organization", "name": "Livesov" }, "publisher": { "@type": "Organization", "name": "Livesov", "url": "https://livesov.com" }, "datePublished": "2026-03-07", "dateModified": "2026-03-24" },
    content: `
<h2>What is Generative Engine Optimization (GEO)?</h2>
<p>Generative Engine Optimization (GEO) is the practice of optimizing your brand's online presence to appear more frequently and positively in AI-generated answers. While traditional SEO focuses on ranking in Google search results, GEO focuses on being mentioned and recommended by AI assistants like ChatGPT, Perplexity, Claude, Gemini, Grok, and Google AI Overviews.</p>

<h2>GEO vs Traditional SEO</h2>
<div class="highlight">
<p><strong>Traditional SEO:</strong> Optimize for Google's algorithm to rank higher in search results. Users click links to visit your site.</p>
<p><strong>GEO / AEO:</strong> Optimize for AI models to mention and recommend your brand in generated answers. Users get recommendations directly from AI — no click needed.</p>
</div>

<h2>Why GEO Matters in 2026</h2>
<ul>
<li>40%+ of informational queries now involve AI-generated answers</li>
<li>Google AI Overviews appears above organic results, reducing click-through rates</li>
<li>ChatGPT, Perplexity, and Claude are replacing Google for recommendation queries</li>
<li>Brands that don't appear in AI answers lose visibility to competitors who do</li>
</ul>

<h2>How AI Models Choose Which Brands to Recommend</h2>
<p>AI models like ChatGPT and Gemini are trained on web data. They learn about brands from:</p>
<ul>
<li>Review sites (Google Reviews, Yelp, G2, Trustpilot)</li>
<li>Industry publications and blog posts</li>
<li>Social media mentions and discussions</li>
<li>Your website content and authority</li>
<li>News articles and press coverage</li>
<li>Directory listings and citations</li>
</ul>

<h2>GEO Strategy: How to Improve AI Visibility</h2>
<h3>1. Build Authoritative Content</h3>
<p>Create comprehensive, expert-level content that AI models can reference. Use structured data, clear headings, and factual information.</p>

<h3>2. Get Reviews and Mentions</h3>
<p>AI models weigh reviews heavily. Encourage satisfied customers to leave reviews on Google, Yelp, industry-specific review sites, and social media.</p>

<h3>3. Earn Backlinks and Citations</h3>
<p>AI models learn brand authority partly from how often and where your brand is mentioned online. Quality backlinks and citations from authoritative sources improve AI visibility.</p>

<h3>4. Track and Measure</h3>
<p>Use Livesov to monitor your AI visibility across all major platforms. Track which queries mention your brand, measure share of voice, and see how your GEO efforts improve results over time.</p>

<h3>5. Monitor Competitors</h3>
<p>See which competitors AI recommends for your target keywords. Understand what they're doing differently and adapt your strategy.</p>

<h2>Tools for GEO Optimization</h2>
<p>Livesov is purpose-built for GEO tracking. It queries 6 AI platforms with your custom keywords and shows you exactly what each AI says about your brand. Features include:</p>
<ul>
<li>Real API responses from ChatGPT, Perplexity, Claude, Gemini, Grok & Google AI Overviews</li>
<li>Brand mention detection with alias support</li>
<li>Share of Voice measurement</li>
<li>Sentiment and recommendation analysis</li>
<li>Evidence export for client reporting</li>
<li>Location-aware tracking</li>
</ul>
`
  }));
});

// Comparison pages
router.get('/vs/semrush', (req, res) => {
  res.send(seoPage({
    title: 'Livesov vs Semrush — AI Visibility Tracking Comparison | Livesov',
    description: 'Compare Livesov with Semrush for AI visibility tracking. Livesov is purpose-built for GEO with 6 AI platforms, while Semrush focuses on traditional SEO.',
    keywords: 'Livesov vs Semrush, Semrush alternative, AI visibility tool comparison, Semrush AI tracking, GEO tool comparison',
    h1: 'Livesov vs <span>Semrush</span>',
    subtitle: 'How Livesov compares to Semrush for AI visibility and Generative Engine Optimization tracking.',
    canonical: '/vs/semrush',
    jsonLd: { "@context": "https://schema.org", "@type": "WebPage", "name": "Livesov vs Semrush", "description": "Compare Livesov with Semrush for AI visibility tracking.", "url": "https://livesov.com/vs/semrush", "isPartOf": { "@type": "WebSite", "name": "Livesov", "url": "https://livesov.com" } },
    content: `
<h2>Semrush: Traditional SEO Powerhouse</h2>
<p>Semrush is a comprehensive SEO platform with keyword tracking, backlink analysis, and site auditing. They've recently added AI visibility features, but it's an add-on to their core SEO platform — not the primary focus.</p>

<h2>Livesov: Purpose-Built for AI Visibility</h2>
<p>Livesov is built from the ground up for one thing: tracking your brand's visibility in AI-generated answers. Every feature is designed around GEO optimization and AI mention tracking.</p>

<h2>Feature Comparison</h2>
<div class="highlight">
<p><strong>AI Platforms Tracked:</strong> Livesov covers 6 AI platforms (ChatGPT, Perplexity, Claude, Gemini, Grok, Google AI Overviews). Semrush covers fewer AI platforms.</p>
<p><strong>Real API Responses:</strong> Livesov uses real API calls and saves complete responses as proof. Full response text, model name, and timestamp included.</p>
<p><strong>Pricing:</strong> Livesov starts free. Semrush starts at $129.95/mo for their base SEO plan, with AI features in higher tiers.</p>
<p><strong>GEO Focus:</strong> Livesov is 100% focused on AI visibility. Semrush has AI visibility as one feature among hundreds.</p>
</div>

<h2>When to Use Semrush</h2>
<p>If you need a comprehensive SEO suite with keyword research, rank tracking, backlink analysis, and site auditing. Semrush is excellent for traditional SEO.</p>

<h2>When to Use Livesov</h2>
<p>If you need dedicated AI visibility tracking with real proof, share of voice measurement, and GEO optimization data. Livesov is focused, affordable, and purpose-built for the AI era.</p>

<h2>Use Both Together</h2>
<p>Many users combine Semrush for traditional SEO with Livesov for AI visibility. They complement each other — Semrush handles Google rankings, Livesov handles AI mentions.</p>
`
  }));
});

router.get('/vs/ahrefs', (req, res) => {
  res.send(seoPage({
    title: 'Livesov vs Ahrefs Brand Radar — AI Visibility Tracking Comparison | Livesov',
    description: 'Compare Livesov with Ahrefs Brand Radar for AI visibility tracking. See how real-time API tracking compares to static dataset analysis.',
    keywords: 'Livesov vs Ahrefs, Ahrefs Brand Radar alternative, AI visibility tool comparison, Ahrefs AI tracking',
    h1: 'Livesov vs <span>Ahrefs Brand Radar</span>',
    subtitle: 'How Livesov\'s real-time AI tracking compares to Ahrefs Brand Radar\'s static dataset approach.',
    canonical: '/vs/ahrefs',
    jsonLd: { "@context": "https://schema.org", "@type": "WebPage", "name": "Livesov vs Ahrefs Brand Radar", "description": "Compare Livesov with Ahrefs Brand Radar for AI visibility tracking.", "url": "https://livesov.com/vs/ahrefs", "isPartOf": { "@type": "WebSite", "name": "Livesov", "url": "https://livesov.com" } },
    content: `
<h2>Ahrefs Brand Radar</h2>
<p>Ahrefs Brand Radar analyzes a static dataset of 250M+ prompts to show how often brands appear in AI-generated responses. It updates monthly and provides broad visibility trends.</p>

<h2>Livesov: Real-Time, Custom Queries</h2>
<p>Livesov queries AI platforms in real-time with your custom keywords. You choose the exact queries, run them on-demand, and get complete API responses as proof.</p>

<h2>Key Differences</h2>
<div class="highlight">
<p><strong>Custom vs Pre-set Queries:</strong> Livesov lets you track your own keywords. Ahrefs uses a pre-built dataset.</p>
<p><strong>Real-time vs Monthly:</strong> Livesov runs queries on-demand with real API calls. Ahrefs updates monthly from historical data.</p>
<p><strong>Full Response as Proof:</strong> Livesov saves the complete AI response. Ahrefs shows aggregated statistics.</p>
<p><strong>6 AI Platforms:</strong> Livesov tracks ChatGPT, Perplexity, Claude, Gemini, Grok & Google AI Overviews.</p>
</div>

<h2>When to Use Each</h2>
<p><strong>Ahrefs Brand Radar</strong> is great for broad market intelligence and seeing macro trends in AI visibility across large datasets.</p>
<p><strong>Livesov</strong> is better for targeted tracking with your specific keywords, getting real proof of AI responses, and measuring your GEO efforts with custom queries.</p>
`
  }));
});

// ===================== WEBSITE PAGES =====================

// About page
router.get('/about', (req, res) => {
  res.send(seoPage({
    title: 'About Livesov — AI Visibility Tracking Platform | Livesov',
    description: 'Learn about Livesov, the AI visibility tracking platform that helps brands monitor their presence across ChatGPT, Perplexity, Gemini, Claude, Grok, and Google AI Overviews.',
    keywords: 'about Livesov, AI visibility company, brand tracking platform, GEO optimization tool, who is Livesov',
    h1: 'About <span>Livesov</span>',
    subtitle: 'We help brands understand and improve their visibility in AI-generated answers across every major platform.',
    canonical: '/about',
    jsonLd: { "@context": "https://schema.org", "@type": "Organization", "name": "Livesov", "url": "https://livesov.com", "description": "AI visibility tracking platform for brands and agencies.", "foundingDate": "2026", "sameAs": ["https://x.com/livesov", "https://linkedin.com/company/livesov"] },
    content: `
<h2>Our Mission</h2>
<p>AI is transforming how people discover brands. When someone asks ChatGPT "What's the best CRM?" or Perplexity "Top-rated plumber near me," the AI's answer shapes their decision — often without a single Google click. Livesov exists to help brands track, measure, and improve their visibility in these AI-generated answers.</p>

<h2>The Problem We Solve</h2>
<p>Traditional SEO tools track Google rankings. But AI assistants don't have rankings — they generate answers from training data, web search, and knowledge graphs. There's no "position #1" in ChatGPT. The only way to know if an AI recommends your brand is to ask it — and that's exactly what Livesov does.</p>
<div class="highlight">
<p>Livesov queries 6 AI platforms with your custom keywords, captures the complete responses, and analyzes them for brand mentions, sentiment, and recommendations. Every response is saved as verifiable proof you can share with clients and stakeholders.</p>
</div>

<h2>What Makes Us Different</h2>
<ul>
<li>Purpose-built for AI visibility — not an add-on to a traditional SEO tool</li>
<li>Real API responses from 6 platforms: ChatGPT, Perplexity, Claude, Gemini, Grok & Google AI Overviews</li>
<li>Complete responses saved as verifiable proof</li>
<li>Custom keywords — you choose exactly what to track</li>
<li>Share of Voice measurement across all AI platforms</li>
<li>Built for agencies, local businesses, SaaS companies, and e-commerce brands</li>
</ul>

<h2>Our Team</h2>
<p>Livesov is built by a team of SEO practitioners, AI researchers, and product engineers who saw firsthand how AI was disrupting brand discovery. We built the tool we wished existed — simple, focused, and affordable.</p>

<h2>Get in Touch</h2>
<p>Have questions or want to learn more? <a href="/contact">Contact us</a> or reach out at <a href="mailto:hello@livesov.com">hello@livesov.com</a>. Follow us on <a href="https://x.com/livesov" target="_blank" rel="noopener noreferrer">X (Twitter)</a> and <a href="https://linkedin.com/company/livesov" target="_blank" rel="noopener noreferrer">LinkedIn</a>.</p>
`
  }));
});

// Pricing page
router.get('/pricing', (req, res) => {
  res.send(seoPage({
    title: 'Pricing — AI Visibility Tracking Plans | Livesov',
    description: 'Simple, transparent pricing for AI visibility tracking. Start free, upgrade as you grow. Track your brand across ChatGPT, Perplexity, Gemini, Claude, Grok, and Google AI Overviews.',
    keywords: 'Livesov pricing, AI visibility pricing, brand tracking pricing, GEO tool pricing, AI monitoring cost',
    h1: 'Simple, Transparent <span>Pricing</span>',
    subtitle: 'Start tracking your AI visibility for free. Upgrade when you need more keywords, platforms, and runs.',
    canonical: '/pricing',
    jsonLd: { "@context": "https://schema.org", "@type": "WebPage", "name": "Livesov Pricing", "description": "Simple, transparent pricing for AI visibility tracking.", "url": "https://livesov.com/pricing" },
    content: `
<h2>Free Plan</h2>
<div class="highlight">
<h3>$0/month — Get Started</h3>
<ul>
<li>5 tracked queries</li>
<li>Unlimited brands</li>
<li>2 AI platforms</li>
<li>Brand mention detection</li>
<li>Basic sentiment analysis</li>
<li>7-day response history</li>
</ul>
</div>

<h2>Pro Plan</h2>
<div class="highlight">
<h3>$29/month — Most Popular</h3>
<ul>
<li>25 keywords</li>
<li>All 6 AI platforms (ChatGPT, Perplexity, Claude, Gemini, Grok, Google AI Overviews)</li>
<li>Unlimited tracking runs</li>
<li>Advanced sentiment & recommendation analysis</li>
<li>Share of Voice measurement</li>
<li>CSV export for reporting</li>
<li>90-day response history</li>
<li>Brand alias support</li>
</ul>
</div>

<h2>Agency Plan</h2>
<div class="highlight">
<h3>$79/month — Built for Teams</h3>
<ul>
<li>100 keywords</li>
<li>All 6 AI platforms</li>
<li>Unlimited tracking runs</li>
<li>Multiple brand profiles</li>
<li>White-label reporting</li>
<li>Competitor tracking</li>
<li>Unlimited response history</li>
<li>Priority support</li>
<li>API access</li>
</ul>
</div>

<h2>Enterprise</h2>
<p>Need more keywords, custom integrations, or dedicated support? <a href="/contact">Contact us</a> for a custom plan tailored to your needs.</p>

<h2>Frequently Asked Questions</h2>
<h3>Can I change plans anytime?</h3>
<p>Yes. Upgrade, downgrade, or cancel at any time. No long-term contracts.</p>

<h3>Is there a free trial?</h3>
<p>Yes. Every new account starts with a 7-day free trial that includes all 6 AI platforms, 30 tracked queries, sentiment analysis, and scheduled runs — no credit card required. After 7 days you'll automatically drop to the Free plan unless you upgrade.</p>

<h3>What payment methods do you accept?</h3>
<p>We accept all major credit cards via Stripe. Enterprise customers can pay by invoice.</p>
`
  }));
});

// Contact page
router.get('/contact', (req, res) => {
  res.send(seoPage({
    title: 'Contact Us — Get in Touch with Livesov | Livesov',
    description: 'Contact the Livesov team. Get help with AI visibility tracking, request a demo, or ask about enterprise plans. We typically respond within 24 hours.',
    keywords: 'contact Livesov, Livesov support, AI visibility help, Livesov demo, Livesov enterprise',
    h1: 'Get in <span>Touch</span>',
    subtitle: 'Have a question, need help, or want to discuss enterprise plans? We\'d love to hear from you.',
    canonical: '/contact',
    jsonLd: { "@context": "https://schema.org", "@type": "ContactPage", "name": "Contact Livesov", "description": "Get in touch with the Livesov team.", "url": "https://livesov.com/contact", "mainEntity": { "@type": "Organization", "name": "Livesov", "email": "hello@livesov.com", "url": "https://livesov.com" } },
    content: `
<style>
.ct-grid{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin:0 -20px;}
@media(max-width:768px){.ct-grid{grid-template-columns:1fr;gap:28px;}}
.ct-form-wrap{background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:36px;box-shadow:0 4px 24px rgba(0,0,0,.04);}
.ct-form-title{font-size:20px;font-weight:800;color:var(--text);margin-bottom:4px;}
.ct-form-sub{font-size:14px;color:var(--muted);margin-bottom:28px;line-height:1.5;}
.ct-field{margin-bottom:20px;}
.ct-label{display:block;font-size:13px;font-weight:600;color:var(--text);margin-bottom:6px;letter-spacing:.2px;}
.ct-input,.ct-select,.ct-textarea{
  display:block;width:100%;padding:12px 16px;font-family:var(--font);font-size:14px;
  color:var(--text);background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);
  transition:border-color .2s,box-shadow .2s;outline:none;
}
.ct-input:focus,.ct-select:focus,.ct-textarea:focus{
  border-color:var(--primary);box-shadow:0 0 0 3px rgba(255,97,84,.1);
}
.ct-input::placeholder,.ct-textarea::placeholder{color:#b0b0b0;}
.ct-select{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M6 8.5L1 3.5h10z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;padding-right:36px;cursor:pointer;}
.ct-select option{padding:8px;}
.ct-textarea{min-height:130px;resize:vertical;line-height:1.6;}
.ct-btn{
  display:block;width:100%;padding:14px 24px;font-family:var(--font);font-size:15px;font-weight:700;
  border:none;background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff;
  border-radius:var(--radius-sm);cursor:pointer;transition:all .2s;
  box-shadow:0 2px 8px rgba(255,97,84,.25);letter-spacing:.3px;
}
.ct-btn:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(255,97,84,.3);}
.ct-btn:active{transform:translateY(0);}
.ct-info{display:flex;flex-direction:column;gap:20px;}
.ct-card{
  background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);
  padding:28px;transition:all .2s;box-shadow:0 2px 12px rgba(0,0,0,.03);
  position:relative;overflow:hidden;
}
.ct-card::before{
  content:'';position:absolute;top:0;left:0;width:4px;height:100%;
  background:linear-gradient(180deg,var(--primary),var(--accent));border-radius:4px 0 0 4px;
}
.ct-card:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,.06);}
.ct-card-icon{
  width:42px;height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;
  font-size:20px;margin-bottom:14px;background:linear-gradient(135deg,rgba(255,97,84,.08),rgba(99,102,241,.08));
}
.ct-card-title{font-size:16px;font-weight:700;color:var(--text);margin-bottom:4px;}
.ct-card-desc{font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:10px;}
.ct-card-email{
  display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:600;
  color:var(--primary);text-decoration:none;transition:color .15s;
}
.ct-card-email:hover{color:var(--accent);text-decoration:none;}
.ct-social{
  display:flex;gap:12px;margin-top:8px;
}
.ct-social a{
  display:flex;align-items:center;gap:8px;padding:10px 18px;
  background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);
  font-size:13px;font-weight:600;color:var(--text);text-decoration:none;transition:all .2s;
}
.ct-social a:hover{border-color:var(--primary);color:var(--primary);transform:translateY(-1px);text-decoration:none;}
.ct-response{
  display:flex;align-items:center;gap:10px;padding:14px 18px;
  background:linear-gradient(135deg,rgba(16,185,129,.06),rgba(16,185,129,.02));
  border:1px solid rgba(16,185,129,.15);border-radius:var(--radius-sm);
  font-size:13px;color:var(--muted);margin-top:4px;
}
.ct-response-dot{width:8px;height:8px;background:var(--success);border-radius:50%;flex-shrink:0;animation:ct-pulse 2s infinite;}
@keyframes ct-pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
</style>

<div class="ct-grid">
  <div class="ct-form-wrap">
    <div class="ct-form-title">Send Us a Message</div>
    <div class="ct-form-sub">Fill in the form and we'll get back to you as soon as possible.</div>
    <form id="ct-form" onsubmit="return handleContactSubmit(event)">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div class="ct-field">
          <label class="ct-label" for="ct-name">Full Name</label>
          <input class="ct-input" id="ct-name" type="text" placeholder="John Doe" required>
        </div>
        <div class="ct-field">
          <label class="ct-label" for="ct-email">Email Address</label>
          <input class="ct-input" id="ct-email" type="email" placeholder="john@example.com" required>
        </div>
      </div>
      <div class="ct-field">
        <label class="ct-label" for="ct-subject">Subject</label>
        <input class="ct-input" id="ct-subject" type="text" placeholder="How can we help?" required>
      </div>
      <div class="ct-field">
        <label class="ct-label" for="ct-type">Inquiry Type</label>
        <select class="ct-select" id="ct-type" required>
          <option value="" disabled selected>Select an inquiry type</option>
          <option value="general">General Question</option>
          <option value="support">Technical Support</option>
          <option value="billing">Billing & Account</option>
          <option value="enterprise">Enterprise Plans</option>
          <option value="partnership">Partnership Inquiry</option>
          <option value="demo">Request a Demo</option>
          <option value="feedback">Feedback & Suggestions</option>
        </select>
      </div>
      <div class="ct-field">
        <label class="ct-label" for="ct-message">Message</label>
        <textarea class="ct-textarea" id="ct-message" placeholder="Tell us more about your inquiry (at least 20 characters)..." minlength="20" required></textarea>
      </div>
      <button type="submit" class="ct-btn">Send Message</button>
    </form>
  </div>

  <div class="ct-info">
    <div class="ct-card">
      <div class="ct-card-icon">&#9993;</div>
      <div class="ct-card-title">General Support</div>
      <div class="ct-card-desc">For questions about your account, billing, features, or getting started with Livesov.</div>
      <a class="ct-card-email" href="mailto:hello@livesov.com">hello@livesov.com &#8594;</a>
    </div>
    <div class="ct-card">
      <div class="ct-card-icon">&#127970;</div>
      <div class="ct-card-title">Enterprise Sales</div>
      <div class="ct-card-desc">For custom plans, volume pricing, API access, and dedicated enterprise features.</div>
      <a class="ct-card-email" href="mailto:enterprise@livesov.com">enterprise@livesov.com &#8594;</a>
    </div>
    <div class="ct-card">
      <div class="ct-card-icon">&#129309;</div>
      <div class="ct-card-title">Partnerships</div>
      <div class="ct-card-desc">For integration partnerships, reseller opportunities, and co-marketing initiatives.</div>
      <a class="ct-card-email" href="mailto:hello@livesov.com">hello@livesov.com &#8594;</a>
    </div>

    <div class="ct-response">
      <span class="ct-response-dot"></span>
      We typically respond within 24 hours on business days
    </div>

    <div>
      <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:10px;">Follow Us</div>
      <div class="ct-social">
        <a href="https://x.com/livesov" target="_blank" rel="noopener noreferrer">&#120143; &nbsp;X (Twitter)</a>
        <a href="https://linkedin.com/company/livesov" target="_blank" rel="noopener noreferrer">in &nbsp;LinkedIn</a>
      </div>
    </div>
  </div>
</div>

<script>
function handleContactSubmit(e) {
  e.preventDefault();
  var name = document.getElementById('ct-name').value.trim();
  var email = document.getElementById('ct-email').value.trim();
  var subject = document.getElementById('ct-subject').value.trim();
  var type = document.getElementById('ct-type').value;
  var message = document.getElementById('ct-message').value.trim();
  if (message.length < 20) { alert('Please write at least 20 characters in your message.'); return false; }
  var body = 'Name: ' + name + '\\nEmail: ' + email + '\\nInquiry Type: ' + type + '\\n\\n' + message;
  var mailto = 'mailto:hello@livesov.com?subject=' + encodeURIComponent('[' + type + '] ' + subject) + '&body=' + encodeURIComponent(body);
  window.location.href = mailto;
  var btn = document.querySelector('.ct-btn');
  btn.textContent = 'Opening email client...';
  btn.style.opacity = '0.7';
  setTimeout(function(){ btn.textContent = 'Send Message'; btn.style.opacity = '1'; }, 3000);
  return false;
}
</script>
`
  }));
});

// Blog page
router.get('/blog', (req, res) => {
  res.send(seoPage({
    title: 'Blog — AI Visibility Insights, GEO Tips & Product Updates | Livesov',
    description: 'Learn about AI visibility tracking, Generative Engine Optimization (GEO), and how to get your brand mentioned by ChatGPT, Perplexity, Gemini, and other AI platforms.',
    keywords: 'AI visibility blog, GEO blog, generative engine optimization tips, AI brand tracking insights, ChatGPT optimization blog',
    h1: 'Livesov <span>Blog</span>',
    subtitle: 'AI visibility insights, GEO strategies, and product updates to help your brand get discovered by AI.',
    canonical: '/blog',
    jsonLd: { "@context": "https://schema.org", "@type": "Blog", "name": "Livesov Blog", "description": "AI visibility insights and GEO strategies.", "url": "https://livesov.com/blog", "publisher": { "@type": "Organization", "name": "Livesov", "url": "https://livesov.com" } },
    content: `
<h2>Featured Articles</h2>

<div class="highlight">
<h3><a href="/geo-optimization">The Complete Guide to Generative Engine Optimization (GEO)</a></h3>
<p>Everything you need to know about optimizing your brand for AI-generated answers. Learn what GEO is, why it matters, and how to improve your AI visibility across all platforms.</p>
</div>

<div class="highlight">
<h3><a href="/methodology">Our Tracking Methodology</a></h3>
<p>How Livesov queries AI platforms, detects brand mentions, and measures Share of Voice. A transparent look at our approach to AI visibility tracking.</p>
</div>

<h2>AI Platform Guides</h2>
<ul>
<li><a href="/chatgpt-brand-tracking">How to Track Your Brand in ChatGPT</a> — Monitor what OpenAI's ChatGPT says about your brand</li>
<li><a href="/perplexity-brand-tracking">How to Track Your Brand in Perplexity AI</a> — Track citations and mentions in Perplexity's search-grounded answers</li>
<li><a href="/gemini-brand-tracking">How to Track Your Brand in Google Gemini & AI Overviews</a> — Monitor Google's AI-powered search</li>
<li><a href="/claude-brand-tracking">How to Track Your Brand in Claude AI</a> — See what Anthropic's Claude says about you</li>
<li><a href="/grok-brand-tracking">How to Track Your Brand in Grok (xAI)</a> — Monitor your visibility on X's AI assistant</li>
<li><a href="/google-ai-overviews-tracking">How to Track Your Brand in Google AI Overviews</a> — Track your presence in AI-generated search summaries</li>
</ul>

<h2>Comparisons</h2>
<ul>
<li><a href="/vs/semrush">Livesov vs Semrush</a> — How purpose-built AI tracking compares to traditional SEO suites</li>
<li><a href="/vs/ahrefs">Livesov vs Ahrefs Brand Radar</a> — Real-time custom tracking vs static dataset analysis</li>
</ul>

<h2>Use Cases</h2>
<p>See how different industries use AI visibility tracking in our <a href="/use-cases">Use Cases</a> page.</p>

<p style="margin-top:40px;"><em>More articles coming soon. Follow us on <a href="https://x.com/livesov" target="_blank" rel="noopener noreferrer">X (Twitter)</a> for the latest updates.</em></p>
`
  }));
});

// How It Works page
router.get('/how-it-works', (req, res) => {
  res.send(seoPage({
    title: 'How It Works — AI Visibility Tracking in 3 Steps | Livesov',
    description: 'Learn how Livesov tracks your brand across 6 AI platforms. Add keywords, run tracking, and see exactly what AI says about your brand — in 3 simple steps.',
    keywords: 'how Livesov works, AI visibility tracking process, brand tracking steps, how to track AI mentions, AI monitoring how it works',
    h1: 'How <span>Livesov</span> Works',
    subtitle: 'Track your brand\'s AI visibility in 3 simple steps. No technical setup required.',
    canonical: '/how-it-works',
    jsonLd: { "@context": "https://schema.org", "@type": "HowTo", "name": "How to Track Your Brand in AI Platforms with Livesov", "description": "Track your brand's AI visibility in 3 simple steps.", "url": "https://livesov.com/how-it-works", "step": [{ "@type": "HowToStep", "position": 1, "name": "Add Your Keywords", "text": "Enter the questions your customers ask AI assistants." }, { "@type": "HowToStep", "position": 2, "name": "Run Tracking", "text": "Livesov queries 6 AI platforms with your keywords via official APIs." }, { "@type": "HowToStep", "position": 3, "name": "See Results", "text": "View brand mentions, sentiment, Share of Voice, and full AI responses as proof." }] },
    content: `
<h2>Step 1: Add Your Keywords</h2>
<div class="highlight">
<p>Enter the questions your customers ask AI assistants. Think about what someone would type into ChatGPT or Perplexity when looking for products or services like yours.</p>
<p><strong>Examples:</strong></p>
<ul>
<li>"Best HVAC company in Austin TX"</li>
<li>"Top rated CRM for small business"</li>
<li>"Which email marketing tool is best for startups?"</li>
<li>"Recommend a good plumber near downtown Chicago"</li>
</ul>
</div>

<h2>Step 2: Run Tracking</h2>
<div class="highlight">
<p>Click "Run Tracking" and Livesov queries up to 6 AI platforms simultaneously using their official APIs:</p>
<ul>
<li><a href="/chatgpt-brand-tracking">ChatGPT</a> (OpenAI API)</li>
<li><a href="/perplexity-brand-tracking">Perplexity AI</a> (Sonar Pro API with search grounding)</li>
<li><a href="/gemini-brand-tracking">Google Gemini</a> (Gemini API)</li>
<li><a href="/claude-brand-tracking">Claude AI</a> (Anthropic API)</li>
<li><a href="/grok-brand-tracking">Grok</a> (xAI API)</li>
<li><a href="/google-ai-overviews-tracking">Google AI Overviews</a> (DataForSEO API)</li>
</ul>
<p>Each query takes 10-30 seconds. Responses are captured in full — nothing is truncated or modified.</p>
</div>

<h2>Step 3: See Results</h2>
<div class="highlight">
<p>For each AI response, Livesov automatically analyzes:</p>
<ul>
<li><strong>Brand Mentions</strong> — Does the AI mention your brand (including aliases)?</li>
<li><strong>Sentiment</strong> — Is the mention positive, negative, or neutral?</li>
<li><strong>Recommendations</strong> — Does the AI actively recommend your brand?</li>
<li><strong>Share of Voice</strong> — What percentage of responses mention you vs competitors?</li>
<li><strong>Citations</strong> — For Perplexity, which sources are cited?</li>
</ul>
</div>

<h2>What You Can Do With Results</h2>
<ul>
<li>Export full responses as CSV for client reporting</li>
<li>Track changes over time with historical data</li>
<li>Compare your visibility across different AI platforms</li>
<li>Identify which keywords get your brand mentioned</li>
<li>Measure the impact of your GEO optimization efforts</li>
<li>Share verifiable proof with clients and stakeholders</li>
</ul>

<h2>Built for Everyone</h2>
<p>No technical setup needed. Sign up, add keywords, and start tracking in under 2 minutes. Livesov is used by <a href="/use-cases">local businesses, SEO agencies, SaaS companies, and e-commerce brands</a> of all sizes.</p>
`
  }));
});

// Use Cases page
router.get('/use-cases', (req, res) => {
  res.send(seoPage({
    title: 'Use Cases — AI Visibility Tracking for Every Industry | Livesov',
    description: 'See how local businesses, SEO agencies, SaaS companies, and e-commerce brands use Livesov to track and improve their AI visibility.',
    keywords: 'AI visibility use cases, brand tracking use cases, GEO for local business, AI tracking for agencies, SaaS AI visibility, e-commerce AI tracking',
    h1: 'AI Visibility Tracking <span>Use Cases</span>',
    subtitle: 'See how businesses across industries use Livesov to monitor and improve their presence in AI-generated answers.',
    canonical: '/use-cases',
    jsonLd: { "@context": "https://schema.org", "@type": "WebPage", "name": "Livesov Use Cases", "description": "How businesses use AI visibility tracking across industries.", "url": "https://livesov.com/use-cases" },
    content: `
<h2>Local Businesses</h2>
<div class="highlight">
<h3>HVAC, Plumbers, Dentists, Lawyers, Restaurants & More</h3>
<p>When someone asks ChatGPT "Best plumber in Denver" or Perplexity "Top-rated dentist near me," does the AI recommend your business? Local businesses depend on word-of-mouth — and AI is becoming the new word-of-mouth.</p>
<p><strong>How they use Livesov:</strong></p>
<ul>
<li>Track location-specific keywords ("best [service] in [city]")</li>
<li>Monitor if AI recommends them over local competitors</li>
<li>Measure impact of review-building campaigns on AI visibility</li>
<li>Share AI mention proof with business owners</li>
</ul>
</div>

<h2>SEO & Marketing Agencies</h2>
<div class="highlight">
<h3>Add AI Visibility to Your Service Offering</h3>
<p>Your clients are asking about AI visibility. Offer it as a service with Livesov. Track AI mentions across 6 platforms, generate client-ready reports, and prove ROI on GEO campaigns.</p>
<p><strong>How they use Livesov:</strong></p>
<ul>
<li>Track AI visibility for multiple clients from one account</li>
<li>Export CSV reports with full AI responses as proof</li>
<li>Show clients before/after AI mention data</li>
<li>Upsell GEO optimization based on tracking data</li>
<li>Differentiate from competitors who only offer traditional SEO</li>
</ul>
</div>

<h2>SaaS Companies</h2>
<div class="highlight">
<h3>Monitor Product Recommendations in AI</h3>
<p>When developers ask ChatGPT "Best project management tool" or Perplexity "Top CRM for startups," does AI recommend your product? For SaaS, AI mentions can drive significant consideration.</p>
<p><strong>How they use Livesov:</strong></p>
<ul>
<li>Track category keywords ("best [category] tool")</li>
<li>Monitor competitor mentions alongside their own</li>
<li>Measure Share of Voice across AI platforms</li>
<li>Track impact of PR, content marketing, and review campaigns</li>
<li>Report AI visibility metrics to leadership</li>
</ul>
</div>

<h2>E-Commerce Brands</h2>
<div class="highlight">
<h3>Get Your Products Recommended by AI</h3>
<p>Shoppers increasingly ask AI for product recommendations. "Best running shoes under $150" or "Top wireless headphones 2026" — these queries drive buying decisions. Track if AI recommends your products.</p>
<p><strong>How they use Livesov:</strong></p>
<ul>
<li>Track product-specific keywords across AI platforms</li>
<li>Monitor seasonal trends in AI recommendations</li>
<li>Compare AI visibility against category competitors</li>
<li>Optimize product listings based on what AI surfaces</li>
</ul>
</div>

<h2>Get Started</h2>
<p>No matter your industry, if customers can ask AI about your category, you need to know what AI says. <a href="/signup">Start tracking for free</a> — no credit card required.</p>
`
  }));
});

// Integrations page
router.get('/integrations', (req, res) => {
  res.send(seoPage({
    title: 'AI Platform Integrations — 6 Platforms Tracked | Livesov',
    description: 'Livesov tracks your brand across 6 AI platforms: ChatGPT, Perplexity, Google Gemini, Claude, Grok, and Google AI Overviews. All via official APIs.',
    keywords: 'AI platform integrations, ChatGPT tracking, Perplexity tracking, Gemini tracking, Claude tracking, Grok tracking, AI visibility platforms',
    h1: 'Track <span>6 AI Platforms</span> in One Dashboard',
    subtitle: 'Livesov integrates with every major AI assistant via their official APIs. See what each one says about your brand.',
    canonical: '/integrations',
    jsonLd: { "@context": "https://schema.org", "@type": "WebPage", "name": "Livesov AI Platform Integrations", "description": "Track your brand across 6 AI platforms in one dashboard.", "url": "https://livesov.com/integrations" },
    content: `
<h2>Supported AI Platforms</h2>

<div class="highlight">
<h3><a href="/chatgpt-brand-tracking">ChatGPT (OpenAI)</a></h3>
<p>The world's most popular AI assistant with 200M+ weekly users. Livesov uses the official OpenAI API (GPT-4o-mini) to query ChatGPT and capture complete responses. Track if ChatGPT recommends your brand when users ask for suggestions.</p>
</div>

<div class="highlight">
<h3><a href="/perplexity-brand-tracking">Perplexity AI</a></h3>
<p>The AI-powered search engine that provides cited, real-time answers. Livesov uses the Perplexity Sonar Pro API with search grounding enabled — responses include citations and source URLs, just like what users see on perplexity.ai.</p>
</div>

<div class="highlight">
<h3><a href="/gemini-brand-tracking">Google Gemini</a></h3>
<p>Google's AI assistant powered by the Gemini model family. Livesov queries Gemini 2.0 Flash for AI assistant-style responses. See if Google's AI recommends your brand.</p>
</div>

<div class="highlight">
<h3><a href="/claude-brand-tracking">Claude (Anthropic)</a></h3>
<p>Known for thoughtful, nuanced responses. Livesov uses the official Anthropic API (Claude Sonnet) to track how Claude describes and recommends your brand.</p>
</div>

<div class="highlight">
<h3><a href="/grok-brand-tracking">Grok (xAI)</a></h3>
<p>Integrated into X (Twitter) with access to real-time social data. Livesov uses the official xAI API (Grok-3-mini) to track your brand's visibility on X's AI assistant.</p>
</div>

<div class="highlight">
<h3><a href="/google-ai-overviews-tracking">Google AI Overviews</a></h3>
<p>AI-generated summaries that appear above organic Google search results. Livesov uses the DataForSEO API to capture AI Overview content and detect whether your brand is featured in these high-visibility search summaries.</p>
</div>

<h2>Why Official APIs Matter</h2>
<p>Livesov uses official APIs from each platform — not web scraping or screenshots. This means:</p>
<ul>
<li>Responses are reliable and reproducible</li>
<li>Complete response text is captured — nothing truncated</li>
<li>Model name, timestamp, and metadata are recorded</li>
<li>Results match what real users see on each platform</li>
<li>Responses serve as verifiable proof for reporting</li>
</ul>
`
  }));
});

// Changelog page
router.get('/changelog', (req, res) => {
  res.send(seoPage({
    title: 'Changelog — Product Updates & New Features | Livesov',
    description: 'See the latest Livesov product updates, new features, and improvements. We ship fast and share every update here.',
    keywords: 'Livesov changelog, Livesov updates, Livesov new features, AI visibility tracker updates, Livesov product updates',
    h1: 'Product <span>Changelog</span>',
    subtitle: 'Every update, feature, and improvement we ship. We build in public and share it all here.',
    canonical: '/changelog',
    jsonLd: { "@context": "https://schema.org", "@type": "WebPage", "name": "Livesov Changelog", "description": "Product updates and new features from Livesov.", "url": "https://livesov.com/changelog" },
    content: `
<h2>March 2026</h2>

<div class="highlight">
<h3>March 24 — Website Pages Launch</h3>
<ul>
<li>Added standalone Pricing, About, Contact, Blog, How It Works, Use Cases, Integrations, and Changelog pages</li>
<li>Updated site navigation and footer with links to all new pages</li>
<li>Improved sitemap with all page URLs</li>
</ul>
</div>

<div class="highlight">
<h3>March 20 — SEO & Content Pages</h3>
<ul>
<li>Launched platform-specific landing pages for ChatGPT, Perplexity, Gemini, Claude, and Grok tracking</li>
<li>Published GEO Optimization Guide</li>
<li>Added comparison pages: Livesov vs Semrush, Livesov vs Ahrefs Brand Radar</li>
<li>Added Methodology page explaining our tracking approach</li>
<li>Added Privacy Policy, Terms of Service, and Cookie Policy pages</li>
</ul>
</div>

<div class="highlight">
<h3>March 15 — Core Platform</h3>
<ul>
<li>Multi-platform AI tracking: ChatGPT, Perplexity, Claude, Gemini, Grok & Google AI Overviews</li>
<li>Brand mention detection with alias support</li>
<li>Sentiment analysis (positive, negative, neutral)</li>
<li>Recommendation detection</li>
<li>Share of Voice measurement</li>
<li>CSV export for reporting</li>
<li>Response history with full AI answers as proof</li>
<li>Location-aware keyword tracking</li>
</ul>
</div>

<div class="highlight">
<h3>March 7 — Launch</h3>
<ul>
<li>Livesov launches with ChatGPT and Perplexity tracking</li>
<li>Free tier with 5 tracked queries and unlimited brands</li>
<li>Pro plan with 100 tracked queries</li>
</ul>
</div>

<p style="margin-top:40px;"><em>Follow us on <a href="https://x.com/livesov" target="_blank" rel="noopener noreferrer">X (Twitter)</a> for real-time updates.</em></p>
`
  }));
});

module.exports = router;
