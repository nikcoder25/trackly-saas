import Link from 'next/link';
import SeoLayout, { Breadcrumbs } from '@/components/seo/SeoLayout';
import '@/styles/site-tools.css';

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
    bullets: ['Fetches and extracts NAP from each URL', 'Flags wrong phone, old address, duplicates', 'Saved audits, scheduled alerts, CSV + PDF export'],
    badge: 'Dashboard',
  },
];

export default function ToolsHubPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Free Tools', url: '/tools' }]} />
      <section className="ls-wrap ls-tool-hero">
        <span className="ls-eyebrow">Free tools</span>
        <h1 className="ls-h1">
          Free GEO &amp; AI visibility <span className="ls-em acc">tools.</span>
        </h1>
        <p className="ls-lead">
          Ten free utilities to help you understand and improve how AI platforms see your brand.
          No signup required for most. Built by the team behind Livesov.
        </p>
      </section>

      <section className="ls-wrap" style={{ paddingTop: 16, paddingBottom: 72 }}>
        <div className="ls-grid ls-grid-3w">
          {TOOLS.map((tool) => (
            <Link key={tool.slug} href={`/tools/${tool.slug}`} className="ls-hub-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <h2>{tool.name}</h2>
                {tool.badge && (
                  <span className={'ls-hub-badge' + (tool.badge === 'Dashboard' ? ' dash' : '')}>{tool.badge}</span>
                )}
              </div>
              <p className="ls-small">{tool.tagline}</p>
              <ul>
                {tool.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <span className="ls-mono" style={{ fontSize: 13, color: 'var(--ls-accent-ink)' }}>Open tool →</span>
            </Link>
          ))}
        </div>
      </section>
    </SeoLayout>
  );
}
