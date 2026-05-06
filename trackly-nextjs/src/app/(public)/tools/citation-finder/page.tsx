'use client';

import { useState } from 'react';
import ToolPage, { cardStyle, inputStyle, labelStyle, PrimaryButton, ErrorBanner, ToolArticle, FaqSection, RelatedTools, AnswerCapsule, KeyTakeaways, ExpertQuote, ArticleSchema } from '@/components/tools/ToolPage';

interface Citation {
  url: string;
  domain: string;
  title?: string;
}

interface Result {
  platform: string;
  model: string;
  query: string;
  brand: string;
  brandCited: boolean;
  citations: Citation[];
  answerSnippet: string;
}

export default function CitationFinderPage() {
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [platform, setPlatform] = useState<'Perplexity' | 'ChatGPT'>('Perplexity');
  const [honeypot, setHoneypot] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) return;
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch('/api/tools/citation-finder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), brand: brand.trim(), platform, website: honeypot }),
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

  return (
    <ToolPage
      title={<>AI <span style={{ color: 'var(--brand)' }}>Citation</span> Finder</>}
      subtitle="Ask Perplexity or ChatGPT a question and we'll list every URL it cites. Optionally tell us your brand to see if you're in the references."
      toolName="AI Citation Finder"
      toolSlug="citation-finder"
    >
      <div style={cardStyle}>
        <form onSubmit={handleSubmit}>
          <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true" tabIndex={-1}>
            <label htmlFor="cf-website">Website</label>
            <input id="cf-website" type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="cfQuery" style={labelStyle}>Question to ask</label>
            <input
              id="cfQuery"
              type="text"
              required
              maxLength={400}
              placeholder="e.g. What are the best AI visibility tracking tools and which sources prove it?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div>
              <label htmlFor="cfBrand" style={labelStyle}>Your brand <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
              <input
                id="cfBrand"
                type="text"
                maxLength={200}
                placeholder="e.g. Livesov"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="cfPlatform" style={labelStyle}>Platform</label>
              <select
                id="cfPlatform"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as 'Perplexity' | 'ChatGPT')}
                style={{ ...inputStyle, background: '#fff' }}
              >
                <option value="Perplexity">Perplexity</option>
                <option value="ChatGPT">ChatGPT</option>
              </select>
            </div>
          </div>
          <PrimaryButton type="submit" loading={loading}>
            {loading ? 'Asking AI...' : 'Find Citations'}
          </PrimaryButton>
          <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
            2 free checks per day. <a href="/signup" style={{ color: 'var(--brand)', fontWeight: 600 }}>Sign up</a> for unlimited citation tracking across every prompt.
          </div>
        </form>
        <ErrorBanner message={error} />
      </div>

      {result && (
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>{result.citations.length} citations</h2>
              <div style={{ fontSize: 12, color: '#6b7280' }}>via {result.platform} ({result.model})</div>
            </div>
            {result.brand && (
              <div style={{
                marginBottom: 16,
                padding: '10px 14px',
                borderRadius: 8,
                background: result.brandCited ? '#dcfce7' : '#fee2e2',
                color: result.brandCited ? '#166534' : '#991b1b',
                fontSize: 13,
                fontWeight: 600,
              }}>
                {result.brandCited ? `${result.brand} appears in the citations.` : `${result.brand} was not in the cited sources.`}
              </div>
            )}
            {result.citations.length === 0 ? (
              <div style={{ padding: '14px 16px', borderRadius: 8, background: '#f9fafb', color: '#6b7280', fontSize: 13 }}>
                No URLs cited. Try a question that benefits from sources, or switch platform.
              </div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {result.citations.map((c, i) => {
                  const isBrand = result.brand && c.domain.toLowerCase().includes(result.brand.toLowerCase());
                  return (
                    <li
                      key={c.url + i}
                      style={{
                        padding: 14,
                        borderRadius: 10,
                        background: isBrand ? '#f0fdf4' : '#f9fafb',
                        border: isBrand ? '1px solid #86efac' : '1px solid #f0f0f0',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e' }}>
                        {c.title || c.domain}
                        {isBrand && <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#10b981', color: '#fff' }}>YOUR BRAND</span>}
                      </div>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        style={{ fontSize: 12, color: '#6b7280', textDecoration: 'none', wordBreak: 'break-all' }}
                      >
                        {c.url}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div style={cardStyle}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', margin: '0 0 10px' }}>Answer snippet</h3>
            <div style={{ background: '#f9fafb', borderRadius: 8, padding: 14, fontSize: 13, lineHeight: 1.7, color: '#374151', whiteSpace: 'pre-wrap' }}>{result.answerSnippet}</div>
          </div>
        </div>
      )}

      <ToolArticle>
        <ArticleSchema
          headline="AI Citation Finder: See Which URLs Perplexity and ChatGPT Cite in Their Answers"
          description="Find every URL Perplexity or ChatGPT cites for any prompt. The complete guide to AI citations - why they matter, how to earn more, how the major engines differ."
          url="https://livesov.com/tools/citation-finder"
          datePublished="2026-05-01"
          dateModified="2026-05-06"
        />

        <AnswerCapsule>
          The <strong>AI Citation Finder</strong> sends a question to Perplexity (default) or ChatGPT, extracts every URL the model cites in its answer, and highlights matches against your domain if you supply one. AI citations are the new backlinks - they drive direct traffic and reinforce future inclusion. Free with 2 checks per IP per day.
        </AnswerCapsule>

        <KeyTakeaways
          items={[
            'Citations are the new backlinks - explicit footnotes from AI answers that drive intent-rich traffic.',
            'Perplexity is citation-native; ChatGPT cites less consistently, mostly in browsing/search mode.',
            'The fastest way to earn citations is to be present on the third-party sites the engine already trusts.',
            'Citation profile is a strategic competitive intelligence asset - it shows which sites the AI uses to define your category.',
            'Track citations weekly. Domain-level citation share is a leading indicator of mention rate.',
          ]}
        />

        <h2>What an AI citation actually is</h2>
        <p>
          A citation is a URL that an AI engine references in its answer. Perplexity makes citations explicit - every claim is footnoted to a source. ChatGPT (with browsing or search) embeds them inline as markdown links. Either way, the cited URL is the one a curious user can click through to verify the claim.
        </p>
        <p>
          Citations matter because they are the new backlinks. Being cited by Perplexity or ChatGPT for &quot;the best CRM for startups&quot; sends qualified traffic to your page <em>and</em> reinforces your standing the next time the model answers a similar question.
        </p>

        <h2>Why getting cited is the goal</h2>
        <ul>
          <li><strong>Direct traffic</strong> - users who click footnotes are explicitly verifying. They convert at high rates.</li>
          <li><strong>Compounding signal</strong> - the citation itself becomes evidence the next time a related query is asked.</li>
          <li><strong>Brand reinforcement</strong> - even unread citations attach your domain to authoritative answers.</li>
          <li><strong>Defensive moat</strong> - cited brands are harder to dislodge from a category narrative.</li>
        </ul>

        <h2>How to read your result</h2>
        <ol>
          <li><strong>Citation count</strong> - how many distinct URLs the model leaned on. More citations = a richer, more verifiable answer.</li>
          <li><strong>Domain coverage</strong> - which sites dominate the response. If review sites and competitor blogs dominate, you have a coverage gap.</li>
          <li><strong>Your domain status</strong> - if you supplied a brand, we highlight cited URLs from your domain so you can see at a glance whether you made the cut.</li>
          <li><strong>Answer snippet</strong> - the first 500 chars of the response. Useful to verify the model gave a substantive answer (and not a refusal or generic disclaimer).</li>
        </ol>

        <h2>How to earn more AI citations</h2>
        <ul>
          <li>Publish single-question pages that answer one query exhaustively. AI engines prefer pages with one clear thesis.</li>
          <li>Use <code>FAQPage</code> and <code>HowTo</code> schema. Both translate cleanly to citation-friendly snippets.</li>
          <li>Cite your own sources. Pages with strong outbound citations are themselves cited more often - it is reflexive.</li>
          <li>Get covered on the third-party sites Perplexity already trusts (G2, niche communities, news outlets, Wikipedia where appropriate).</li>
          <li>Improve your <a href="/tools/geo-score-checker">GEO score</a> on each page you want cited.</li>
        </ul>

        <div className="callout">
          <strong>Perplexity vs ChatGPT.</strong> Perplexity is citation-native - every answer has explicit footnotes. ChatGPT cites less consistently; it cites most when in browsing/search mode and least in plain chat. If your audience is research-heavy, prioritise Perplexity citations. If they are mass-market, prioritise ChatGPT mentions.
        </div>

        <ExpertQuote
          quote="The fastest way to earn AI citations isn't to publish more on your own blog. It's to get cited by the sites the AI already trusts. Find the top three citation sources in your category and concentrate guest posts, expert quotes and product mentions there. Compounding follows."
          name="Nik Sov"
          title="Founder, Livesov"
        />

        <h2>Citation source archetypes</h2>
        <p>
          AI engines pull from a small number of source types repeatedly. Knowing which type you need to be on is half the battle.
        </p>
        <table>
          <thead>
            <tr>
              <th>Archetype</th>
              <th>Examples</th>
              <th>Why AI cites them</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Review platforms</td><td>G2, Capterra, TrustRadius, Trustpilot</td><td>Aggregated user voice with structured ratings.</td></tr>
            <tr><td>Comparison roundups</td><td>Top-N blog posts, &quot;best X tools&quot; articles</td><td>Pre-organised competitive sets.</td></tr>
            <tr><td>Authoritative news</td><td>TechCrunch, The Verge, Wired, industry trade press</td><td>High citation density and freshness.</td></tr>
            <tr><td>Reference works</td><td>Wikipedia, official spec sites, RFCs</td><td>Definitional anchor points.</td></tr>
            <tr><td>Forums</td><td>Reddit, Hacker News, Stack Overflow, niche Discords (indexed)</td><td>Real-user signal at scale.</td></tr>
            <tr><td>Vendor docs</td><td>Your own /docs, /api, /integrations</td><td>Authoritative source on the product itself.</td></tr>
            <tr><td>Aggregators</td><td>Producthunt, Indie Hackers, niche directories</td><td>Discovery surface for newer brands.</td></tr>
          </tbody>
        </table>

        <h2>Common mistakes</h2>
        <ul>
          <li><strong>Reading a single result as the truth.</strong> Citations vary across runs. Treat the result as one sample, not the canon.</li>
          <li><strong>Fixating on your own blog citations.</strong> Self-citations are weaker signal than third-party citations. Diversify.</li>
          <li><strong>Counting citations from any low-quality source as wins.</strong> AI engines de-weight thin sites. Prioritise the eight archetypes above.</li>
          <li><strong>Ignoring engine differences.</strong> Perplexity citations follow different patterns than ChatGPT citations. Track both separately.</li>
        </ul>

        <FaqSection
          items={[
            {
              q: 'Why does my domain not appear in the citations?',
              a: 'Three usual reasons: the page does not exist for this query, the page exists but is not crawlable, or the page exists but is buried behind generic competitors. Run the same query on /tools/ai-readiness-audit to score the page that should be cited.',
            },
            {
              q: 'How does this differ from the ChatGPT Mention Checker?',
              a: 'The Mention Checker tells you if your brand name appears in the answer text. This tool tells you which URLs the model linked to. They are complementary: a brand can be mentioned without any citation, or cited without an explicit name.',
            },
            {
              q: 'Are these the exact citations end-users see?',
              a: 'Yes for Perplexity - we use the same provider API end-users see. ChatGPT citations vary by mode (browsing vs no-browsing); the tool reflects whatever mode the model chooses for the prompt.',
            },
            {
              q: 'Can I use this to find competitor citation profiles?',
              a: 'Absolutely. Skip the brand field, run the prompt, and study which domains appear most often. That is your competitive citation profile - the sites you need to be present on.',
            },
            {
              q: 'What is the daily cap?',
              a: '2 free checks per day per IP. Each check makes a real Perplexity or ChatGPT API call. Sign up to track citations across multiple prompts on a daily schedule.',
            },
            {
              q: 'How long does it take to earn a Perplexity citation after publishing?',
              a: 'For the right kind of page (FAQ-rich, schema-marked, on a known domain), Perplexity often picks it up within a week. For new domains or sparse content, expect months.',
            },
            {
              q: 'Should I track citations per domain or per URL?',
              a: 'Both. Domain-level shows category-leading sources; URL-level shows the specific pages cited. The paid product surfaces both views.',
            },
            {
              q: 'Do AI citations help my Google rankings?',
              a: 'Indirectly. Pages cited heavily by AI tend to be the same pages that rank well in search - not because AI causes the ranking but because both reward similar structural and citation signals.',
            },
          ]}
        />

        <RelatedTools
          items={[
            { slug: 'chatgpt-mention-checker', name: 'ChatGPT Mention Checker', tagline: 'See if your brand is named in the response itself.' },
            { slug: 'ai-readiness-audit', name: 'AI Readiness Audit', tagline: 'Score the page that should be cited but is not.' },
            { slug: 'competitor-finder', name: 'AI Competitor Finder', tagline: 'Find the brands AI recommends - and citations follow.' },
          ]}
        />
      </ToolArticle>
    </ToolPage>
  );
}
