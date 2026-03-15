/**
 * SEO landing pages — platform-specific and educational content
 */
const express = require('express');
const router  = express.Router();

// Escape HTML attribute values to prevent injection
function escAttr(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function seoPage({ title, description, keywords, h1, subtitle, content, canonical }) {
  // Escape attribute-context values (title, description, keywords, canonical)
  const safeTitle = escAttr(title);
  const safeDesc = escAttr(description);
  const safeKeywords = escAttr(keywords);
  const safeCanonical = escAttr(canonical);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle}</title>
<meta name="description" content="${safeDesc}">
<meta name="keywords" content="${safeKeywords}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://trackly.so${safeCanonical}">
<meta property="og:type" content="website">
<meta property="og:url" content="https://trackly.so${safeCanonical}">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDesc}">
<meta property="og:site_name" content="Trackly">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDesc}">
<meta name="theme-color" content="#FF6154">
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
  <a href="/" class="seo-nav-logo">Track<span>ly</span></a>
  <div class="seo-nav-links">
    <a href="/#features">Features</a>
    <a href="/#pricing">Pricing</a>
    <a href="/#faq">FAQ</a>
    <a href="/chatgpt-brand-tracking">ChatGPT</a>
    <a href="/perplexity-brand-tracking">Perplexity</a>
    <a href="/gemini-brand-tracking">Gemini</a>
  </div>
  <div class="seo-nav-right"></div>
</nav>
</header>
<main>
<section class="seo-hero" aria-label="Hero">
  <h1>${h1}</h1>
  <p>${subtitle}</p>
</section>
<article class="seo-content">
${content}
</article>
<section class="seo-cta" aria-label="Call to action">
  <h2>Ready to track your AI visibility?</h2>
  <p>Monitor your brand across ChatGPT, Perplexity, Claude, Gemini, Grok, Google AIO, DeepSeek & Mistral.</p>
</section>
</main>
<footer class="seo-footer">
  <div class="seo-footer-text">&copy; 2026 Trackly — AI Visibility Tracker</div>
  <div class="seo-footer-links">
    <a href="/">Home</a>
    <a href="/#features">Features</a>
    <a href="/#pricing">Pricing</a>
    <a href="/chatgpt-brand-tracking">ChatGPT Tracking</a>
    <a href="/perplexity-brand-tracking">Perplexity Tracking</a>
    <a href="/gemini-brand-tracking">Gemini Tracking</a>
    <a href="/geo-optimization">GEO Guide</a>
  </div>
</footer>
</body></html>`;
}

// ChatGPT landing page
router.get('/chatgpt-brand-tracking', (req, res) => {
  res.send(seoPage({
    title: 'ChatGPT Brand Tracking — Monitor Your Brand Mentions in ChatGPT | Trackly',
    description: 'Track how ChatGPT mentions your brand. See real OpenAI API responses, measure share of voice, and get proof of your brand visibility in ChatGPT answers.',
    keywords: 'ChatGPT brand tracking, ChatGPT brand monitoring, track brand in ChatGPT, ChatGPT mentions, ChatGPT SEO, ChatGPT visibility',
    h1: 'Track Your Brand in <span>ChatGPT</span>',
    subtitle: 'See exactly how ChatGPT answers questions about your industry and whether it recommends your brand. Real API responses, real proof.',
    canonical: '/chatgpt-brand-tracking',
    content: `
<h2>Why Track Your Brand in ChatGPT?</h2>
<p>ChatGPT has over 200 million weekly active users. When someone asks "What's the best [your industry] company?", does ChatGPT mention your brand? If not, you're missing out on one of the most influential recommendation engines in the world.</p>
<p>Trackly queries ChatGPT using the official OpenAI API with your custom keywords and captures the complete, unmodified response. You see exactly what ChatGPT says — no screenshots, no guessing.</p>

<h2>How ChatGPT Brand Tracking Works</h2>
<div class="highlight">
<h3>1. Add Your Keywords</h3>
<p>Enter the questions your customers ask — e.g., "Best HVAC company in Austin TX", "Top rated plumber near me", "Which CRM is best for small business?"</p>
<h3>2. Run Tracking</h3>
<p>Trackly sends your queries to ChatGPT via the official OpenAI API and captures the full response.</p>
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
<p>Unlike Google where you can see your position in search results, ChatGPT has no "ranking page." The only way to know if ChatGPT recommends you is to ask it — and that's exactly what Trackly does.</p>

<h2>Who Needs ChatGPT Tracking?</h2>
<p><strong>Local businesses</strong> — HVAC, plumbers, dentists, lawyers, restaurants. When locals ask ChatGPT for recommendations, are you there?</p>
<p><strong>SEO agencies</strong> — Offer AI visibility tracking as a service. Show clients real proof of their ChatGPT presence.</p>
<p><strong>SaaS companies</strong> — Monitor if ChatGPT recommends your product when users ask for solutions in your category.</p>
`
  }));
});

// Perplexity landing page
router.get('/perplexity-brand-tracking', (req, res) => {
  res.send(seoPage({
    title: 'Perplexity Brand Tracking — Monitor Brand Mentions in Perplexity AI | Trackly',
    description: 'Track how Perplexity AI mentions and cites your brand. See real search-grounded responses with citations, measure visibility, and export proof.',
    keywords: 'Perplexity brand tracking, Perplexity brand monitoring, track brand in Perplexity, Perplexity AI mentions, Perplexity SEO, Perplexity visibility',
    h1: 'Track Your Brand in <span>Perplexity AI</span>',
    subtitle: 'Perplexity is the fastest-growing AI search engine. See if it mentions and cites your brand with real, search-grounded responses.',
    canonical: '/perplexity-brand-tracking',
    content: `
<h2>Why Perplexity Matters for Your Brand</h2>
<p>Perplexity AI is an AI-powered search engine that provides cited, real-time answers. Unlike ChatGPT which relies on training data, Perplexity actively searches the web — making it a direct competitor to Google for informational queries.</p>
<p>When Perplexity answers "What's the best [product] in [category]?", it pulls from live web data and provides citations. If your brand appears in these answers with a citation to your website, that's high-value visibility.</p>

<h2>How Perplexity Tracking Works</h2>
<div class="highlight">
<p>Trackly uses the Perplexity Sonar Pro API with search grounding enabled. This means the responses you see in Trackly match what users see on perplexity.ai — real-time, web-grounded answers with citations.</p>
</div>

<h2>What Makes Perplexity Different</h2>
<ul>
<li>Search-grounded responses with real-time web data</li>
<li>Citations and source URLs in every answer</li>
<li>Growing market share as a Google alternative</li>
<li>Higher commercial intent than ChatGPT queries</li>
<li>Trackly captures all citations from Perplexity responses</li>
</ul>

<h2>Optimize for Perplexity</h2>
<p>Perplexity pulls from web content, reviews, and authoritative sources. To improve your Perplexity visibility:</p>
<ul>
<li>Build authoritative content that Perplexity can cite</li>
<li>Get mentioned on review sites and industry directories</li>
<li>Ensure your website is crawlable by AI bots</li>
<li>Track your mentions regularly with Trackly to measure progress</li>
</ul>
`
  }));
});

// Gemini landing page
router.get('/gemini-brand-tracking', (req, res) => {
  res.send(seoPage({
    title: 'Google Gemini & AI Overview Brand Tracking — Monitor AI Visibility | Trackly',
    description: 'Track how Google Gemini and Google AI Overview mention your brand. Monitor your visibility in Google\'s AI-powered search with real API responses.',
    keywords: 'Gemini brand tracking, Google AI Overview tracking, Google AIO monitoring, Gemini brand monitoring, Google AI visibility, AIO brand tracking',
    h1: 'Track Your Brand in <span>Google Gemini & AI Overview</span>',
    subtitle: 'Google AI Overview appears above traditional search results. Gemini is Google\'s AI assistant. Track your brand visibility in both.',
    canonical: '/gemini-brand-tracking',
    content: `
<h2>Google AI is Changing Search</h2>
<p>Google AI Overview (AIO) now appears at the top of search results for millions of queries, pushing traditional organic results below the fold. If your brand isn't mentioned in the AI Overview, your organic rankings matter less than ever.</p>
<p>Trackly tracks both <strong>Google Gemini</strong> (the standalone AI assistant) and <strong>Google AI Overview</strong> (the AI-powered search feature) using Google's official API with search grounding enabled.</p>

<h2>Why Google AIO Tracking is Critical</h2>
<ul>
<li>AI Overview appears above all organic results on Google</li>
<li>Users increasingly rely on AI summaries instead of clicking links</li>
<li>Your SEO rankings don't guarantee AI Overview mentions</li>
<li>Gemini with Google Search grounding provides cited answers</li>
<li>Trackly extracts grounding citations from Gemini responses</li>
</ul>

<h2>What Trackly Tracks</h2>
<div class="highlight">
<h3>Google Gemini</h3>
<p>Queries the Gemini 2.0 Flash model for AI assistant-style responses. Tracks if your brand appears when users ask Gemini for recommendations.</p>
<h3>Google AI Overview (AIO)</h3>
<p>Queries Gemini with Google Search grounding enabled — replicating the AI Overview experience. Captures grounding citations and source URLs.</p>
</div>

<h2>Optimize for Google AI</h2>
<p>Google's AI pulls from its search index, Knowledge Graph, and web data. To improve your AI Overview visibility:</p>
<ul>
<li>Maintain strong traditional SEO fundamentals</li>
<li>Get featured in Google's Knowledge Graph</li>
<li>Build authority through reviews, citations, and backlinks</li>
<li>Create comprehensive, well-structured content</li>
<li>Track your AI visibility with Trackly to measure what works</li>
</ul>
`
  }));
});

// Claude landing page
router.get('/claude-brand-tracking', (req, res) => {
  res.send(seoPage({
    title: 'Claude Brand Tracking — Monitor Brand Mentions in Claude AI | Trackly',
    description: 'Track how Anthropic\'s Claude AI mentions your brand. See real API responses, sentiment analysis, and proof of visibility.',
    keywords: 'Claude brand tracking, Claude AI monitoring, Anthropic Claude tracking, Claude brand visibility, Claude AI mentions',
    h1: 'Track Your Brand in <span>Claude AI</span>',
    subtitle: 'Claude by Anthropic is used by millions for research and recommendations. See if it mentions your brand.',
    canonical: '/claude-brand-tracking',
    content: `
<h2>Why Track Your Brand in Claude?</h2>
<p>Claude by Anthropic is one of the most trusted AI assistants, known for thoughtful, nuanced responses. Businesses, researchers, and consumers use Claude daily for recommendations and research. Trackly monitors your brand's presence in Claude's responses using the official Anthropic API.</p>

<h2>What You Get</h2>
<ul>
<li>Real Claude API responses (Claude Sonnet model)</li>
<li>Brand mention detection across all name variations</li>
<li>Sentiment and recommendation analysis</li>
<li>Full response saved as verifiable proof</li>
<li>Historical tracking and SOV measurement</li>
</ul>
`
  }));
});

// Grok landing page
router.get('/grok-brand-tracking', (req, res) => {
  res.send(seoPage({
    title: 'Grok Brand Tracking — Monitor Brand Mentions in Grok (xAI) | Trackly',
    description: 'Track how xAI\'s Grok mentions your brand. Monitor your visibility on X/Twitter\'s AI assistant with real API responses.',
    keywords: 'Grok brand tracking, Grok AI monitoring, xAI Grok tracking, Grok brand visibility, X AI tracking',
    h1: 'Track Your Brand in <span>Grok (xAI)</span>',
    subtitle: 'Grok powers AI on X (Twitter) and is used by millions. Track if it recommends your brand.',
    canonical: '/grok-brand-tracking',
    content: `
<h2>Why Track Grok?</h2>
<p>Grok by xAI is integrated into X (Twitter) and has access to real-time social data. When users ask Grok for recommendations, it draws from both its training data and live social signals. Trackly monitors your brand's visibility in Grok responses using the official xAI API.</p>

<h2>What You Get</h2>
<ul>
<li>Real Grok API responses (Grok-3-mini model)</li>
<li>Brand mention and recommendation detection</li>
<li>Sentiment analysis of how Grok describes your brand</li>
<li>Evidence export for client reporting</li>
</ul>
`
  }));
});

// GEO guide page
router.get('/geo-optimization', (req, res) => {
  res.send(seoPage({
    title: 'Generative Engine Optimization (GEO) Guide — How to Get Your Brand Mentioned by AI | Trackly',
    description: 'Learn about Generative Engine Optimization (GEO) and Answer Engine Optimization (AEO). Understand how to optimize your brand for AI search engines like ChatGPT, Perplexity, and Google AI Overview.',
    keywords: 'generative engine optimization, GEO, answer engine optimization, AEO, AI SEO, LLM optimization, LLMO, AI search optimization, how to rank in ChatGPT, how to appear in AI answers',
    h1: 'Generative Engine Optimization <span>(GEO)</span> Guide',
    subtitle: 'The complete guide to making your brand visible in AI-generated answers. Also known as Answer Engine Optimization (AEO) or LLM Optimization (LLMO).',
    canonical: '/geo-optimization',
    content: `
<h2>What is Generative Engine Optimization (GEO)?</h2>
<p>Generative Engine Optimization (GEO) is the practice of optimizing your brand's online presence to appear more frequently and positively in AI-generated answers. While traditional SEO focuses on ranking in Google search results, GEO focuses on being mentioned and recommended by AI assistants like ChatGPT, Perplexity, Claude, Gemini, and Google AI Overview.</p>

<h2>GEO vs Traditional SEO</h2>
<div class="highlight">
<p><strong>Traditional SEO:</strong> Optimize for Google's algorithm to rank higher in search results. Users click links to visit your site.</p>
<p><strong>GEO / AEO:</strong> Optimize for AI models to mention and recommend your brand in generated answers. Users get recommendations directly from AI — no click needed.</p>
</div>

<h2>Why GEO Matters in 2026</h2>
<ul>
<li>40%+ of informational queries now involve AI-generated answers</li>
<li>Google AI Overview appears above organic results, reducing click-through rates</li>
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
<p>Use Trackly to monitor your AI visibility across all major platforms. Track which queries mention your brand, measure share of voice, and see how your GEO efforts improve results over time.</p>

<h3>5. Monitor Competitors</h3>
<p>See which competitors AI recommends for your target keywords. Understand what they're doing differently and adapt your strategy.</p>

<h2>Tools for GEO Optimization</h2>
<p>Trackly is purpose-built for GEO tracking. It queries 8 AI platforms with your custom keywords and shows you exactly what each AI says about your brand. Features include:</p>
<ul>
<li>Real API responses from ChatGPT, Perplexity, Claude, Gemini, Grok, Google AIO, DeepSeek & Mistral</li>
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
    title: 'Trackly vs Semrush — AI Visibility Tracking Comparison | Trackly',
    description: 'Compare Trackly with Semrush for AI visibility tracking. Trackly is purpose-built for GEO with 8 AI platforms, while Semrush focuses on traditional SEO.',
    keywords: 'Trackly vs Semrush, Semrush alternative, AI visibility tool comparison, Semrush AI tracking, GEO tool comparison',
    h1: 'Trackly vs <span>Semrush</span>',
    subtitle: 'How Trackly compares to Semrush for AI visibility and Generative Engine Optimization tracking.',
    canonical: '/vs/semrush',
    content: `
<h2>Semrush: Traditional SEO Powerhouse</h2>
<p>Semrush is a comprehensive SEO platform with keyword tracking, backlink analysis, and site auditing. They've recently added AI visibility features, but it's an add-on to their core SEO platform — not the primary focus.</p>

<h2>Trackly: Purpose-Built for AI Visibility</h2>
<p>Trackly is built from the ground up for one thing: tracking your brand's visibility in AI-generated answers. Every feature is designed around GEO optimization and AI mention tracking.</p>

<h2>Feature Comparison</h2>
<div class="highlight">
<p><strong>AI Platforms Tracked:</strong> Trackly covers 8 AI platforms (ChatGPT, Perplexity, Claude, Gemini, Grok, Google AIO, DeepSeek, Mistral). Semrush covers fewer AI platforms.</p>
<p><strong>Real API Responses:</strong> Trackly uses real API calls and saves complete responses as proof. Full response text, model name, and timestamp included.</p>
<p><strong>Pricing:</strong> Trackly starts free. Semrush starts at $129.95/mo for their base SEO plan, with AI features in higher tiers.</p>
<p><strong>GEO Focus:</strong> Trackly is 100% focused on AI visibility. Semrush has AI visibility as one feature among hundreds.</p>
</div>

<h2>When to Use Semrush</h2>
<p>If you need a comprehensive SEO suite with keyword research, rank tracking, backlink analysis, and site auditing. Semrush is excellent for traditional SEO.</p>

<h2>When to Use Trackly</h2>
<p>If you need dedicated AI visibility tracking with real proof, share of voice measurement, and GEO optimization data. Trackly is focused, affordable, and purpose-built for the AI era.</p>

<h2>Use Both Together</h2>
<p>Many users combine Semrush for traditional SEO with Trackly for AI visibility. They complement each other — Semrush handles Google rankings, Trackly handles AI mentions.</p>
`
  }));
});

router.get('/vs/ahrefs', (req, res) => {
  res.send(seoPage({
    title: 'Trackly vs Ahrefs Brand Radar — AI Visibility Tracking Comparison | Trackly',
    description: 'Compare Trackly with Ahrefs Brand Radar for AI visibility tracking. See how real-time API tracking compares to static dataset analysis.',
    keywords: 'Trackly vs Ahrefs, Ahrefs Brand Radar alternative, AI visibility tool comparison, Ahrefs AI tracking',
    h1: 'Trackly vs <span>Ahrefs Brand Radar</span>',
    subtitle: 'How Trackly\'s real-time AI tracking compares to Ahrefs Brand Radar\'s static dataset approach.',
    canonical: '/vs/ahrefs',
    content: `
<h2>Ahrefs Brand Radar</h2>
<p>Ahrefs Brand Radar analyzes a static dataset of 250M+ prompts to show how often brands appear in AI-generated responses. It updates monthly and provides broad visibility trends.</p>

<h2>Trackly: Real-Time, Custom Queries</h2>
<p>Trackly queries AI platforms in real-time with your custom keywords. You choose the exact queries, run them on-demand, and get complete API responses as proof.</p>

<h2>Key Differences</h2>
<div class="highlight">
<p><strong>Custom vs Pre-set Queries:</strong> Trackly lets you track your own keywords. Ahrefs uses a pre-built dataset.</p>
<p><strong>Real-time vs Monthly:</strong> Trackly runs queries on-demand with real API calls. Ahrefs updates monthly from historical data.</p>
<p><strong>Full Response as Proof:</strong> Trackly saves the complete AI response. Ahrefs shows aggregated statistics.</p>
<p><strong>8 AI Platforms:</strong> Trackly tracks ChatGPT, Perplexity, Claude, Gemini, Grok, Google AIO, DeepSeek & Mistral.</p>
</div>

<h2>When to Use Each</h2>
<p><strong>Ahrefs Brand Radar</strong> is great for broad market intelligence and seeing macro trends in AI visibility across large datasets.</p>
<p><strong>Trackly</strong> is better for targeted tracking with your specific keywords, getting real proof of AI responses, and measuring your GEO efforts with custom queries.</p>
`
  }));
});

module.exports = router;
