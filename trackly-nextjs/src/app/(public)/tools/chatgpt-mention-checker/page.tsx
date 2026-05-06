'use client';

import { useState } from 'react';
import Link from 'next/link';
import ToolPage, { cardStyle, inputStyle, labelStyle, PrimaryButton, ErrorBanner, ToolArticle, FaqSection, RelatedTools } from '@/components/tools/ToolPage';

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
        <h2>What this tool actually does</h2>
        <p>
          You give us a brand name and a question a real customer might ask. We send that question to ChatGPT (gpt-4o by default), then scan the response for your brand and the brands it mentions instead. The result is a single, honest answer: <em>does ChatGPT recommend you for this query, and who beats you when it doesn&apos;t?</em>
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

        <FaqSection
          items={[
            {
              q: 'Why does ChatGPT sometimes mention my brand and sometimes not?',
              a: 'Large language models sample probabilistically. The same prompt can produce different answers across runs. That is why mention rate (out of N runs) matters more than any single check. Continuous tracking samples each prompt many times and reports the rate, not a snapshot.',
            },
            {
              q: 'Which model do you use?',
              a: 'gpt-4o by default - the model behind the standard ChatGPT experience. The exact model is shown in the result. If you want to compare models, our paid tracker runs against gpt-4o, gpt-4o-mini and gpt-4o-search.',
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
