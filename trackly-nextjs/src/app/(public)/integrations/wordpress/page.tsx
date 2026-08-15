import type { Metadata } from 'next';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import {
  Section,
  SectionHeader,
  StatsBar,
  FeatureGrid,
  ProcessSteps,
  FaqSection,
  Callout,
  LongForm,
  PillarLinks,
} from '@/components/seo/SeoSections';
import EmailOff from '@/components/EmailOff';

const PLUGIN_VERSION = '1.2.1';
const DOWNLOAD_URL = '/wordpress-plugin/livesov-connector.zip';

export const metadata: Metadata = {
  title: 'Livesov WordPress Plugin: What It Is & How to Install It',
  description:
    'The Livesov Connector plugin applies your approved AI-visibility fixes - llms.txt, robots.txt AI-crawler rules, head schema, and draft page edits - straight to WordPress. Download, install, and connect in about two minutes.',
  keywords:
    'livesov wordpress plugin, livesov connector, ai visibility wordpress plugin, llms.txt wordpress plugin, geo wordpress plugin, ai crawler robots.txt wordpress, schema wordpress plugin',
  alternates: { canonical: '/integrations/wordpress' },
  openGraph: {
    title: 'Livesov WordPress Plugin: What It Is & How to Install It',
    description:
      'Apply approved llms.txt, robots.txt, schema, and draft page fixes to WordPress automatically. Install and connect in two minutes.',
    url: 'https://livesov.com/integrations/wordpress',
    siteName: 'Livesov',
    type: 'article',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Livesov WordPress Plugin',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Livesov WordPress Plugin: What It Is & How to Install It',
    description:
      'Apply approved llms.txt, robots.txt, schema, and draft page fixes to WordPress automatically.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const capabilities = [
  {
    icon: '📄',
    title: 'Publishes your llms.txt',
    description:
      'Livesov generates the llms.txt for your brand and the plugin writes it to your site root - so AI crawlers get the summary you wrote, not the one they guess.',
  },
  {
    icon: '🤖',
    title: 'Opens robots.txt to AI crawlers',
    description:
      'GPTBot, ClaudeBot, PerplexityBot, and Google-Extended rules are appended through WordPress\'s robots_txt filter. No file to hand-edit, nothing to lose on a theme update.',
  },
  {
    icon: '◆',
    title: 'Injects head schema & meta',
    description:
      'Organization, Product, and FAQ JSON-LD plus canonical and meta tags print on wp_head. Your theme files are never touched.',
  },
  {
    icon: '✎',
    title: 'Ships page edits as drafts',
    description:
      'Content fixes land as a draft revision with a preview link. Nothing on the live page changes until you click publish in Livesov.',
  },
  {
    icon: '↺',
    title: 'Reversible by design',
    description:
      'Publishing goes through wp_update_post, which snapshots the previous version first. Every change can be rolled back from wp-admin → Revisions.',
  },
  {
    icon: '🔒',
    title: 'Outbound-only',
    description:
      'The plugin polls Livesov every 5 minutes. Nothing needs inbound access to your server - no open endpoint, no firewall change, no SFTP credentials.',
  },
];

const installSteps = [
  {
    title: 'Download the plugin',
    description: `Grab livesov-connector.zip (v${PLUGIN_VERSION}) from the download button on this page. It is a single-file plugin - no build step, no dependencies.`,
  },
  {
    title: 'Upload it to WordPress',
    description:
      'In wp-admin, go to Plugins → Add New → Upload Plugin, choose the zip, and click Install Now.',
  },
  {
    title: 'Activate Livesov Connector',
    description:
      'Click Activate. The plugin registers a wp-cron job that polls Livesov every 5 minutes for approved fixes.',
  },
  {
    title: 'Connect it to your brand',
    description:
      'Go to Settings → Livesov Connector and click Connect with Livesov. Approve the site, and the first sync runs immediately.',
  },
];

const connectSteps = [
  {
    title: 'Click "Connect with Livesov"',
    description:
      'From Settings → Livesov Connector in wp-admin. WordPress hands off to Livesov the same way a "Sign in with Google" button would.',
  },
  {
    title: 'Log in and pick a brand',
    description:
      'Livesov shows you the site requesting access and the brands on your account. Choose which brand this WordPress site belongs to.',
  },
  {
    title: 'Approve',
    description:
      'You are bounced back to wp-admin with the credentials already filled in. Nothing to copy, nothing to paste.',
  },
  {
    title: 'Confirm the first sync',
    description:
      'The settings page shows "Connected to Livesov" and a last-poll timestamp. Any fix already approved in Livesov is applied on the spot.',
  },
];

const faqs = [
  {
    question: 'Is the Livesov WordPress plugin free?',
    answer:
      'Yes. The plugin is free and is not gated behind a plan tier - any Livesov account with a brand can pair it. It is only useful with an account, though: the plugin is the delivery mechanism for fixes your Livesov brand generates, so it needs a brand to connect to.',
  },
  {
    question: 'Is the plugin on the WordPress.org plugin directory?',
    answer:
      'No - it is distributed as a zip from this page. Install it through Plugins → Add New → Upload Plugin, which is a first-class WordPress flow and works identically to a directory install. The one practical difference is updates: you upload a newer zip rather than clicking Update in wp-admin.',
  },
  {
    question: 'Do I have to install a plugin to connect WordPress at all?',
    answer:
      'No. Fix Engine can also connect a WordPress site over the REST API using an Application Password - one click, nothing installed. The plugin is the better option when you want llms.txt and /.well-known files written to the site root, or when Application Passwords are disabled on your install; the Application Password route is the better option when you would rather not add a plugin.',
  },
  {
    question: 'What are the requirements?',
    answer:
      'WordPress 5.6 or newer, PHP 7.4 or newer, and outbound HTTPS from your server to livesov.com. You need an admin account (the manage_options capability) to install and connect it. No other plugin is required, and it works with any theme.',
  },
  {
    question: 'Will the plugin change my live pages without asking?',
    answer:
      'No. Technical fixes - llms.txt, robots.txt, head schema - apply automatically once you approve them in Livesov, because they are additive and reversible. Page content edits never touch the live page: they are saved as a draft revision with a preview URL, and only go live when you explicitly publish them from Livesov.',
  },
  {
    question: 'Does it conflict with Yoast or Rank Math?',
    answer:
      'No - it cooperates with them. When Livesov ships a title, meta description, or canonical change, the plugin writes it into both the Yoast and Rank Math meta fields, so whichever SEO plugin you run picks it up and stays the single source of truth for that page.',
  },
  {
    question: 'What access does the plugin give Livesov to my site?',
    answer:
      'None, in the inbound sense - Livesov never connects to your server. The plugin makes outbound requests only, authenticated with a per-brand bearer token. Each instruction it receives is HMAC-signed and verified before it is applied, and file writes are restricted to an allow-list of /llms.txt, /robots.txt, and /.well-known/ paths.',
  },
  {
    question: 'How do I disconnect or rotate the credentials?',
    answer:
      'Revoke the connection from Fix Engine → Connections in Livesov, which invalidates the token immediately. Re-pairing issues a fresh token and signing secret. Deactivating the plugin in WordPress also clears its scheduled poll; anything already written stays in place until you remove it.',
  },
  {
    question: 'Can I use it on a site that is not WordPress?',
    answer:
      'The plugin is WordPress-specific, but the fixes are not. For any other stack, Livesov gives you the same instructions as copy-paste snippets or a signed API feed you can apply in your own deploy pipeline.',
  },
];

const downloadButton = (
  <a
    href={DOWNLOAD_URL}
    download
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      padding: '14px 26px',
      background: 'var(--brand, #6366f1)',
      color: '#fff',
      fontWeight: 800,
      fontSize: 15,
      borderRadius: 10,
      textDecoration: 'none',
    }}
  >
    ⇩ Download the plugin (v{PLUGIN_VERSION})
  </a>
);

export default function WordPressIntegrationPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Integrations', url: '/integrations' },
          { name: 'WordPress', url: '/integrations/wordpress' },
        ]}
      />

      <SeoHero
        title={
          <>
            Livesov +{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#6366f1]">
              WordPress
            </span>
          </>
        }
        subtitle="The Livesov Connector plugin applies the fixes you approve - llms.txt, AI-crawler rules, head schema, and page edits - directly to your WordPress site. Install it once, connect in one click, and stop copying snippets between two tabs."
        hideCta
      />

      <Section pad="0 24px 24px" width={1000}>
        <div style={{ textAlign: 'center' }}>{downloadButton}</div>
      </Section>

      <Section pad="24px 24px 56px" width={1000}>
        <StatsBar
          stats={[
            { value: `v${PLUGIN_VERSION}`, label: 'Current plugin version' },
            { value: '5 min', label: 'Sync interval' },
            { value: '1 click', label: 'To connect a site' },
            { value: '0', label: 'Inbound ports opened' },
          ]}
        />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="72px 24px">
        <SectionHeader
          label="What the plugin is"
          title="The delivery arm of the Livesov Fix Engine"
          subtitle="Livesov finds what is holding your brand back in AI answers. The plugin is what puts the fix on your site - without a developer, an FTP client, or a theme edit."
        />
        <FeatureGrid items={capabilities} columns={3} />
      </Section>

      <Section pad="72px 24px">
        <SectionHeader
          label="Installation"
          title="Install it in about two minutes"
          subtitle="Standard WordPress zip upload. No build step, no Composer, no server access needed."
        />
        <ProcessSteps steps={installSteps} />
        <div style={{ textAlign: 'center', marginTop: 32 }}>{downloadButton}</div>
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="72px 24px">
        <SectionHeader
          label="Connecting"
          title="One click, no copy-paste"
          subtitle="The connect flow is an OAuth-style handshake. The browser only ever carries a short-lived, single-use code - the token and signing secret are exchanged server-to-server, so they never appear in a URL or your browser history."
        />
        <ProcessSteps steps={connectSteps} />
      </Section>

      <Section pad="72px 24px">
        <LongForm>
          <h2 id="requirements">Before you start</h2>
          <ul>
            <li>
              <strong>WordPress 5.6+</strong> and <strong>PHP 7.4+</strong> (both several years
              past end-of-life, so almost any live site qualifies).
            </li>
            <li>
              An <strong>administrator account</strong> on the WordPress site - installing and
              connecting both require the <code>manage_options</code> capability.
            </li>
            <li>
              <strong>Outbound HTTPS</strong> from your server to <code>livesov.com</code>. Managed
              hosts allow this by default; locked-down enterprise hosts may need it allow-listed.
            </li>
            <li>
              A <strong>Livesov brand</strong> to connect the site to. Create one first if your
              account is brand new - the approval screen has nothing to attach to otherwise.
            </li>
          </ul>

          <Callout title="You may not need the plugin at all" variant="tip">
            Fix Engine can also connect a WordPress site over the REST API with an{' '}
            <strong>Application Password</strong> - one click in the dashboard, nothing installed.
            Reach for the plugin when you want <code>llms.txt</code> and <code>/.well-known/</code>{' '}
            files written to the site root, or when Application Passwords are disabled on your
            install. Both routes support ship-as-draft.
          </Callout>

          <h2 id="manual">Connecting manually (fallback)</h2>
          <p>
            If your site sits behind an auth wall that breaks the redirect handshake - a staging
            environment behind HTTP basic auth, a VPN-only admin, an aggressive WAF - you can pair
            the connection by hand instead:
          </p>
          <ol>
            <li>
              In Livesov, open <strong>Fix Engine → Connections → Connector plugin</strong> and click{' '}
              <strong>Pair</strong>. Copy the <strong>Pull URL</strong>, <strong>Token</strong>, and{' '}
              <strong>Signing secret</strong>. They are shown once.
            </li>
            <li>
              In wp-admin, go to <strong>Settings → Livesov Connector → Connect manually</strong>,
              paste all three values, and save.
            </li>
            <li>
              Click <strong>Poll now</strong> to apply anything already approved, rather than
              waiting for the next 5-minute cycle.
            </li>
          </ol>

          <Callout title="Keep the signing secret" variant="note">
            The plugin refuses any instruction it cannot verify against the signing secret. If you
            skip that field, every fix will fail with{' '}
            <em>&quot;signing secret missing&quot;</em> until you re-pair. That is deliberate: the
            signature is what stops anyone holding only the bearer token from injecting markup into
            your <code>&lt;head&gt;</code>.
          </Callout>

          <h2 id="what-changes">What actually changes on your site</h2>
          <p>
            Worth being precise about, because &quot;an SEO plugin that edits your site&quot; is a
            fair thing to be nervous about. The plugin supports exactly five operations, and nothing
            else:
          </p>
          <ul>
            <li>
              <code>write_file</code> — writes root files, restricted to an allow-list of{' '}
              <code>/llms.txt</code>, <code>/robots.txt</code>, and <code>/.well-known/*</code>.
              Traversal and every other path are rejected outright.
            </li>
            <li>
              <code>patch_robots</code> — appends AI-crawler rules through WordPress&rsquo;s{' '}
              <code>robots_txt</code> filter, so it works with the virtual robots.txt and survives
              theme and core updates.
            </li>
            <li>
              <code>set_header_block</code> — stores schema and meta markup that prints on{' '}
              <code>wp_head</code>. No theme file is ever written.
            </li>
            <li>
              <code>stage_content</code> — saves a page edit as a <strong>draft revision</strong>{' '}
              via <code>wp_create_post_autosave</code> and returns a preview URL. The published page
              is untouched.
            </li>
            <li>
              <code>publish_content</code> — promotes the staged draft to live, snapshotting the
              previous version into a revision on the way so it stays reversible.
            </li>
          </ul>
          <p>
            Every instruction is signed{' '}
            <code>HMAC-SHA256(id | op | sha256(content))</code> and verified before it runs. After
            applying, the plugin acknowledges back to Livesov, so the dashboard reflects what
            actually landed - including failures, with the reason, retried on the next poll.
          </p>

          <h2 id="troubleshooting">Troubleshooting</h2>
          <p>
            <strong>&quot;Connect failed: the request expired or didn&rsquo;t match.&quot;</strong>{' '}
            The handshake nonce is valid for 15 minutes. Start the connect flow again and complete
            it in one sitting - most often this means the tab sat open overnight.
          </p>
          <p>
            <strong>&quot;Could not exchange the authorization code.&quot;</strong> Your server
            could not reach <code>livesov.com</code> over HTTPS, or the code was already used. Check
            outbound firewall rules first, then retry the connect flow.
          </p>
          <p>
            <strong>Last poll says &quot;pull HTTP 401&quot;.</strong> The token was revoked or
            rotated in Livesov. Re-pair from Settings → Livesov Connector.
          </p>
          <p>
            <strong>Nothing happens after 5 minutes.</strong> WordPress&rsquo;s wp-cron only fires
            on site traffic, so a low-traffic site can lag. Click <strong>Poll now</strong> to force
            it, or switch to a real system cron (<code>DISABLE_WP_CRON</code> plus a server-side
            cron hitting <code>wp-cron.php</code>) if your site is quiet.
          </p>
          <p>
            <strong>&quot;signature mismatch&quot; on every instruction.</strong> The signing secret
            in WordPress no longer matches the one Livesov holds. Re-pair the connector; the secret
            is issued fresh each time.
          </p>
          <p>
            <strong>&quot;page not found on this site&quot; on a content fix.</strong> Livesov
            resolved a URL that WordPress does not map to a post - usually a trailing-slash or
            www/non-www mismatch between your brand&rsquo;s configured domain and the site&rsquo;s
            actual home URL. Align them in your brand settings and re-run.
          </p>

          <h2 id="updating">Updating the plugin</h2>
          <p>
            Until the WordPress.org listing is live, updates are a zip upload: download the current
            version from this page, then use <strong>Plugins → Add New → Upload Plugin</strong> and
            confirm the replace prompt. Your connection settings live in the WordPress options
            table, so they survive the upgrade - you will not need to reconnect.
          </p>

          <Callout title="Not on WordPress?" variant="tip">
            The Connector is the convenience layer, not the product. Every fix Livesov generates is
            also available as a copy-paste snippet or through a signed API feed you can wire into
            any stack - Next.js, Shopify, Webflow, a static site, your own deploy pipeline. See the{' '}
            <a href="/integrations/api">REST API</a>.
          </Callout>

          <p>
            Something not covered here? Email{' '}
            <EmailOff>
              <a href="mailto:hello@livesov.com">hello@livesov.com</a>
            </EmailOff>{' '}
            - we read everything.
          </p>
        </LongForm>
      </Section>

      <FaqSection
        title="WordPress plugin FAQ"
        subtitle="Requirements, safety, updates, and what the plugin can and cannot touch."
        items={faqs}
      />

      <PillarLinks
        title="More ways to plug Livesov in"
        links={[
          {
            href: '/integrations/slack',
            label: 'Slack integration',
            description: 'Real-time alerts and weekly digests in any Slack channel.',
          },
          {
            href: '/integrations/zapier',
            label: 'Zapier integration',
            description: '5,000+ apps via Zapier triggers and actions.',
          },
          {
            href: '/integrations/api',
            label: 'REST API',
            description: 'Apply the same fixes from your own deploy pipeline.',
          },
          {
            href: '/integrations',
            label: 'All integrations',
            description: 'Every LLM, alert route, export format, and API surface.',
          },
        ]}
      />
    </SeoLayout>
  );
}
