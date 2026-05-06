'use client';

import { useMemo, useState } from 'react';
import ToolPage, { cardStyle, inputStyle, labelStyle, PrimaryButton, ErrorBanner, ToolArticle, FaqSection, RelatedTools } from '@/components/tools/ToolPage';

// Templates grouped by intent. Each template is filled by replacing {industry},
// {brand}, {audience}, {region}. We aim for 50+ unique prompts.
const TEMPLATES: { category: string; templates: string[] }[] = [
  {
    category: 'Discovery',
    templates: [
      'What are the best {industry} companies in 2026?',
      'Recommend the top 10 {industry} brands.',
      'Who are the leading {industry} providers right now?',
      'Which {industry} companies should I look at first?',
      'List the most popular {industry} tools today.',
      'What are the most innovative {industry} startups?',
      'Top {industry} brands trusted by professionals?',
      'Which {industry} companies are growing fastest?',
    ],
  },
  {
    category: 'Comparison',
    templates: [
      'Compare the best {industry} solutions side by side.',
      'How does {brand} compare to other {industry} options?',
      '{brand} vs the top alternatives - which is better?',
      'What are the main differences between leading {industry} platforms?',
      'Which {industry} platform has the best pricing?',
      'Which {industry} tool offers the best value for money?',
      'Best {industry} platforms ranked by features.',
    ],
  },
  {
    category: 'Use case',
    templates: [
      'Best {industry} tool for {audience}?',
      'Which {industry} platform works best for small teams?',
      'Top {industry} solutions for enterprises?',
      'Best {industry} tool for freelancers?',
      'Recommend a {industry} platform for agencies.',
      'Which {industry} tool is easiest to get started with?',
      'Best self-serve {industry} platform?',
    ],
  },
  {
    category: 'Alternatives',
    templates: [
      'What are the best alternatives to {brand}?',
      'Cheaper alternatives to {brand}?',
      'Open-source alternatives to {brand}?',
      'Free alternatives to {brand}?',
      'What tools are similar to {brand}?',
      '{brand} alternatives in 2026?',
    ],
  },
  {
    category: 'Reviews & trust',
    templates: [
      'Is {brand} a legitimate {industry} company?',
      'What do users say about {brand}?',
      'Reviews of {brand}?',
      'Pros and cons of using {brand}?',
      'Is {brand} worth the price?',
      'What are common complaints about {brand}?',
    ],
  },
  {
    category: 'Pricing',
    templates: [
      'How much does {brand} cost?',
      'What are the pricing tiers for {industry} tools?',
      'Most affordable {industry} platform?',
      'Best value {industry} subscription?',
      'Free {industry} tools to try first?',
    ],
  },
  {
    category: 'How-to',
    templates: [
      'How do I choose a {industry} tool?',
      'How does {brand} work?',
      'How to get started with {industry} tools?',
      'What features should a {industry} platform have?',
      'How to evaluate {industry} vendors?',
    ],
  },
  {
    category: 'Local',
    templates: [
      'Best {industry} services in {region}?',
      'Top {industry} providers near {region}?',
      'Local {industry} companies in {region}?',
      '{region} {industry} recommendations?',
    ],
  },
];

function fill(template: string, industry: string, brand: string, audience: string, region: string): string {
  return template
    .replace(/\{industry\}/g, industry || '[industry]')
    .replace(/\{brand\}/g, brand || '[brand]')
    .replace(/\{audience\}/g, audience || 'small businesses')
    .replace(/\{region\}/g, region || '[region]');
}

export default function PromptGeneratorPage() {
  const [industry, setIndustry] = useState('');
  const [brand, setBrand] = useState('');
  const [audience, setAudience] = useState('');
  const [region, setRegion] = useState('');
  const [generated, setGenerated] = useState<{ category: string; prompt: string }[] | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const totalAvailable = useMemo(() => TEMPLATES.reduce((s, g) => s + g.templates.length, 0), []);

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!industry.trim()) {
      setError('Industry is required.');
      return;
    }
    const prompts: { category: string; prompt: string }[] = [];
    for (const group of TEMPLATES) {
      for (const tpl of group.templates) {
        // Skip brand-specific prompts if no brand provided
        if (tpl.includes('{brand}') && !brand.trim()) continue;
        // Skip region-specific prompts if no region provided
        if (tpl.includes('{region}') && !region.trim()) continue;
        prompts.push({ category: group.category, prompt: fill(tpl, industry.trim(), brand.trim(), audience.trim(), region.trim()) });
      }
    }
    setGenerated(prompts);
  };

  const copyAll = async () => {
    if (!generated) return;
    const text = generated.map((p, i) => `${i + 1}. ${p.prompt}`).join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadCsv = () => {
    if (!generated) return;
    const header = 'Category,Prompt';
    const lines = generated.map((p) => `"${p.category.replace(/"/g, '""')}","${p.prompt.replace(/"/g, '""')}"`);
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'brand-tracking-prompts.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <ToolPage
      title={<>AI <span style={{ color: 'var(--brand)' }}>Prompt</span> Generator</>}
      subtitle={`Get ${totalAvailable}+ ready-to-use brand-tracking prompts. Tell us your industry and we'll do the rest.`}
      toolName="Prompt Generator"
      toolSlug="prompt-generator"
    >
      <div style={cardStyle}>
        <form onSubmit={handleGenerate}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
            <div>
              <label htmlFor="industry" style={labelStyle}>Industry / category *</label>
              <input id="industry" type="text" required placeholder="e.g. AI visibility tracking" value={industry} onChange={(e) => setIndustry(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="brand" style={labelStyle}>Your brand <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
              <input id="brand" type="text" placeholder="e.g. Livesov" value={brand} onChange={(e) => setBrand(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="audience" style={labelStyle}>Audience <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
              <input id="audience" type="text" placeholder="e.g. SaaS founders" value={audience} onChange={(e) => setAudience(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="region" style={labelStyle}>Region <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
              <input id="region" type="text" placeholder="e.g. London" value={region} onChange={(e) => setRegion(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <PrimaryButton type="submit">Generate prompts</PrimaryButton>
        </form>
        <ErrorBanner message={error} />
      </div>

      {generated && (
        <div style={{ ...cardStyle, marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>{generated.length} prompts</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={copyAll} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #e0e0e0', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                {copied ? 'Copied!' : 'Copy all'}
              </button>
              <button type="button" onClick={downloadCsv} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Download CSV
              </button>
            </div>
          </div>

          {Array.from(new Set(generated.map((p) => p.category))).map((cat) => (
            <div key={cat} style={{ marginBottom: 22 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px' }}>{cat}</h3>
              <ol style={{ margin: 0, paddingLeft: 20, color: '#1a1a2e', fontSize: 14, lineHeight: 1.9 }}>
                {generated.filter((p) => p.category === cat).map((p, i) => (
                  <li key={i}>{p.prompt}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}

      <ToolArticle>
        <h2>Why prompts are the unit of AI brand tracking</h2>
        <p>
          Search keywords are how customers find <em>links</em>. Prompts are how customers find <em>answers</em>. The shift from one to the other is reshaping how brands measure visibility - and the prompts you choose to track decide what story your dashboard tells.
        </p>
        <p>
          A good tracked prompt mirrors what a real customer would type into ChatGPT or Perplexity at the moment they decide to evaluate vendors. A bad one is a keyword pasted into a prompt with no context. The first 50 prompts you track should cover discovery, comparison, alternatives and use-case fit - not the same long-tail keyword in five voices.
        </p>

        <h2>The eight prompt categories we cover</h2>
        <ul>
          <li><strong>Discovery</strong> - &quot;what are the best X tools?&quot;. The widest funnel. AI gives a top-N list.</li>
          <li><strong>Comparison</strong> - &quot;compare A and B&quot;. Mid-funnel. AI gives features and trade-offs.</li>
          <li><strong>Use case</strong> - &quot;best X for agencies / SaaS / freelancers&quot;. Persona-fit prompts. High intent.</li>
          <li><strong>Alternatives</strong> - &quot;alternatives to A&quot;. Late-funnel. AI gives shortlists where you should be present.</li>
          <li><strong>Reviews and trust</strong> - &quot;is A legit?&quot;. Risk-reduction prompts. Mention rate matters but sentiment matters more.</li>
          <li><strong>Pricing</strong> - &quot;how much does A cost?&quot;. Late-funnel. Brands with public pricing dominate here.</li>
          <li><strong>How-to</strong> - &quot;how to choose X&quot;. Education funnel. Win these and you set the buying criteria.</li>
          <li><strong>Local</strong> - &quot;best X in {'{region}'}&quot;. For local services and regional SaaS, this is the entire game.</li>
        </ul>

        <h2>How to use the generated list</h2>
        <ol>
          <li>Copy the full list into a spreadsheet or paste into Livesov to track them automatically.</li>
          <li>Pick the 10-30 prompts that match the moments your customers are actually deciding. Skip the rest.</li>
          <li>Run each prompt 30+ times across each AI engine. (We do this for you on a daily schedule.)</li>
          <li>Track mention rate per prompt and per engine. Patterns appear in 2-3 weeks.</li>
          <li>Add new prompts as you launch new product lines, new use cases, or new geographies.</li>
        </ol>

        <div className="callout">
          <strong>Pro tip:</strong> ask your sales team for the exact words their best inbound leads use in discovery calls. Those are the prompts that matter most. Generic templates get you started; sales transcripts get you to truth.
        </div>

        <h2>What makes a high-signal prompt</h2>
        <ul>
          <li><strong>Specific category</strong> - &quot;ai visibility tracking software&quot; beats &quot;ai tools&quot;.</li>
          <li><strong>Real intent verbs</strong> - &quot;recommend&quot;, &quot;compare&quot;, &quot;help me choose&quot;.</li>
          <li><strong>Optional persona qualifier</strong> - &quot;for a small agency&quot;, &quot;under $50/mo&quot;.</li>
          <li><strong>Brand-named where appropriate</strong> - half your prompts should test you by name; half should test the category without naming you.</li>
          <li><strong>Avoid leading the model</strong> - &quot;is Livesov the best?&quot; produces a different (worse) signal than &quot;what are the best AI visibility tools?&quot;.</li>
        </ul>

        <FaqSection
          items={[
            {
              q: 'Are these prompts based on real search data?',
              a: 'They are templates derived from the structure of buying-intent prompts we observe in customer logs. They cover the categories that drive most decisions; the specifics come from you when you fill in the industry, brand, audience and region fields.',
            },
            {
              q: 'How many prompts should I actually track?',
              a: '10-30 is plenty for most B2B SaaS. Local and ecommerce can need 100+ to cover regional and product variants. Tracking too many dilutes attention; tracking too few misses the breadth of how customers actually phrase questions.',
            },
            {
              q: 'How is this different from a keyword tool?',
              a: 'Keyword tools optimise for search-volume + difficulty. This generates conversational prompts in a buyer’s natural language. The two are complementary - keywords still drive your blog plan; prompts drive your AI visibility plan.',
            },
            {
              q: 'Can I import these into Livesov?',
              a: 'Yes. Export the CSV and bulk-import into your Livesov account. From there each prompt is sampled across all five AI engines on a schedule.',
            },
            {
              q: 'Why are there fewer prompts when I leave brand or region empty?',
              a: 'Brand-specific and region-specific templates need that input to make sense. We hide them rather than fill in placeholders that produce nonsense queries.',
            },
          ]}
        />

        <RelatedTools
          items={[
            { slug: 'chatgpt-mention-checker', name: 'ChatGPT Mention Checker', tagline: 'Test one of your prompts against ChatGPT now.' },
            { slug: 'share-of-voice-calculator', name: 'Share of Voice Calculator', tagline: 'Once you have run the prompts, compute your SoV.' },
            { slug: 'competitor-finder', name: 'AI Competitor Finder', tagline: 'See who AI recommends in the same vertical.' },
          ]}
        />
      </ToolArticle>
    </ToolPage>
  );
}
