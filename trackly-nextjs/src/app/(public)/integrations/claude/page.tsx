import type { Metadata } from 'next';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import {
  Section,
  SectionHeader,
  FeatureGrid,
  ProcessSteps,
  FaqSection,
  Callout,
  LongForm,
  PillarLinks,
} from '@/components/seo/SeoSections';

export const metadata: Metadata = {
  title: 'Claude Connector: Livesov AI Visibility Data in Claude | Livesov',
  description:
    'Connect Livesov to Claude with our MCP connector. Ask Claude about your AI visibility, Google rankings, competitors, buyer questions and fixes. OAuth sign-in, no API key needed.',
  keywords:
    'livesov claude connector, livesov mcp, ai visibility mcp server, claude mcp connector, livesov claude',
  alternates: { canonical: '/integrations/claude' },
  openGraph: {
    title: 'Livesov Connector for Claude',
    description: 'Bring your Livesov AI visibility data into Claude through MCP.',
    url: 'https://livesov.com/integrations/claude',
    siteName: 'Livesov',
    type: 'article',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Livesov + Claude' }],
  },
};

const features = [
  { icon: '📊', title: 'Visibility scores', description: 'Share of voice, per-engine scores, tone and history for every brand on your account.' },
  { icon: '🏁', title: 'Competitor ranking', description: 'Which rivals AI answers name most, and the gap between you and the next one.' },
  { icon: '❓', title: 'Buyer questions', description: 'The questions you win and lose, and which rival gets named instead.' },
  { icon: '💬', title: 'AI answer excerpts', description: 'Real mentions with position, tone and cited sources, filterable by engine.' },
  { icon: '🛠', title: 'Fix list', description: 'Recommendations sorted by severity. Claude can mark a fix in progress, done or ignored.' },
  { icon: '▶️', title: 'Start scans', description: 'Kick off a new scan from chat and check its progress. Scans use your plan credits.' },
];

const steps = [
  { title: 'Add the connector', description: 'In Claude open Settings → Connectors. Find Livesov in the directory, or click "Add custom connector" and paste https://livesov.com/api/mcp' },
  { title: 'Sign in to Livesov', description: 'Claude opens the Livesov consent screen. Log in and approve access. No API key to copy.' },
  { title: 'Ask Claude', description: 'Turn the connector on in a chat and ask about your brands. Claude calls the Livesov tools for you.' },
];

const tools = [
  ['list_brands', 'Brands on your account with latest share of voice and last scan', 'Read'],
  ['get_visibility', 'Share of voice, change, per-engine scores, tone, goal and history', 'Read'],
  ['get_competitors', 'Rival ranking by share of mentions and gap to the next rival', 'Read'],
  ['get_questions', 'Winning and losing buyer questions and the rivals named instead', 'Read'],
  ['get_mentions', 'AI answer excerpts with position, tone and sources', 'Read'],
  ['get_cited_sources', 'Most cited domains and your own-site citations', 'Read'],
  ['get_recommendations', 'Fix list, most severe first', 'Read'],
  ['update_recommendation', 'Set a fix to open, in progress, done or ignored', 'Write'],
  ['get_accuracy', 'Wrong facts AI states compared to your saved brand facts', 'Read'],
  ['get_credits', 'Plan, credits left and manual scans left today', 'Read'],
  ['start_scan', 'Starts a new scan (spends credits) and returns a run id', 'Write'],
  ['get_scan_status', 'Progress of a running scan', 'Read'],
  ['list_rank_websites', 'Rank-tracked websites with average position and top 10 count', 'Read'],
  ['get_rank_positions', 'Google position, change and ranking URL for each keyword', 'Read'],
  ['add_rank_keywords', 'Start tracking keywords on Google (uses rank credits)', 'Write'],
  ['get_rank_credits', 'Rank tracking credits used and left', 'Read'],
];

const faqs = [
  { question: 'Do I need a paid Livesov plan?', answer: 'You need a Livesov account. The connector works on every plan, including the trial. Tools that start scans use your normal plan credits.' },
  { question: 'Which Claude apps work?', answer: 'Claude on the web, Claude Desktop and Claude mobile through Connectors, plus Claude Code and any other MCP client that supports remote servers over Streamable HTTP.' },
  { question: 'What can Claude see?', answer: 'Only the brands your Livesov user can already see in the dashboard. Team roles, brand access and plan limits apply exactly as they do in the app.' },
  { question: 'How do I disconnect?', answer: 'Remove the connector in Claude, or go to Dashboard → Account & Plan → Connected apps in Livesov and disconnect Claude. That revokes every token it holds.' },
  { question: 'Can I use an API key instead of OAuth?', answer: 'Yes, for clients that do not support OAuth. Create a key in Account & Plan and send it as Authorization: Bearer lsv_... to https://livesov.com/api/mcp.' },
  { question: 'Who do I contact for help?', answer: 'Email hello@livesov.com. We reply within one business day.' },
];

export default function ClaudeIntegrationPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Integrations', url: '/integrations' }, { name: 'Claude', url: '/integrations/claude' }]} />

      <SeoHero
        title={
          <>
            Livesov +{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#6366f1]">Claude</span>
          </>
        }
        subtitle="The Livesov connector brings your AI visibility data into Claude. Ask how your brand shows up in ChatGPT, Gemini, Perplexity, Claude and Google AI Overviews, see which competitors win, and work your fix list from chat."
        ctaText="Start free"
        ctaHref="/signup"
      />

      <Section background="var(--bg-section, #f7f5f1)" pad="72px 24px">
        <SectionHeader label="What Claude can do" title="Your Livesov dashboard, inside the chat" subtitle="Sixteen tools over a secure MCP connection." />
        <FeatureGrid items={features} columns={3} />
      </Section>

      <Section pad="72px 24px">
        <SectionHeader label="Setup" title="Connect in under a minute" />
        <ProcessSteps steps={steps} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="64px 24px">
        <LongForm>
          <Callout title="Connection details" variant="note">
            Server URL: <code>https://livesov.com/api/mcp</code>
            <br />
            Transport: Streamable HTTP. Auth: OAuth 2.1 with PKCE and dynamic client registration.
          </Callout>

          <h2>Example prompts</h2>
          <ul>
            <li>&quot;How visible is my brand in AI answers this month, and which engine dropped the most?&quot;</li>
            <li>&quot;Which competitors does ChatGPT recommend instead of us, and for which buyer questions?&quot;</li>
            <li>&quot;Show me the top five fixes for my brand and mark the first one as in progress.&quot;</li>
            <li>&quot;Which websites do AI answers cite most in my category? Is my own site cited?&quot;</li>
            <li>&quot;Start a new scan for my brand and tell me when it finishes.&quot;</li>
          </ul>

          <h2>Tools</h2>
          <table>
            <thead>
              <tr><th>Tool</th><th>What it does</th><th>Type</th></tr>
            </thead>
            <tbody>
              {tools.map(([name, desc, type]) => (
                <tr key={name}><td><code>{name}</code></td><td>{desc}</td><td>{type}</td></tr>
              ))}
            </tbody>
          </table>

          <h2>Security and data</h2>
          <p>
            Access tokens last one hour and refresh tokens rotate every 30 days. Codes and tokens
            are stored only as hashes. Requests are limited to 120 per minute per connection. Claude
            only receives data your Livesov user can already see. Read our{' '}
            <a href="/privacy">privacy policy</a> and <a href="/terms">terms</a>.
          </p>

          <h2>Support</h2>
          <p>
            Email <a href="mailto:hello@livesov.com">hello@livesov.com</a> for help with the connector.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="Claude connector FAQ" items={faqs} />

      <PillarLinks
        title="More ways to plug Livesov in"
        links={[
          { href: '/integrations/api', label: 'API & webhooks', description: 'What is available today.' },
          { href: '/integrations/wordpress', label: 'WordPress plugin', description: 'Apply approved fixes straight to your site.' },
          { href: '/integrations/slack', label: 'Slack', description: 'Fix Engine updates in any channel.' },
          { href: '/integrations', label: 'All integrations', description: 'Every LLM, alert route, and export format.' },
        ]}
      />
    </SeoLayout>
  );
}
