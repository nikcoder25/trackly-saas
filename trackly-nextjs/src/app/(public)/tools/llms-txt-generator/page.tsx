'use client';

import { useState } from 'react';
import ToolPage, { cardStyle, inputStyle, labelStyle, PrimaryButton, ErrorBanner, ToolArticle, FaqSection, RelatedTools, AnswerCapsule, KeyTakeaways, ExpertQuote, ArticleSchema } from '@/components/tools/ToolPage';

interface Result {
  domain: string;
  urlCount: number;
  sitemapsCrawled: number;
  llmsTxt: string;
}

export default function LlmsTxtGeneratorPage() {
  const [domain, setDomain] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) return;
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch('/api/tools/llms-txt-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domain.trim(), website: honeypot }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        return;
      }
      setResult(data);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.llmsTxt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!result) return;
    const blob = new Blob([result.llmsTxt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'llms.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <ToolPage
      title={<>Free <span style={{ color: 'var(--brand)' }}>llms.txt</span> Generator</>}
      subtitle="Build a valid llms.txt for your site in seconds. We crawl your sitemap and group URLs into clean sections."
      toolName="llms.txt Generator"
      toolSlug="llms-txt-generator"
    >
      <div style={cardStyle}>
        <form onSubmit={handleSubmit}>
          <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true" tabIndex={-1}>
            <label htmlFor="llms-website">Website</label>
            <input id="llms-website" type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="domain" style={labelStyle}>Your domain</label>
            <input
              id="domain"
              type="text"
              required
              placeholder="https://example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              style={inputStyle}
            />
            <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
              We&apos;ll fetch <code>/sitemap.xml</code> or <code>/sitemap_index.xml</code>.
            </div>
          </div>
          <PrimaryButton type="submit" loading={loading}>
            {loading ? 'Generating...' : 'Generate llms.txt'}
          </PrimaryButton>
        </form>
        <ErrorBanner message={error} />
      </div>

      {result && (
        <div style={{ marginTop: 24 }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>Generated for {result.domain}</div>
                <div style={{ fontSize: 14, color: '#1a1a2e', marginTop: 4 }}>
                  <strong>{result.urlCount}</strong> URLs across <strong>{result.sitemapsCrawled}</strong> sitemap{result.sitemapsCrawled !== 1 ? 's' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleCopy}
                  style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #e0e0e0', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  Download
                </button>
              </div>
            </div>
            <pre
              style={{
                background: '#0f172a',
                color: '#e2e8f0',
                padding: 20,
                borderRadius: 10,
                fontSize: 12,
                lineHeight: 1.6,
                overflowX: 'auto',
                maxHeight: 460,
                margin: 0,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              {result.llmsTxt}
            </pre>
            <p style={{ marginTop: 16, fontSize: 13, color: '#6b7280' }}>
              Upload the file to the root of your domain so it&apos;s reachable at <code>https://{(() => { try { return new URL(result.domain).host; } catch { return 'yourdomain.com'; } })()}/llms.txt</code>.
            </p>
          </div>
        </div>
      )}

      <ToolArticle>
        <ArticleSchema
          headline="Free llms.txt Generator: Build a Valid llms.txt File for Your Site in Seconds"
          description="A complete guide to llms.txt - what it is, why AI engines reward it, the v0.1 spec, hosting, validation and best practice. Includes a free generator."
          url="https://livesov.com/tools/llms-txt-generator"
          datePublished="2026-05-01"
          dateModified="2026-05-06"
        />

        <AnswerCapsule>
          <strong>llms.txt</strong> is a plain-text markdown file at the root of your domain (<code>/llms.txt</code>) that tells large language models like ChatGPT, Claude and Perplexity which URLs on your site are worth reading. This generator crawls your sitemap, groups URLs into clean sections and gives you a copy-paste-ready file in under 10 seconds. No signup.
        </AnswerCapsule>

        <KeyTakeaways
          items={[
            'llms.txt is an inclusion list (here is what to read), robots.txt is an exclusion list (here is what to skip). You need both.',
            'The file lives at /llms.txt and is plain markdown - title, optional description, then H2-grouped link lists.',
            'Major adopters today: Anthropic, Cursor, Mintlify, Anthropic-powered IDEs, and most retrieval-augmented systems.',
            'A good llms.txt is 80-300 URLs grouped into 5-12 sections, ranked by business value, edited by a human after generation.',
            'Pair llms.txt with an open robots.txt policy for AI bots and a high GEO score on each spotlighted page.',
          ]}
        />

        <h2>What is llms.txt?</h2>
        <p>
          <code>llms.txt</code> is a plain-text manifest, written in markdown, that lives at the root of your domain. Its job is to give large language models a curated tour of your site: a title, a short description of the project, and then a series of H2 headings with bullet-pointed links beneath each one. The format is small enough to fit on a postcard but expressive enough to capture the structure of even a 10,000-page site.
        </p>
        <p>
          The file follows a v0.1 specification published by the <a href="https://llmstxt.org" rel="noopener noreferrer nofollow">llmstxt.org</a> working group in 2024. Adoption has been brisk: Anthropic ships llms.txt files for the Claude API docs, Mintlify auto-generates them for every site it hosts, and Cursor reads them when indexing a codebase. The pattern matters because LLMs reason better from a curated reading list than from a 50,000-URL sitemap stuffed with archive pages, tag indexes and pagination.
        </p>

        <h3>The minimum valid file</h3>
        <p>
          The smallest valid llms.txt is just a project title preceded by an H1. The most useful version - which is what this generator produces - includes a description blockquote and several H2-headed sections, each containing markdown links with optional descriptions. That structure mirrors how an LLM looks at a website during retrieval: hierarchically, by topic, with the title carrying the most weight.
        </p>

        <h2>Why your site needs llms.txt in 2026</h2>
        <p>
          AI assistants are no longer a novelty traffic source. Roughly 200 million people use ChatGPT every week, Perplexity routes tens of millions of buying-intent queries each month, and Google&apos;s AI Overviews appear above the organic results for an estimated 40% of informational searches. When a user asks an AI &quot;the best tool for X&quot;, the answer comes from a mixture of training data and live retrieval. If your site is poorly structured or your sitemap is bloated, the model will struggle to find and cite your most relevant content.
        </p>
        <p>
          A handcrafted <code>llms.txt</code> changes the calculus. You decide which pages matter, in what order, and how they are grouped. AI engines that honour the file get the curated version. Even those that do not - yet - benefit indirectly: many third-party indexers and retrieval-augmented systems treat llms.txt as a high-priority hint when building their own crawl frontier.
        </p>

        <ExpertQuote
          quote="Most teams discover their sitemap was the problem only after they sit down to write llms.txt. The exercise of choosing 200 URLs that actually represent the business is the highest-impact information architecture audit you'll do all year."
          name="Nik Sov"
          title="Founder, Livesov"
        />

        <h2>How this llms.txt generator works</h2>
        <p>
          The generator does the boring part - fetching your sitemap, normalising URLs, grouping them by intent. You do the high-impact part - editing, reordering, sharpening titles. End to end, most teams finish in 20 minutes.
        </p>
        <ol>
          <li><strong>You enter a root domain.</strong> Either <code>example.com</code> or <code>https://example.com</code> works. We strip paths and query strings.</li>
          <li><strong>We fetch /sitemap.xml and /sitemap_index.xml</strong> using our SSRF-hardened crawler. If your sitemap is an index pointing to nested sitemaps, we follow up to eight levels deep.</li>
          <li><strong>Each URL is parsed and categorised</strong> by path-prefix into one of 12 buckets: Home, Product, Pricing, Tools, Use Cases, Integrations, Comparisons, Documentation, Blog, Company, Contact, Other.</li>
          <li><strong>We render markdown</strong> with up to 500 URLs total and at most 50 per section, prioritised in the order most LLMs surface (Home, Product, Pricing first; Other last).</li>
          <li><strong>You copy or download the output</strong> as a plain text file and upload it to your web root.</li>
        </ol>

        <h2>The llms.txt spec, explained</h2>
        <p>
          The format is small. Here is the full surface area you actually need to know.
        </p>
        <h3>1. H1 title (required)</h3>
        <p>
          The first non-empty line is an H1 with the project name. This becomes the LLM&apos;s primary anchor when it cites you.
        </p>
        <h3>2. Description blockquote (optional but recommended)</h3>
        <p>
          A markdown blockquote (<code>&gt; one or two sentences</code>) that explains what the site is. Treat this as your AI elevator pitch. Many engines surface this verbatim.
        </p>
        <h3>3. H2-grouped link sections</h3>
        <p>
          Each H2 is a topic. Beneath the H2, list bullet-pointed markdown links. You can optionally add a colon-separated description after each link. Order matters - LLMs treat earlier sections as higher priority.
        </p>
        <h3>4. Optional extras</h3>
        <p>
          The spec leaves room for <code>llms-full.txt</code> (a longer file with full text content for offline indexing) and language tags. The generator emits a v0.1-compliant llms.txt; the longer variant is on our roadmap.
        </p>

        <h2>Where to host the file</h2>
        <p>
          The file must live at the root of your domain so it is reachable at <code>https://yourdomain.com/llms.txt</code>. The HTTP response must be 200 OK and the content-type should be <code>text/plain</code> or <code>text/markdown</code>. CDNs need to let the file through unmodified - watch out for HTML-only edge rewrites that intercept everything except <code>/api/*</code>.
        </p>

        <h3>Hosting cheat-sheet by stack</h3>
        <table>
          <thead>
            <tr>
              <th>Stack</th>
              <th>Where to put the file</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Next.js</td>
              <td><code>public/llms.txt</code></td>
              <td>Served as-is. Works on Vercel, Netlify, DO App Platform.</td>
            </tr>
            <tr>
              <td>WordPress</td>
              <td>Web root, alongside <code>wp-config.php</code></td>
              <td>Disable any plugin that rewrites unknown paths.</td>
            </tr>
            <tr>
              <td>Webflow / Framer</td>
              <td>Custom code section or asset upload</td>
              <td>Both platforms now allow root-level static files.</td>
            </tr>
            <tr>
              <td>Shopify</td>
              <td>Theme assets + redirect rule</td>
              <td>Use a 200 redirect to a hosted text file in <code>/files</code>.</td>
            </tr>
            <tr>
              <td>Static site (Hugo, Jekyll, Astro)</td>
              <td><code>static/llms.txt</code> or <code>public/llms.txt</code></td>
              <td>No special config required.</td>
            </tr>
            <tr>
              <td>Cloudflare Pages</td>
              <td>Build output root</td>
              <td>Confirm it is not gzipped to a non-text content-type.</td>
            </tr>
          </tbody>
        </table>

        <h2>How to validate your llms.txt</h2>
        <ol>
          <li>Visit <code>https://yourdomain.com/llms.txt</code> in a browser. You should see plain markdown, not a 404 or a HTML page.</li>
          <li>Check the response headers in DevTools. <code>content-type</code> should start with <code>text/</code>.</li>
          <li>Confirm there is no <code>x-frame-options</code>, <code>content-disposition: attachment</code> or other header that breaks programmatic fetching.</li>
          <li>Run the file through a markdown linter (any will do). Broken syntax means LLMs will mis-parse the sections.</li>
          <li>Use our <a href="/tools/ai-crawler-checker">AI Crawler Checker</a> against <code>/llms.txt</code> to confirm GPTBot, ClaudeBot and PerplexityBot are not blocked from fetching it.</li>
        </ol>

        <h2>Tips for a high-signal llms.txt</h2>
        <p>
          The default generator output is a strong starting point. The teams that get the most lift from llms.txt do these five things on top.
        </p>
        <ul>
          <li><strong>Lead with money pages.</strong> Pricing, the product home, your top comparison page. The first 10 URLs in the file carry the most weight.</li>
          <li><strong>Cap each section at 10-20 URLs.</strong> AI engines reward density over breadth. A 50-URL Blog section dilutes signal; pick the 10 best posts.</li>
          <li><strong>Cut archive and tag pages.</strong> Anything that is a list of other links rarely belongs in llms.txt. Spotlight the destinations, not the indexes.</li>
          <li><strong>Add one-line descriptions to your top 20 URLs.</strong> Format: <code>- [Title](url): one-sentence description</code>. This dramatically improves citation quality.</li>
          <li><strong>Re-run after every launch.</strong> A new pricing page, a new use-case page, a new comparison - all should be added to llms.txt the same day they ship.</li>
        </ul>

        <h2>llms.txt vs robots.txt vs sitemap.xml</h2>
        <p>
          These three files solve different problems. Most professional sites need all three.
        </p>
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Purpose</th>
              <th>Audience</th>
              <th>Format</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>robots.txt</code></td>
              <td>Exclusion - which paths crawlers must not visit</td>
              <td>All crawlers (search + AI)</td>
              <td>Plain text directives</td>
            </tr>
            <tr>
              <td><code>sitemap.xml</code></td>
              <td>Discovery - the full list of URLs you want indexed</td>
              <td>Search engines primarily</td>
              <td>XML, machine-generated</td>
            </tr>
            <tr>
              <td><code>llms.txt</code></td>
              <td>Curation - the URLs AI should focus on, with structure</td>
              <td>LLMs and AI answer engines</td>
              <td>Markdown, human-edited</td>
            </tr>
          </tbody>
        </table>

        <h2>Common mistakes</h2>
        <ul>
          <li><strong>Treating llms.txt like a sitemap.</strong> Dumping every URL defeats the point. Curate ruthlessly.</li>
          <li><strong>Wrong content-type.</strong> A file served as <code>application/octet-stream</code> may be downloaded by browsers but skipped by some indexers.</li>
          <li><strong>Forgetting the H1.</strong> Without an H1 title, parsers treat the file as malformed.</li>
          <li><strong>Hosting at <code>/llms-txt</code> or <code>/llms</code>.</strong> The path is <code>/llms.txt</code> exactly. Aliases do not count.</li>
          <li><strong>Blocking GPTBot or ClaudeBot.</strong> If your robots.txt blocks the AI crawlers, llms.txt may never be fetched. Check with the <a href="/tools/ai-crawler-checker">AI Crawler Checker</a>.</li>
          <li><strong>Letting the file go stale.</strong> If your llms.txt still reads &quot;Beta launch coming Q2 2025&quot; in mid-2026, it actively damages trust.</li>
        </ul>

        <h2>Use cases by team type</h2>
        <ul>
          <li><strong>SaaS marketing teams</strong> use it to spotlight pricing, integrations and use-case pages so AI engines recommend them in buying-intent queries.</li>
          <li><strong>Documentation teams</strong> use it to give LLM-powered IDEs (Cursor, Continue) a clean entry point into their docs, improving developer experience.</li>
          <li><strong>Ecommerce sites</strong> use it to highlight category and bestseller pages over the long tail of out-of-stock variants.</li>
          <li><strong>Agencies</strong> generate llms.txt for every client as part of an AI visibility audit. Pair it with our <a href="/tools/ai-readiness-audit">AI Readiness Audit</a> for a polished deliverable.</li>
          <li><strong>Local businesses</strong> spotlight service pages and city-specific landing pages so local AI queries surface them.</li>
        </ul>

        <h2>Glossary</h2>
        <table>
          <thead>
            <tr>
              <th>Term</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>llms.txt</td><td>Plain-text manifest at <code>/llms.txt</code> that curates URLs for LLM consumption.</td></tr>
            <tr><td>llms-full.txt</td><td>Optional companion file containing full-text content for offline indexing.</td></tr>
            <tr><td>GEO</td><td>Generative Engine Optimization - the discipline of structuring content so AI engines surface it.</td></tr>
            <tr><td>Retrieval-augmented generation (RAG)</td><td>Architecture where an LLM fetches live documents to ground its answer.</td></tr>
            <tr><td>Sitemap index</td><td>An XML file that points to multiple smaller sitemaps. Common on sites with thousands of URLs.</td></tr>
          </tbody>
        </table>

        <FaqSection
          items={[
            {
              q: 'Do AI models actually read llms.txt today?',
              a: 'Yes, with growing support. Anthropic, Cursor, Mintlify, Continue, and a long list of vendors check for the file. Many web indexers (including the corpora that feed retrieval-augmented systems) treat it as a high-priority hint. Even where it is not consumed directly, having a clean manifest forces you to audit your information architecture, which improves AI visibility regardless.',
            },
            {
              q: 'Is llms.txt the same as robots.txt?',
              a: 'No. robots.txt is an exclusion list - it tells crawlers where they may NOT go. llms.txt is an inclusion list - a curated set of URLs you want AI to focus on. Most sites need both: robots.txt to gate access, llms.txt to spotlight the best content, sitemap.xml to give the full picture to search engines.',
            },
            {
              q: 'How often should I regenerate the file?',
              a: 'Regenerate after every meaningful content change: new product page, new comparison page, deprecated docs, etc. A monthly re-run is a sensible cadence for sites that publish weekly. Quarterly is the floor for any site that ships changes.',
            },
            {
              q: 'My sitemap is huge. Will the tool include everything?',
              a: 'The tool caps output at 500 URLs and at most 50 per section. That keeps the file readable for AI and aligned with the spec. Trim further by hand if you want a tighter signal. The goal is curation, not completeness.',
            },
            {
              q: 'Can I edit the output by hand?',
              a: 'Absolutely - and you should. The download is plain markdown. Open it in any editor, reorder sections, sharpen titles, add one-line descriptions to your top 20 URLs. The generator gives you 90% of the file in seconds; the last 10% is editorial work only you can do.',
            },
            {
              q: 'What happens if I have no sitemap.xml?',
              a: 'The generator returns an error. Add a sitemap (most static-site tools and CMSes generate one automatically) and re-run. If you cannot, draft the file by hand starting from the H1 + description + 5-10 H2 sections that match your IA.',
            },
            {
              q: 'Can I use llms.txt to block AI from specific pages?',
              a: 'No - that is robots.txt territory. llms.txt is purely additive. To block AI crawlers, use Disallow rules in robots.txt targeting GPTBot, ClaudeBot, PerplexityBot and Google-Extended.',
            },
            {
              q: 'Should I have a separate llms.txt per language?',
              a: 'The spec is per-domain. If you run separate-domain locales (de.example.com, fr.example.com), generate a per-domain file. If you run sub-path locales (example.com/de/, example.com/fr/), one llms.txt with grouped sections is cleaner.',
            },
            {
              q: 'How does this affect my Google rankings?',
              a: 'No direct effect. llms.txt is read by AI engines, not Google search. Indirect benefit: the discipline of curating your most important pages tends to surface IA problems that hurt traditional SEO too.',
            },
            {
              q: 'What is llms-full.txt and do I need it?',
              a: 'llms-full.txt is an optional companion file containing the full text of every URL in your llms.txt. It is useful for offline indexing in retrieval pipelines. Most public sites do not need one - it is more relevant for internal docs and developer-tool integrations.',
            },
          ]}
        />

        <RelatedTools
          items={[
            { slug: 'ai-crawler-checker', name: 'AI Crawler Checker', tagline: 'Confirm GPTBot, ClaudeBot and Perplexity can actually reach your URLs.' },
            { slug: 'geo-score-checker', name: 'GEO Score Checker', tagline: 'Score any page on its AI-readiness in seconds.' },
            { slug: 'ai-readiness-audit', name: 'AI Readiness Audit', tagline: 'Full breakdown across 50+ AI-readiness checkpoints.' },
          ]}
        />
      </ToolArticle>
    </ToolPage>
  );
}
