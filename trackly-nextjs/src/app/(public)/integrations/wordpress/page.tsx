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
import { PLUGIN_VERSION, PLUGIN_DOWNLOAD_URL as DOWNLOAD_URL } from '@/lib/connect/plugin';

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
    icon: '🧱',
    title: 'Works with page builders',
    description:
      'Elementor, Divi, WPBakery, Beaver Builder, Bricks, Oxygen, Gutenberg, Classic. Each one stores content somewhere different — the plugin detects which is in charge and writes where that builder actually renders from.',
  },
  {
    icon: '✎',
    title: 'Ships page edits as drafts',
    description:
      'Content fixes are parked behind a preview link that works on any builder — and without a wp-admin login. Nothing on the live page changes until you publish from Livesov.',
  },
  {
    icon: '↺',
    title: 'Reversible by design',
    description:
      'Every publish snapshots the previous state first — post content and builder data alike — so one click in Settings → Livesov Connector puts the page back.',
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
    description: `Grab livesov-connector.zip (v${PLUGIN_VERSION}) from the download button on this page. Plain PHP - no build step, no Composer, no dependencies.`,
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
      'No. Fix Engine can also connect a WordPress site over the REST API using an Application Password - one click, nothing installed. That route writes through the REST API, which means it edits post_content, so it is the weaker option on a page-builder site. Use the plugin when the site runs Elementor, Divi, Beaver Builder, Bricks or Oxygen, when you want llms.txt and /.well-known files written to the site root, or when Application Passwords are disabled on your install.',
  },
  {
    question: 'What are the requirements?',
    answer:
      'WordPress 5.6 or newer, PHP 7.4 or newer, and outbound HTTPS from your server to livesov.com. You need an admin account (the manage_options capability) to install and connect it. No other plugin is required, and it works with any theme.',
  },
  {
    question: 'Will the plugin change my live pages without asking?',
    answer:
      'No. Technical fixes - llms.txt, robots.txt, head schema - apply automatically once you approve them in Livesov, because they are additive and reversible. Page content edits never touch the live page: the change is parked behind a preview URL, and only goes live when you explicitly publish it from Livesov. Every publish also snapshots the previous state first, so it can be undone from Settings → Livesov Connector.',
  },
  {
    question: 'Does it work with Elementor, Divi, and other page builders?',
    answer:
      'Yes - that is the main thing version 1.3 added. The plugin detects which builder owns each page and writes to where that builder actually stores its content: Elementor\'s JSON tree, Beaver Builder\'s node graph, Divi and WPBakery shortcodes, Bricks elements, Oxygen\'s JSON (with the legacy shortcode format as a fallback), Gutenberg blocks, or plain post_content. Rewriting a passage works on all eight. Adding a block is a native builder element on Gutenberg, Classic, Elementor, Divi, WPBakery, and Bricks; on Beaver Builder it renders through a content filter after the builder output; on Oxygen it is refused, because Oxygen renders its own template and a block placed there would never appear.',
  },
  {
    question: 'What stops it from mangling my layout?',
    answer:
      'It refuses more than it forces. A passage is only replaced when it can be located unambiguously and when the replacement would not cross a structural boundary - a shortcode, a Gutenberg block delimiter, a section wrapper. If the text appears twice, has changed since Livesov crawled it, or can only be matched by swallowing layout markup, the fix fails with the reason and is retried rather than applied. Full-body replacement is refused outright on builders that store their layout outside the post body.',
  },
  {
    question: 'Can I undo a change the plugin made?',
    answer:
      'Yes. Settings → Livesov Connector has a Page changes table listing every page the Connector staged or published, the builder it detected, and an "Undo this change" button that restores the pre-publish snapshot. This matters because WordPress revisions only cover post_content and are no help on a builder-driven page - so the plugin keeps its own snapshot of the builder data too.',
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
        subtitle="The Livesov Connector plugin applies the fixes you approve - llms.txt, AI-crawler rules, head schema, and real page-content edits - directly to your WordPress site. Elementor, Divi, WPBakery, Beaver Builder, Bricks and Oxygen included. Install once, connect in one click, and stop copying snippets between two tabs."
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

          <Callout title="There is a no-plugin route too" variant="tip">
            Fix Engine can also connect a WordPress site over the REST API with an{' '}
            <strong>Application Password</strong> - one click in the dashboard, nothing installed.
            It edits through the REST API and therefore through <code>post_content</code>, so it is
            the weaker choice on a page-builder site. Reach for the plugin when the site runs
            Elementor, Divi, Beaver Builder, Bricks or Oxygen, when you want <code>llms.txt</code>{' '}
            and <code>/.well-known/</code> files written to the site root, or when Application
            Passwords are disabled on your install.
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

          <h2 id="builders">Page builders</h2>
          <p>
            A WordPress page is only <em>sometimes</em> its <code>post_content</code>. Elementor
            renders a JSON tree stored in postmeta and ignores <code>post_content</code> entirely.
            Beaver Builder keeps a serialized node graph. Divi and WPBakery keep shortcodes. Bricks
            and Oxygen each have their own meta key.
          </p>
          <p>
            This is the failure mode that makes most &quot;auto-apply SEO&quot; tools useless on
            real sites: they write the fix into <code>post_content</code>, the database update
            genuinely succeeds, the tool reports success — and the live page looks exactly the same,
            because the builder never reads that field. The Connector routes every content edit
            through an adapter that knows where each builder actually keeps its content.
          </p>

          <h3>What is supported where</h3>
          <ul>
            <li>
              <strong>Rewrite a passage</strong> — supported on all eight: Gutenberg, Classic,
              Elementor, Divi, WPBakery, Beaver Builder, Bricks, and Oxygen.
            </li>
            <li>
              <strong>Add a block</strong> (FAQ, TL;DR, schema section) — added as a native builder
              element on Gutenberg, Classic, Elementor, Divi, WPBakery, and Bricks. On Beaver
              Builder the block renders through a <code>the_content</code> filter instead, so it
              appears after the builder&rsquo;s output rather than inside it. On <strong>Oxygen</strong>{' '}
              it is refused outright: Oxygen renders its own template and never runs{' '}
              <code>the_content</code>, so a block placed there would be accepted and then never
              appear — and a fix that reports success while changing nothing is worse than one that
              fails. Add those in the builder. Livesov reports which path was used.
            </li>
            <li>
              <strong>Title, meta description, canonical, robots</strong> — builder-independent, and
              written into both the Yoast and Rank Math fields.
            </li>
            <li>
              <strong>Replace the whole page body</strong> — deliberately refused on builders that
              store their layout outside the post body. Overwriting there would erase the layout, so
              the plugin declines and says so rather than doing it.
            </li>
          </ul>

          <Callout title="It refuses more than it forces" variant="note">
            A passage is only replaced when it can be located unambiguously and the replacement
            would not cross a structural boundary — a shortcode, a block delimiter, a section
            wrapper. If the passage appears twice, or has been edited since Livesov crawled it, or
            can only be matched by swallowing layout markup, the fix fails with the reason instead
            of guessing. A failed fix is a retry; a corrupted layout is a rebuild.
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
              <code>stage_content</code> — computes the edit and parks it behind a{' '}
              <strong>tokenised preview URL</strong>. The published page is untouched, and the
              preview works on any builder without a wp-admin login, so whoever is reviewing the fix
              in Livesov can just open the link.
            </li>
            <li>
              <code>publish_content</code> — promotes the staged change to live, after snapshotting
              the previous state (post content <em>and</em> builder data) so it can be undone.
            </li>
          </ul>
          <p>
            Every instruction is signed{' '}
            <code>HMAC-SHA256(id | op | sha256(content))</code> and verified before it runs. After
            applying, the plugin acknowledges back to Livesov, so the dashboard reflects what
            actually landed - including which builder it detected, and any failure with its reason,
            retried on the next poll.
          </p>

          <h2 id="undo">Undoing a change</h2>
          <p>
            WordPress revisions only carry <code>post_content</code>, which means they are no help
            at all on a builder-driven page. So every publish also writes its own snapshot of the
            previous state — including the builder&rsquo;s data — before touching anything.
          </p>
          <p>
            Go to <strong>Settings → Livesov Connector</strong> and you will find a{' '}
            <strong>Page changes</strong> table: every page the Connector has staged or published,
            which builder it detected, and an <strong>Undo this change</strong> button. You never
            have to open Livesov to find out what was changed on your own site, or to put it back.
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
            resolved a URL that WordPress does not map to a post. The plugin already retries against
            your site&rsquo;s own home URL to absorb www/non-www and trailing-slash differences, so
            this usually means the page really has moved or the brand&rsquo;s configured domain
            points somewhere else. Check the domain in your brand settings and re-run.
          </p>
          <p>
            <strong>&quot;passage not found on the page&quot;.</strong> The page has been edited
            since Livesov crawled it, so the text the fix was written against is gone. Re-run the
            scan to pick up the current copy, then regenerate the fix.
          </p>
          <p>
            <strong>&quot;passage appears more than once&quot;.</strong> The snippet occurs in two
            places (often a hero and a footer CTA sharing a line), and blindly picking one would be
            a coin flip. Make the target passage unique on the page, or apply that one by hand.
          </p>
          <p>
            <strong>&quot;would break the page structure&quot;.</strong> The passage spans a
            structural boundary — two Divi modules, two Gutenberg blocks, a section wrapper — so
            replacing it would take the layout with it. Split the fix into per-block edits, or apply
            it in the builder.
          </p>
          <p>
            <strong>&quot;renders its own template, so a new block can only be added in the
            builder&quot;.</strong> An Oxygen page. Oxygen bypasses <code>the_content</code>{' '}
            entirely, so there is no safe place for the plugin to put a new block. Paste it into
            Oxygen yourself — rewrites of existing passages still apply automatically.
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
