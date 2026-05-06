'use client';

import { useState } from 'react';
import ToolPage, { cardStyle, inputStyle, labelStyle, PrimaryButton, ErrorBanner, ToolArticle, FaqSection, RelatedTools } from '@/components/tools/ToolPage';

interface Brand {
  name: string;
  rank: number;
  description?: string;
}

interface Result {
  industry: string;
  region: string;
  platform: string;
  model: string;
  brands: Brand[];
  raw: string;
}

export default function CompetitorFinderPage() {
  const [industry, setIndustry] = useState('');
  const [region, setRegion] = useState('');
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
      const res = await fetch('/api/tools/competitor-finder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry: industry.trim(), region: region.trim(), website: honeypot }),
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
      title={<>AI <span style={{ color: 'var(--brand)' }}>Competitor</span> Finder</>}
      subtitle="See the top 10 brands AI recommends for your industry. No signup."
      toolName="AI Competitor Finder"
      toolSlug="competitor-finder"
    >
      <div style={cardStyle}>
        <form onSubmit={handleSubmit}>
          <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true" tabIndex={-1}>
            <label htmlFor="cmp-website">Website</label>
            <input id="cmp-website" type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 20 }}>
            <div>
              <label htmlFor="cfIndustry" style={labelStyle}>Industry / vertical *</label>
              <input
                id="cfIndustry"
                type="text"
                required
                maxLength={200}
                placeholder="e.g. AI visibility tracking software"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="cfRegion" style={labelStyle}>Region <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
              <input
                id="cfRegion"
                type="text"
                maxLength={120}
                placeholder="e.g. UK"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
          <PrimaryButton type="submit" loading={loading}>
            {loading ? 'Asking AI...' : 'Find AI-Recommended Brands'}
          </PrimaryButton>
          <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
            3 free checks per day. <a href="/signup" style={{ color: 'var(--brand)', fontWeight: 600 }}>Sign up</a> to track competitor mentions across every prompt, every day.
          </div>
        </form>
        <ErrorBanner message={error} />
      </div>

      {result && (
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={cardStyle}>
            <div style={{ marginBottom: 16, fontSize: 13, color: '#6b7280' }}>
              Top brands for <strong style={{ color: '#1a1a2e' }}>{result.industry}</strong>
              {result.region && <> in <strong style={{ color: '#1a1a2e' }}>{result.region}</strong></>} - via {result.platform}
            </div>
            {result.brands.length === 0 ? (
              <div style={{ padding: '14px 16px', borderRadius: 8, background: '#f9fafb', color: '#6b7280', fontSize: 13 }}>
                Couldn&apos;t parse a clean brand list. Raw response is below.
              </div>
            ) : (
              <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {result.brands.map((b) => (
                  <li
                    key={b.rank + b.name}
                    style={{
                      display: 'flex',
                      gap: 14,
                      alignItems: 'flex-start',
                      padding: 14,
                      borderRadius: 10,
                      background: '#f9fafb',
                      border: '1px solid #f0f0f0',
                    }}
                  >
                    <div style={{
                      flex: '0 0 36px',
                      height: 36,
                      borderRadius: '50%',
                      background: 'var(--brand)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: 14,
                    }}>
                      {b.rank}
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>{b.name}</div>
                      {b.description && <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4, lineHeight: 1.6 }}>{b.description}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <details style={cardStyle}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#1a1a2e', fontSize: 14 }}>Raw AI response</summary>
            <pre style={{ marginTop: 12, background: '#0f172a', color: '#e2e8f0', padding: 16, borderRadius: 8, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{result.raw}</pre>
          </details>
        </div>
      )}

      <ToolArticle>
        <h2>What this tool reveals</h2>
        <p>
          Ask any AI engine &quot;what are the best X companies?&quot; and you get a curated shortlist. That shortlist is the modern competitive set - whether you agree with it or not. This tool surfaces it for you in seconds, with one-line descriptions that show <em>how</em> the AI positions each brand.
        </p>
        <p>
          The competitors you see here are not always the ones your sales team flags or your analytics tools track. They are the ones the AI thinks are most relevant when a customer asks the question - and the customer never sees your spreadsheet.
        </p>

        <h2>Why AI competitive sets are different</h2>
        <ul>
          <li><strong>They reward citation density.</strong> A startup that earned coverage on G2 and Hacker News will outrank a larger competitor that only spends on paid search.</li>
          <li><strong>They lag and they jump.</strong> AI competitive sets update slowly during a model version, then shift abruptly when a new model ships. Track them monthly.</li>
          <li><strong>They vary by region.</strong> Use the optional region field to see how the set changes for the markets you sell into.</li>
          <li><strong>They include &quot;adjacent&quot; categories.</strong> AI often blurs adjacent verticals into one shortlist (CRM + sales engagement, ATS + HRIS). That blur is itself a positioning signal.</li>
        </ul>

        <h2>How to use the result</h2>
        <ol>
          <li>Compare the AI list to your internal &quot;known competitors&quot; list. The delta is the strategic surprise.</li>
          <li>For each brand the AI named that you didn&apos;t expect, study their citation profile - what review sites, podcasts, threads and lists feature them?</li>
          <li>For each brand you expected and the AI omitted, check whether <a href="/tools/ai-readiness-audit">your AI readiness</a> is comparable. The omission is usually structural, not a popularity contest.</li>
          <li>Rerun monthly per region. AI competitive sets are slow-moving but worth tracking quarterly at minimum.</li>
        </ol>

        <h2>Common mistakes</h2>
        <ul>
          <li><strong>Industry too vague.</strong> &quot;SaaS&quot; gets you Salesforce. &quot;AI visibility tracking software&quot; gets you the actual peer set.</li>
          <li><strong>Region accidentally global.</strong> Leaving the region field blank gives a US-skewed shortlist. Add &quot;UK&quot; or &quot;Germany&quot; to get the local truth.</li>
          <li><strong>Reading the description too literally.</strong> The AI description is a one-line summary, not a feature audit. Validate before quoting it in a sales deck.</li>
          <li><strong>Treating the order as a ranking.</strong> Order is correlated with prominence but is not a strict ranking - run the prompt 10 times and aggregate before drawing conclusions about position.</li>
        </ul>

        <FaqSection
          items={[
            {
              q: 'How is this different from doing the search myself?',
              a: 'It is not, fundamentally - we just save you the friction of opening a chat, framing the prompt and parsing the output. The value is in doing this systematically across regions and prompt variants, which is what continuous tracking handles.',
            },
            {
              q: 'Why does my biggest competitor not show up?',
              a: 'Three common reasons: (1) the AI is using the wrong category framing - tighten the industry input; (2) your competitor has weak citation density relative to the alternatives; (3) they have actively blocked AI training crawlers. Cross-check with /tools/ai-crawler-checker on their domain.',
            },
            {
              q: 'Why is the same brand listed twice?',
              a: 'Sometimes the AI lists a parent + product (e.g. "HubSpot" and "HubSpot CRM"). The parser deduplicates exact matches but tolerates variants. If you spot a true duplicate, treat it as a single entry.',
            },
            {
              q: 'Which model do you use?',
              a: 'We try ChatGPT first, fall back to Claude, then Gemini. The platform used is reported in the result so you can compare across runs if you want.',
            },
            {
              q: 'How accurate is the description?',
              a: 'Accurate enough for a strategy session, not a press release. The AI sometimes gets product positioning subtly wrong, especially for newer brands. Always verify before quoting externally.',
            },
            {
              q: 'What is the cap?',
              a: '3 free checks per day per IP. Each check is a paid AI call. To track competitive shifts continuously across regions and prompts, sign up.',
            },
          ]}
        />

        <RelatedTools
          items={[
            { slug: 'chatgpt-mention-checker', name: 'ChatGPT Mention Checker', tagline: 'Check if you appear in the same answer as the brands above.' },
            { slug: 'share-of-voice-calculator', name: 'Share of Voice Calculator', tagline: 'Quantify your standing against the competitive set.' },
            { slug: 'citation-finder', name: 'AI Citation Finder', tagline: 'See which URLs feed the AI’s view of your category.' },
          ]}
        />
      </ToolArticle>
    </ToolPage>
  );
}
