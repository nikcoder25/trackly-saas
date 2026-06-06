'use client';

import { useState } from 'react';
import Link from 'next/link';
import ToolPage, { cardStyle, inputStyle, labelStyle, PrimaryButton, ErrorBanner, ToolArticle, FaqSection, RelatedTools, AnswerCapsule, KeyTakeaways, ExpertQuote, ArticleSchema } from '@/components/tools/ToolPage';

interface Result {
  brandName: string;
  query: string;
  platform: string;
  model: string;
  mentioned: boolean;
  snippet: string;
  competitors: string[];
}

export default function ChatgptMentionCheckerPage() {
  const [brandName, setBrandName] = useState('');
  const [query, setQuery] = useState('');
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
      const res = await fetch('/api/tools/chatgpt-mention-checker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName: brandName.trim(), query: query.trim(), website: honeypot }),
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
      title={<>Free <span style={{ color: 'var(--brand)' }}>ChatGPT</span> Mention Checker</>}
      subtitle="Ask ChatGPT a real question and see if your brand shows up - and which competitors are mentioned alongside it."
      toolName="ChatGPT Mention Checker"
      toolSlug="chatgpt-mention-checker"
    >
      <div style={cardStyle}>
        <form onSubmit={handleSubmit}>
          <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true" tabIndex={-1}>
            <label htmlFor="cgpt-website">Website</label>
            <input id="cgpt-website" type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="brandName" style={labelStyle}>Your brand name</label>
            <input
              id="brandName"
              type="text"
              required
              maxLength={200}
              placeholder="e.g. Livesov"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="query" style={labelStyle}>Question to ask ChatGPT</label>
            <input
              id="query"
              type="text"
              required
              maxLength={400}
              placeholder="e.g. What are the best AI visibility tracking tools?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={inputStyle}
            />
            <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>One free check per day. <Link href="/signup" style={{ color: 'var(--brand)' }}>Sign up</Link> to track unlimited prompts.</div>
          </div>
          <PrimaryButton type="submit" loading={loading}>
            {loading ? 'Asking ChatGPT...' : 'Check Mention'}
          </PrimaryButton>
        </form>
        <ErrorBanner message={error} />
      </div>

      {result && (
        <div style={{ marginTop: 24 }}>
          <div style={cardStyle}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 24px',
                borderRadius: 999,
                background: result.mentioned ? '#dcfce7' : '#fee2e2',
                color: result.mentioned ? '#166534' : '#991b1b',
                fontWeight: 700,
                fontSize: 16,
              }}>
                {result.mentioned ? `Yes, ChatGPT mentioned ${result.brandName}` : `No, ChatGPT did not mention ${result.brandName}`}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>via {result.platform} ({result.model})</div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>Question</div>
              <div style={{ background: '#f9fafb', borderRadius: 8, padding: 14, fontSize: 14, color: '#1a1a2e' }}>{result.query}</div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ ...labelStyle, marginBottom: 8 }}>{result.mentioned ? 'Where you appear' : 'What ChatGPT said'}</div>
              <div style={{ background: '#f9fafb', borderRadius: 8, padding: 14, fontSize: 14, lineHeight: 1.7, color: '#374151', whiteSpace: 'pre-wrap' }}>{result.snippet}</div>
            </div>

            {result.competitors.length > 0 && (
              <div>
                <div style={{ ...labelStyle, marginBottom: 8 }}>Other brands ChatGPT mentioned</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {result.competitors.map((c) => (
                    <span key={c} style={{ padding: '6px 12px', borderRadius: 999, background: '#f3f4f6', fontSize: 13, color: '#1a1a2e' }}>{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ToolArticle>
        <ArticleSchema
          headline="Free ChatGPT Brand Mention Checker: Does ChatGPT Recommend Your Brand?"
          description="Ask ChatGPT a real customer question and instantly see whether your brand is mentioned, who is mentioned instead, and how to improve your AI visibility."
          url="https://livesov.com/tools/chatgpt-mention-checker"
          datePublished="2026-05-01"
          dateModified="2026-05-06"
        />

        <AnswerCapsule>
          The <strong>ChatGPT Brand Mention Checker</strong> sends your question to ChatGPT (gpt-5), scans the response for your brand, and shows the surrounding context plus any competitor brands that were mentioned instead. Free with one check per IP per day. <a href="/signup">Sign up</a> for unlimited tracking across ChatGPT, Perplexity, Claude, Gemini and Grok.
        </AnswerCapsule>

        <KeyTakeaways
          items={[
            'AI mention rate matters more than search rank because the user reads the answer, not a list of links.',
            'A brand can be on page 1 of Google and entirely absent from ChatGPT. The two channels measure different things.',
            'Mention rate is a probability, not a binary. Always sample at least 30 responses per prompt before drawing conclusions.',
            'Third-party citations (G2, niche communities, comparison pages) move the needle more than your own marketing copy.',
            'The free check is a snapshot. Continuous tracking shows the trendline, which is what actually matters.',
          ]}
        />

        <h2>What this tool actually does</h2>
        <p>
          You give us a brand name and a question a real customer might ask. We send that question to ChatGPT (gpt-5 by default), then scan the response for your brand and the brands it mentions instead. The result is a single, honest answer: <em>does ChatGPT recommend you for this query, and who beats you when it doesn&apos;t?</em>
        </p>
        <p>
          This is the most important data point in AI visibility. Search rankings tell you who appears in the top 10 results. AI mention rate tells you who appears in the <em>answer</em> - the only thing the user actually reads.
        </p>

        <h2>Why ChatGPT mentions matter more than rankings</h2>
        <p>
          Roughly 200 million people use ChatGPT every week. When they ask &quot;what&apos;s the best CRM for a 5-person startup?&quot;, they get a paragraph naming three or four companies. They do not get a list of ten blue links to scroll through. They make their shortlist from the first answer.
        </p>
        <p>
          If your brand isn&apos;t in that paragraph, you don&apos;t exist in the funnel. This tool tells you whether you&apos;re in or out, instantly, for any question you can think to ask.
        </p>

        <h2>How to read your result</h2>
        <ul>
          <li><strong>Mentioned</strong> - your brand name appears in ChatGPT&apos;s answer. We highlight the surrounding sentence so you can see the context (positive, neutral, or qualified).</li>
          <li><strong>Not mentioned</strong> - the response named other brands instead. The competitor list shows who took the slot you wanted.</li>
          <li><strong>Competitors</strong> - capitalised brand-style terms ChatGPT named in the same answer. These are the rivals the AI considers comparable to you.</li>
        </ul>

        <h2>What to do next</h2>
        <ol>
          <li>If you were mentioned: run the same prompt 10 more times (rephrased) to see if mention rate is consistent or fragile.</li>
          <li>If you were not mentioned: study the brands that <em>were</em>. What do their pricing pages, reviews, and citation profile look like? AI models pull from third-party signals more than from your own marketing copy.</li>
          <li>Strengthen your brand mentions on the third-party sites that ChatGPT trusts (review sites, comparison roundups, niche communities, Wikipedia where appropriate).</li>
          <li>Make sure your own pages are <a href="/tools/ai-crawler-checker">crawlable by AI bots</a> and that you have <a href="/tools/llms-txt-generator">a clean llms.txt</a>.</li>
          <li>Move from one-off checks to <a href="/signup">continuous tracking</a> so you can see the score change as you iterate.</li>
        </ol>

        <div className="callout">
          <strong>Limit:</strong> one free check per IP per day. Each check makes a real ChatGPT API call, which costs us money. The daily cap keeps the tool free for casual auditing while pushing serious users toward continuous tracking.
        </div>

        <ExpertQuote
          quote="The first time founders run this they always run it on their best-known prompt. They get a result, smile, close the tab. The interesting question is what happens on the prompt where they are NOT the obvious answer. That's where the strategy work begins."
          name="Nik Sov"
          title="Founder, Livesov"
        />

        <h2>How ChatGPT decides which brands to mention</h2>
        <p>
          ChatGPT&apos;s answer is generated probabilistically from training data, RLHF, and (in browsing mode) live retrieval. There is no single &quot;mention list&quot; the model consults. Instead, brand inclusion is a function of three overlapping signals.
        </p>
        <h3>1. Citation density in training data</h3>
        <p>
          Brands that appear frequently across the open web - particularly on third-party review sites, comparison roundups, news outlets and high-authority forums - are over-represented in the model&apos;s implicit category map. This is why &quot;ranks well in G2, Capterra, niche subreddits&quot; correlates strongly with AI visibility.
        </p>
        <h3>2. Co-occurrence with category language</h3>
        <p>
          When the model sees &quot;CRM&quot; and &quot;HubSpot&quot; appear in the same paragraph 50,000 times, it associates them. Co-occurrence with category-defining terms (the words customers use, not necessarily the words you use) is the second-strongest signal.
        </p>
        <h3>3. Live retrieval signals</h3>
        <p>
          In browsing/search mode, ChatGPT performs a real search and weighs the live results. Standard SEO levers apply: sites that rank well for the query, have schema markup, and load quickly are more likely to be cited.
        </p>

        <h2>Mention rate benchmarks by category</h2>
        <p>
          Useful sanity checks for what &quot;good&quot; looks like. These are rough averages from our cross-customer data; treat them as a directional guide, not a target.
        </p>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Top-1 brand mention rate</th>
              <th>Top-5 brand mention rate</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Mature SaaS (CRM, helpdesk)</td><td>30-50%</td><td>10-25%</td></tr>
            <tr><td>Emerging SaaS (AI tooling)</td><td>15-30%</td><td>5-15%</td></tr>
            <tr><td>Local services</td><td>20-40%</td><td>5-12%</td></tr>
            <tr><td>Ecommerce DTC brands</td><td>10-25%</td><td>3-10%</td></tr>
            <tr><td>Niche / specialist tools</td><td>5-20%</td><td>2-8%</td></tr>
          </tbody>
        </table>

        <h2>Improving your ChatGPT mention rate: a 5-step playbook</h2>
        <ol>
          <li><strong>Pick the 10 prompts that matter.</strong> Not the prompts where you wish customers asked - the ones they actually ask. Sales transcripts and support tickets are the goldmine.</li>
          <li><strong>Run a baseline.</strong> Sample each prompt 30 times across all five major engines. Aggregate to a single mention-rate number per prompt.</li>
          <li><strong>Audit citation profiles.</strong> Identify the third-party sites that cite the brands ChatGPT prefers. Those are the sites you need to be on.</li>
          <li><strong>Ship one citation a week.</strong> A G2 listing, a roundup inclusion, a Reddit thread. Earned coverage compounds; ads do not.</li>
          <li><strong>Measure weekly.</strong> Mention rate moves slowly but it moves. A 5-percentage-point lift over six weeks is a real win.</li>
        </ol>

        <h2>ChatGPT vs Perplexity vs Gemini: which to prioritise</h2>
        <table>
          <thead>
            <tr>
              <th>Engine</th>
              <th>Audience type</th>
              <th>Citation style</th>
              <th>Update cadence</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>ChatGPT</td><td>Mass market, all verticals</td><td>Inline mentions, sometimes citations in browsing mode</td><td>Weekly to monthly</td></tr>
            <tr><td>Perplexity</td><td>Researchers, B2B buyers</td><td>Always cited, footnoted answers</td><td>Daily; live retrieval</td></tr>
            <tr><td>Claude</td><td>Developers, knowledge workers</td><td>Mentions; citations in Claude-Web mode</td><td>Weekly</td></tr>
            <tr><td>Gemini / AI Overviews</td><td>Search-intent users</td><td>Inline links to ranking pages</td><td>Continuous (Google-driven)</td></tr>
            <tr><td>Grok</td><td>X / social audiences</td><td>Mentions; less citation discipline</td><td>Daily</td></tr>
          </tbody>
        </table>

        <h2>Common mistakes when interpreting results</h2>
        <ul>
          <li><strong>Drawing conclusions from one check.</strong> LLMs are stochastic. The same prompt can mention you on run 1 and skip you on run 2. Always sample.</li>
          <li><strong>Optimising for prompts your customers do not ask.</strong> &quot;Best AI tool 2026&quot; is too broad to convert. Specific intent prompts (&quot;best AI tool to track competitor pricing for a 5-person team under $100/mo&quot;) are where mention rate matters.</li>
          <li><strong>Confusing &quot;mentioned&quot; with &quot;recommended&quot;.</strong> Being named in a long list is not the same as being the headline answer. The paid product distinguishes between top-3 and tail mentions.</li>
          <li><strong>Ignoring sentiment.</strong> A negative mention can be worse than no mention. ChatGPT does occasionally surface concerns; the paid product runs sentiment analysis on every result.</li>
        </ul>

        <FaqSection
          items={[
            {
              q: 'Why does ChatGPT sometimes mention my brand and sometimes not?',
              a: 'Large language models sample probabilistically. The same prompt can produce different answers across runs. That is why mention rate (out of N runs) matters more than any single check. Continuous tracking samples each prompt many times and reports the rate, not a snapshot.',
            },
            {
              q: 'Which model do you use?',
              a: 'gpt-5 by default - the model behind the standard ChatGPT experience. The exact model is shown in the result. If you want to compare models, our paid tracker runs against gpt-5, gpt-5-mini and gpt-5-search.',
            },
            {
              q: 'Are you using ChatGPT Search (the live-fetch mode)?',
              a: 'No - the free tool uses the standard chat completion API, which is the experience most users get when they ask a question. ChatGPT Search uses different prompts and fetches live URLs; we cover both modes in the paid product.',
            },
            {
              q: 'Will the same brand always be detected?',
              a: 'We do a case-insensitive substring match. That catches normal mentions and most styling variants. If your brand is a single common word ("Apple", "Stripe", "Linear") you may want to test with a more specific question to disambiguate.',
            },
            {
              q: 'What counts as a "competitor"?',
              a: 'A capitalised, brand-style term named in the same response - a list item, a quote, or a colon-prefixed mention. The heuristic is intentionally conservative; the paid product uses NER + a curated brand graph for higher fidelity.',
            },
            {
              q: 'I hit the daily cap. What now?',
              a: 'Sign up for a free Livesov account. Free accounts can track several prompts on a daily schedule across ChatGPT, Perplexity, Claude, Gemini and Grok - all five major engines, not just ChatGPT.',
            },
            {
              q: 'How long until improvements show up in mention rate?',
              a: 'For ChatGPT, expect 4-12 weeks between a citation-building action (G2 listing, roundup inclusion) and a measurable mention-rate lift. Live-retrieval engines like Perplexity and AI Overviews respond faster - often within 1-2 weeks.',
            },
            {
              q: 'Does ChatGPT mention rate correlate with revenue?',
              a: 'For B2B SaaS in particular, yes - we see strong correlation between ChatGPT inclusion on top-of-funnel prompts and pipeline volume. The relationship is not linear, but the ranking of brands in the answer correlates strongly with customer shortlist composition.',
            },
            {
              q: 'Why does ChatGPT sometimes invent details about my brand?',
              a: 'Hallucinations happen when the model has incomplete or contradictory data. The fix is the same as for mention rate: more high-quality, consistent third-party citations. The paid product surfaces hallucinations explicitly so you can correct the underlying source.',
            },
            {
              q: 'Should I mention competitors on my own site to be co-mentioned?',
              a: 'Counterintuitively, yes - thoughtful comparison and alternative pages improve your AI visibility because they reinforce category co-occurrence. The pattern is well-documented; the same logic powers the /vs/ pages on most competitive SaaS sites.',
            },
          ]}
        />

        <RelatedTools
          items={[
            { slug: 'citation-finder', name: 'AI Citation Finder', tagline: 'See which URLs Perplexity and ChatGPT cite in their answers.' },
            { slug: 'competitor-finder', name: 'AI Competitor Finder', tagline: 'Discover the top 10 brands AI recommends in your industry.' },
            { slug: 'share-of-voice-calculator', name: 'Share of Voice Calculator', tagline: 'Compute share of voice across mentions and total responses.' },
          ]}
        />
      </ToolArticle>
    </ToolPage>
  );
}
