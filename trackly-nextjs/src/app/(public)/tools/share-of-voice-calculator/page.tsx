'use client';

import { useState, useMemo } from 'react';
import ToolPage, { cardStyle, inputStyle, labelStyle, ToolArticle, FaqSection, RelatedTools, AnswerCapsule, KeyTakeaways, ExpertQuote, ArticleSchema } from '@/components/tools/ToolPage';

interface BrandRow {
  id: number;
  name: string;
  mentions: number;
}

let nextId = 4;

export default function ShareOfVoiceCalculatorPage() {
  const [totalResponses, setTotalResponses] = useState<number>(100);
  const [yourBrand, setYourBrand] = useState<string>('Your brand');
  const [yourMentions, setYourMentions] = useState<number>(0);
  const [competitors, setCompetitors] = useState<BrandRow[]>([
    { id: 1, name: 'Competitor 1', mentions: 0 },
    { id: 2, name: 'Competitor 2', mentions: 0 },
    { id: 3, name: 'Competitor 3', mentions: 0 },
  ]);

  const rows = useMemo(() => {
    const all = [{ id: 0, name: yourBrand || 'Your brand', mentions: yourMentions, isYou: true }, ...competitors.map((c) => ({ ...c, isYou: false }))];
    const total = Math.max(totalResponses, 1);
    return all.map((r) => ({
      ...r,
      sov: (r.mentions / total) * 100,
    }));
  }, [totalResponses, yourBrand, yourMentions, competitors]);

  const yourSov = rows[0].sov;
  const sumMentions = rows.reduce((s, r) => s + r.mentions, 0);
  const overMentioned = sumMentions > totalResponses;

  const updateCompetitor = (id: number, patch: Partial<BrandRow>) => {
    setCompetitors((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const addCompetitor = () => {
    setCompetitors((prev) => [...prev, { id: nextId++, name: `Competitor ${prev.length + 1}`, mentions: 0 }]);
  };

  const removeCompetitor = (id: number) => {
    setCompetitors((prev) => prev.filter((c) => c.id !== id));
  };

  const downloadCsv = () => {
    const header = 'Brand,Mentions,Total Responses,Share of Voice (%)';
    const lines = rows.map((r) => `"${r.name.replace(/"/g, '""')}",${r.mentions},${totalResponses},${r.sov.toFixed(2)}`);
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ai-share-of-voice.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <ToolPage
      title={<>AI <span style={{ color: 'var(--brand)' }}>Share of Voice</span> Calculator</>}
      subtitle="Enter how often each brand was mentioned across your AI responses to compute share of voice."
      toolName="AI Share of Voice Calculator"
      toolSlug="share-of-voice-calculator"
    >
      <div style={cardStyle}>
        <div style={{ marginBottom: 24 }}>
          <label htmlFor="totalResponses" style={labelStyle}>Total AI responses sampled</label>
          <input
            id="totalResponses"
            type="number"
            min={1}
            value={totalResponses}
            onChange={(e) => setTotalResponses(Math.max(1, parseInt(e.target.value || '1', 10)))}
            style={{ ...inputStyle, maxWidth: 220 }}
          />
          <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
            Run the same prompt N times across ChatGPT, Perplexity, Claude, Gemini, Grok and count the responses.
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e', margin: '0 0 12px' }}>Your brand</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12 }}>
            <input
              type="text"
              value={yourBrand}
              onChange={(e) => setYourBrand(e.target.value)}
              style={inputStyle}
            />
            <input
              type="number"
              min={0}
              value={yourMentions}
              onChange={(e) => setYourMentions(Math.max(0, parseInt(e.target.value || '0', 10)))}
              style={inputStyle}
              aria-label="Mentions"
            />
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>Competitors</h3>
            <button
              type="button"
              onClick={addCompetitor}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e0e0e0', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              + Add competitor
            </button>
          </div>
          {competitors.map((c) => (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 40px', gap: 12, marginBottom: 10 }}>
              <input
                type="text"
                value={c.name}
                onChange={(e) => updateCompetitor(c.id, { name: e.target.value })}
                style={inputStyle}
              />
              <input
                type="number"
                min={0}
                value={c.mentions}
                onChange={(e) => updateCompetitor(c.id, { mentions: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                style={inputStyle}
                aria-label="Mentions"
              />
              <button
                type="button"
                onClick={() => removeCompetitor(c.id)}
                aria-label="Remove"
                style={{ borderRadius: 8, border: '1px solid #f0f0f0', background: '#fff', color: '#9ca3af', cursor: 'pointer', fontSize: 18 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {overMentioned && (
          <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: 13, border: '1px solid #fde68a' }}>
            Total mentions ({sumMentions}) exceed total responses ({totalResponses}). That&apos;s fine if multiple brands appear in the same response, but raise the total if you&apos;re tracking unique appearances.
          </div>
        )}
      </div>

      <div style={{ ...cardStyle, marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>Results</h2>
          <button
            type="button"
            onClick={downloadCsv}
            style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            Download CSV
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 64, fontWeight: 800, color: 'var(--brand)', lineHeight: 1 }}>{yourSov.toFixed(1)}%</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }}>{yourBrand}&apos;s AI share of voice</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows
            .slice()
            .sort((a, b) => b.sov - a.sov)
            .map((r) => (
              <div key={r.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: r.isYou ? 700 : 500, color: '#1a1a2e' }}>{r.name}{r.isYou ? ' (you)' : ''}</span>
                  <span style={{ color: '#6b7280' }}>{r.mentions} / {totalResponses} = <strong style={{ color: '#1a1a2e' }}>{r.sov.toFixed(1)}%</strong></span>
                </div>
                <div style={{ width: '100%', height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(r.sov, 100)}%`, height: '100%', background: r.isYou ? 'var(--brand)' : '#9ca3af' }} />
                </div>
              </div>
            ))}
        </div>
      </div>

      <ToolArticle>
        <ArticleSchema
          headline="Free AI Share of Voice Calculator: Measure Your Brand Inclusion in AI Answers"
          description="The complete guide to AI Share of Voice - the formula, how to gather data, benchmarks, growth levers, and a free calculator with CSV export."
          url="https://livesov.com/tools/share-of-voice-calculator"
          datePublished="2026-05-01"
          dateModified="2026-05-06"
        />

        <AnswerCapsule>
          <strong>AI Share of Voice (SoV)</strong> is the percentage of AI responses about your category that mention your brand. Formula: (mentions ÷ total responses) × 100. Sample at least 30 responses per prompt across all five AI engines for a reliable number. This calculator does the math, supports unlimited competitors, and exports to CSV - 100% client-side, no signup.
        </AnswerCapsule>

        <KeyTakeaways
          items={[
            'AI SoV measures inclusion in the answer, not the link list. The user reads the answer, so this is what counts.',
            'Sample size matters. 30+ responses per prompt smooths out the inherent randomness of LLM outputs.',
            'Aggregate across 10-30 prompts. A single prompt is a data point; a prompt portfolio is a measurement.',
            'Benchmark targets vary by category. Mature SaaS leaders sit at 30-50%; emerging brands at 5-15%.',
            'AI SoV moves slowly but it moves. A 5-percentage-point lift over a quarter is a real result.',
          ]}
        />

        <h2>What is AI Share of Voice?</h2>
        <p>
          AI Share of Voice (SoV) is the percentage of AI responses about your category that mention your brand. If you sample 100 ChatGPT answers about &quot;the best AI visibility tool&quot; and your brand appears in 23 of them, your AI SoV for that prompt is 23%.
        </p>
        <p>
          Unlike search SoV, which measures impressions or rankings, AI SoV measures inclusion in the <em>answer</em>. It is the cleanest way to compare yourself to competitors in the channel users actually consume.
        </p>

        <h2>The formula we use</h2>
        <blockquote>
          Share of Voice (%) = (mentions ÷ total responses) × 100
        </blockquote>
        <p>
          Run the same prompt N times, count how often each brand is named, divide. Repeat across the prompts that matter to your business and aggregate. The math is trivial - the discipline is in sampling enough responses (we recommend at least 30 per prompt) and across enough prompts (10 to 50, depending on category breadth).
        </p>

        <h2>How to gather the data</h2>
        <ol>
          <li>Pick the question your customers actually ask AI - not the question you wish they asked.</li>
          <li>Run the same prompt 30+ times across ChatGPT, Perplexity, Claude, Gemini and Grok. Sampling matters - LLMs are stochastic.</li>
          <li>Count brand mentions per response. Multiple mentions in the same response usually count as 1.</li>
          <li>Total responses = 5 platforms × 30 runs = 150 (or whatever sample size you actually achieved).</li>
          <li>Plug the numbers into this calculator. Repeat for each prompt and average.</li>
        </ol>

        <div className="callout">
          <strong>Doing this by hand?</strong> Sampling 5 platforms × 30 runs × 20 prompts is 3,000 manual queries. <a href="/signup">Livesov</a> automates this and reports a daily SoV per prompt and per platform.
        </div>

        <ExpertQuote
          quote="The teams that obsess over AI Share of Voice eat the teams that obsess over keyword rankings. The user is asking the engine, not the index. Measuring what the engine actually says is the only thing that matters."
          name="Nik Sov"
          title="Founder, Livesov"
        />

        <h2>Variants of AI Share of Voice</h2>
        <p>
          The single number is useful, but most teams quickly graduate to four sub-metrics that paint a fuller picture.
        </p>
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>What it measures</th>
              <th>When to use it</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Aggregate SoV</strong></td>
              <td>Mentions across all prompts and engines</td>
              <td>Board-level reporting; quarterly trend</td>
            </tr>
            <tr>
              <td><strong>Prompt-level SoV</strong></td>
              <td>Mentions for a single prompt across engines</td>
              <td>Identifying weak categories or use cases</td>
            </tr>
            <tr>
              <td><strong>Engine-level SoV</strong></td>
              <td>Mentions on one engine across prompts</td>
              <td>Spotting platform-specific gaps</td>
            </tr>
            <tr>
              <td><strong>Top-1 SoV</strong></td>
              <td>How often you are the FIRST brand mentioned</td>
              <td>Measuring category leadership</td>
            </tr>
          </tbody>
        </table>

        <h2>Reading your number</h2>
        <ul>
          <li><strong>0-5%</strong> - effectively invisible. AI never recommends you for this query.</li>
          <li><strong>5-15%</strong> - on the radar. You appear in some long-tail variants but rarely in the headline answer.</li>
          <li><strong>15-30%</strong> - established. Most well-known brands in a category sit here.</li>
          <li><strong>30-50%</strong> - dominant. You are the safe default the model reaches for first.</li>
          <li><strong>50%+</strong> - category-defining. Either you have a structural moat or the prompt is too narrow.</li>
        </ul>

        <h2>How to grow your AI Share of Voice</h2>
        <p>
          Five levers, ranked by how reliably they move the number for the average B2B SaaS or services business. Pick the top two and run them concurrently for a quarter before evaluating.
        </p>
        <ol>
          <li><strong>Earn third-party citations.</strong> G2, Capterra, niche subreddits, podcast roundups, comparison articles. The single highest-correlation lever in our data.</li>
          <li><strong>Ship comparison and alternatives pages.</strong> A clean <code>/vs/</code> and <code>/alternatives/</code> set teaches the model your category boundary and reinforces co-occurrence.</li>
          <li><strong>Make pricing transparent.</strong> AI engines under-recommend brands that hide pricing. A public price page, even a starting-from price, removes friction.</li>
          <li><strong>Open your AI crawl perimeter.</strong> Use the <a href="/tools/ai-crawler-checker">AI Crawler Checker</a> to confirm GPTBot, ClaudeBot and PerplexityBot can fetch your important pages. Add <a href="/tools/llms-txt-generator">llms.txt</a> for explicit curation.</li>
          <li><strong>Track and iterate weekly.</strong> SoV changes more slowly than search rankings, but it does move - and it shifts faster every quarter as more buyers start with AI.</li>
        </ol>

        <h2>Use cases for the calculator</h2>
        <ul>
          <li><strong>Founder report</strong> - a single SoV number to put on the monthly investor update.</li>
          <li><strong>Marketing planning</strong> - decompose by prompt to find the gaps your next campaign should close.</li>
          <li><strong>Competitive analysis</strong> - run the same calculator with competitors as the focal brand to gauge their standing.</li>
          <li><strong>PR proof</strong> - quantify the impact of a major launch or coverage push by re-running before and after.</li>
          <li><strong>Sales enablement</strong> - share the per-prompt breakdown with sales as proof of category presence.</li>
        </ul>

        <h2>Common mistakes</h2>
        <ul>
          <li><strong>Sampling too few responses.</strong> 5 runs is not a measurement, it is a coin flip. Use 30 minimum, 100 if you can.</li>
          <li><strong>Counting multiple mentions in one response as multiple data points.</strong> Most teams count it as a binary - mentioned or not - per response, per brand. That keeps the math interpretable.</li>
          <li><strong>Comparing your SoV to a competitor with a different prompt set.</strong> Different prompts produce different results. Apples to apples requires the same prompt portfolio.</li>
          <li><strong>Stopping after one measurement.</strong> SoV is a trend, not a snapshot. Re-run monthly to see whether the levers are actually moving the number.</li>
          <li><strong>Optimising for a number you cannot control.</strong> If your category has 200 viable competitors, top-1 SoV of 30% is a fantasy. Aim for top-5 SoV instead.</li>
        </ul>

        <FaqSection
          items={[
            {
              q: 'How is AI SoV different from traditional Share of Voice?',
              a: 'Traditional SoV is built from impressions, rankings or ad spend. AI SoV is built from inclusion in generative answers. The two correlate loosely - a brand that wins traditional SoV often wins AI SoV - but the levers are different. AI SoV rewards third-party citations, structured content and clean facts, not just keyword targeting.',
            },
            {
              q: 'How many responses should I sample?',
              a: 'For a single prompt: at least 30 responses to smooth out LLM variance. For a category overview: 10-50 prompts × 5 platforms × 30 runs. Most teams do not have time to do this manually, which is why automated tracking exists.',
            },
            {
              q: 'Can total mentions exceed total responses?',
              a: 'Yes - multiple brands often appear in the same response. The calculator warns you when sum-of-mentions exceeds total responses, which usually means you are tracking unique mentions per response per brand (correct) rather than co-mention combinations (rare).',
            },
            {
              q: 'What about regional differences?',
              a: 'AI SoV varies by region because the underlying training data and live-search results differ. If you sell in multiple markets, calculate SoV per region. The tool does not gate that - just rerun with locale-specific prompts.',
            },
            {
              q: 'Why does my SoV vary day to day?',
              a: 'Three reasons: model updates, RAG-source updates, and ordinary sampling variance. A 2-3 point swing per week is normal. A 10+ point swing usually means a model upgrade or a major change in citation sources.',
            },
            {
              q: 'Should I include AI Overviews in my SoV calculation?',
              a: 'Yes. AI Overviews appear above organic results for an estimated 40% of informational queries; ignoring them under-counts the channel. The paid product samples AI Overviews automatically.',
            },
            {
              q: 'Can I use this for branded queries (where my own brand is the subject)?',
              a: 'Yes, but the math is different. For "is X legit" or "X reviews" prompts, you measure sentiment and correctness rather than mention rate. The calculator handles the inclusion side; sentiment is in the paid product.',
            },
            {
              q: 'How does AI SoV relate to traditional Brand Tracking?',
              a: 'Traditional brand tracking measures unaided recall in surveys. AI SoV measures unaided recall by the AI - which is increasingly the substitute for human discovery. The two correlate but capture different moments: surveys catch the buyer at rest; AI SoV catches them at the point of decision.',
            },
          ]}
        />

        <RelatedTools
          items={[
            { slug: 'chatgpt-mention-checker', name: 'ChatGPT Mention Checker', tagline: 'See if ChatGPT mentions your brand for any question.' },
            { slug: 'competitor-finder', name: 'AI Competitor Finder', tagline: 'Discover the top 10 brands AI recommends.' },
            { slug: 'prompt-generator', name: 'Prompt Generator', tagline: 'Get 50+ brand-tracking prompts you can sample against.' },
          ]}
        />
      </ToolArticle>
    </ToolPage>
  );
}
