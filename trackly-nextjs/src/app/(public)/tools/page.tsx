import Link from 'next/link';
import SeoLayout, { Breadcrumbs } from '@/components/seo/SeoLayout';

interface Tool {
  slug: string;
  name: string;
  tagline: string;
  bullets: string[];
  badge?: string;
}

const TOOLS: Tool[] = [
  {
    slug: 'llms-txt-generator',
    name: 'llms.txt Generator',
    tagline: 'Build a valid llms.txt for your site in seconds.',
    bullets: ['Crawls your sitemap', 'Groups URLs by section', 'Copy or download the file'],
    badge: 'No signup',
  },
  {
    slug: 'ai-crawler-checker',
    name: 'AI Crawler Checker',
    tagline: 'Test whether 13 AI crawlers can access your URL.',
    bullets: ['GPTBot, ClaudeBot, PerplexityBot', 'Google-Extended, CCBot and more', 'Reads your live robots.txt'],
    badge: 'No signup',
  },
  {
    slug: 'chatgpt-mention-checker',
    name: 'ChatGPT Mention Checker',
    tagline: 'See if ChatGPT mentions your brand for any question.',
    bullets: ['Free instant check', 'Surfaces competitor mentions', '1 query per day per IP'],
  },
  {
    slug: 'share-of-voice-calculator',
    name: 'AI Share of Voice Calculator',
    tagline: 'Compute share of voice across mentions and total responses.',
    bullets: ['Add unlimited competitors', 'Live percentages and bars', 'Export to CSV'],
    badge: 'No signup',
  },
  {
    slug: 'geo-score-checker',
    name: 'GEO Score Checker',
    tagline: 'Get a single GEO score for any page in seconds.',
    bullets: ['Lightweight version of our audit', 'No signup required', 'Per-category scoring'],
    badge: 'No signup',
  },
  {
    slug: 'ai-readiness-audit',
    name: 'AI Readiness Audit',
    tagline: 'Full breakdown across 50+ AI-readiness checkpoints.',
    bullets: ['Per-category scores and findings', 'Concrete recommendations', 'Email-gated PDF report'],
  },
  {
    slug: 'prompt-generator',
    name: 'Prompt Generator',
    tagline: 'Generate 50+ brand monitoring prompts for any industry.',
    bullets: ['Discovery, comparison, alternative templates', 'Copy or download CSV', 'No signup'],
    badge: 'No signup',
  },
  {
    slug: 'citation-finder',
    name: 'AI Citation Finder',
    tagline: 'See which URLs Perplexity and ChatGPT cite in their answers.',
    bullets: ['Detects markdown and raw URLs', 'Highlights your domain', 'Choose Perplexity or ChatGPT'],
  },
  {
    slug: 'competitor-finder',
    name: 'AI Competitor Finder',
    tagline: 'Discover the top 10 brands AI recommends in your industry.',
    bullets: ['Industry + optional region', 'Ranked list with descriptions', 'No signup required'],
    badge: 'No signup',
  },
  {
    slug: 'nap-verification',
    name: 'NAP Verification Tool',
    tagline: 'Audit citation consistency across all your local listings.',
    bullets: ['Fetches and extracts NAP from each URL', 'Flags wrong phone, old address, duplicates', 'Bulk CSV import, consistency score, CSV export'],
    badge: 'No signup',
  },
];

export default function ToolsHubPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Free Tools', url: '/tools' }]} />
      <section className="land-hero" style={{ paddingTop: 80, paddingBottom: 40, textAlign: 'center' }}>
        <h1 style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.2, marginBottom: 14 }}>
          Free <span style={{ color: 'var(--brand)' }}>GEO &amp; AI Visibility</span> Tools
        </h1>
        <p style={{ fontSize: 17, color: 'rgba(255,255,255,.7)', maxWidth: 620, margin: '0 auto' }}>
          Ten free utilities to help you understand and improve how AI platforms see your brand.
          No signup required for most. Built by the team behind Livesov.
        </p>
      </section>

      <section style={{ padding: '32px 24px 80px', maxWidth: 1080, margin: '0 auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 20,
          }}
        >
          {TOOLS.map((tool) => (
            <Link
              key={tool.slug}
              href={`/tools/${tool.slug}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                background: '#fff',
                borderRadius: 14,
                padding: 24,
                boxShadow: '0 4px 20px rgba(0,0,0,.06)',
                textDecoration: 'none',
                color: 'inherit',
                border: '1px solid #f0f0f0',
                transition: 'transform .15s, box-shadow .15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>{tool.name}</h2>
                {tool.badge && (
                  <span style={{ background: '#dcfce7', color: '#166534', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                    {tool.badge.toUpperCase()}
                  </span>
                )}
              </div>
              <p style={{ fontSize: 14, color: '#4b5563', margin: '0 0 14px', lineHeight: 1.55 }}>{tool.tagline}</p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#6b7280', lineHeight: 1.7, flex: 1 }}>
                {tool.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <div style={{ marginTop: 16, fontSize: 13, fontWeight: 700, color: 'var(--brand)' }}>
                Open tool →
              </div>
            </Link>
          ))}
        </div>

        <div style={{ marginTop: 48, padding: 32, borderRadius: 14, background: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,.06)', textAlign: 'center' }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e', margin: '0 0 8px' }}>Want continuous AI visibility tracking?</h2>
          <p style={{ fontSize: 14, color: '#4b5563', margin: '0 0 18px' }}>
            Free tools give you a snapshot. Livesov tracks AI mentions across ChatGPT, Perplexity, Claude, Gemini and Grok every day.
          </p>
          <Link
            href="/signup"
            style={{
              display: 'inline-block',
              padding: '14px 32px',
              borderRadius: 10,
              background: 'var(--brand)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
              textDecoration: 'none',
            }}
          >
            Start tracking free
          </Link>
        </div>
      </section>
    </SeoLayout>
  );
}
