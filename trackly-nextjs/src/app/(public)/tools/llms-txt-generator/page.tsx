'use client';

import { useState } from 'react';
import ToolPage, { cardStyle, inputStyle, labelStyle, PrimaryButton, ErrorBanner, ToolArticle, FaqSection, RelatedTools } from '@/components/tools/ToolPage';

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
        <h2>What is llms.txt?</h2>
        <p>
          <code>llms.txt</code> is a plain-text manifest that lives at the root of your domain and tells large language models which URLs on your site are worth reading. Think of it as a curated reading list for AI: rather than letting ChatGPT, Perplexity, Claude or Gemini guess at your site structure, you hand them a clean, hierarchical map of your most important pages.
        </p>
        <p>
          The format is intentionally simple. A title, a short description, then markdown links grouped under H2 headings. AI crawlers and answer engines that support the convention can fetch one file and understand your site in seconds, instead of crawling thousands of low-value URLs to find the same handful of high-signal pages.
        </p>

        <h2>Why your site needs an llms.txt file</h2>
        <p>
          AI assistants are now a primary discovery channel. When a user asks ChatGPT or Perplexity for &quot;the best tool for X&quot;, the model answers from what it has indexed and from live sources it can fetch. If your site is poorly structured or your sitemap is bloated with archive pages, the model will struggle to find and cite your most relevant content.
        </p>
        <p>
          A handcrafted <code>llms.txt</code> changes that. You decide which pages matter, in what order, and how they&apos;re grouped. The result: cleaner citations, fewer hallucinations about your product, and a higher chance of being recommended for the queries you actually care about.
        </p>

        <h2>How this generator works</h2>
        <ol>
          <li>Enter your root domain (we accept <code>example.com</code> or <code>https://example.com</code>).</li>
          <li>We fetch <code>/sitemap.xml</code> and <code>/sitemap_index.xml</code> with our SSRF-hardened crawler. Nested sitemaps are followed up to 8 deep.</li>
          <li>Each URL is parsed and bucketed into one of 12 categories (Home, Product, Pricing, Tools, Use Cases, Integrations, Comparisons, Documentation, Blog, Company, Contact, Other).</li>
          <li>Up to 500 URLs are emitted in priority order with human-friendly titles derived from each path.</li>
          <li>You copy the output or download <code>llms.txt</code> and upload it to your web root.</li>
        </ol>

        <h2>Where to host the file</h2>
        <p>
          Upload the file so it&apos;s reachable at <code>https://yourdomain.com/llms.txt</code>. It must return HTTP 200 with <code>content-type: text/plain</code> or <code>text/markdown</code>. If you use Next.js, drop it into <code>/public</code>. If you use Vercel or Netlify, the same root-public approach applies. CDNs should let it through unmodified.
        </p>

        <h2>Tips for a high-signal llms.txt</h2>
        <ul>
          <li>Lead with your highest-value page (typically pricing or the product home).</li>
          <li>Limit each section to 10-20 URLs. AI models reward density over breadth.</li>
          <li>Remove archive pages, paginated listings, and tag/category pages - they dilute the manifest.</li>
          <li>Re-generate after every major content launch so your llms.txt stays current.</li>
          <li>Pair it with a strong <a href="/tools/ai-crawler-checker">robots.txt policy</a> so AI crawlers can actually reach the pages you list.</li>
        </ul>

        <FaqSection
          items={[
            {
              q: 'Do AI models actually read llms.txt today?',
              a: 'Adoption is still emerging - Anthropic, Cursor, and a growing list of vendors check for the file, and many web indexers (including the corpora that feed retrieval-augmented systems) treat it as a high-priority hint. Even where it is not consumed directly, having a clean manifest forces you to audit your IA, which improves AI visibility regardless.',
            },
            {
              q: 'Is llms.txt the same as robots.txt?',
              a: 'No. robots.txt is an exclusion list - it tells crawlers where they may NOT go. llms.txt is an inclusion list - a curated set of URLs you want AI to focus on. Most sites need both: robots.txt to gate access, llms.txt to spotlight the best content.',
            },
            {
              q: 'How often should I regenerate the file?',
              a: 'Regenerate after every meaningful content change: new product page, new comparison page, deprecated docs, etc. A monthly re-run is a sensible cadence for sites that publish weekly.',
            },
            {
              q: 'My sitemap is huge. Will the tool include everything?',
              a: 'The tool caps output at 500 URLs and at most 50 per section. That keeps the file readable for AI and aligned with the spec’s spirit. Trim further by hand if you want a tighter signal.',
            },
            {
              q: 'Can I edit the output?',
              a: 'Absolutely. The download is plain markdown. Open it in any editor, reorder sections, sharpen titles, add a short paragraph under each H2 if you want richer context. The generator gives you 90% of the file in seconds; the last 10% is your editorial voice.',
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
