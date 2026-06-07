'use client';

import Link from 'next/link';
import ToolPage, {
  cardStyle,
  ToolArticle,
  FaqSection,
  RelatedTools,
  AnswerCapsule,
  KeyTakeaways,
  ExpertQuote,
  ArticleSchema,
} from '@/components/tools/ToolPage';

export default function NapVerificationPage() {
  return (
    <ToolPage
      title={
        <>
          NAP <span style={{ color: 'var(--brand)' }}>Verification</span> Tool
        </>
      }
      subtitle="Audit local citation consistency at scale. Enter a client's canonical NAP, add citation URLs, and Livesov fetches each page, extracts the NAP it shows, and flags every mismatch — saved per client and re-runnable to track progress."
      toolName="NAP Verification Tool"
      toolSlug="nap-verification"
    >
      <div style={{ ...cardStyle, textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e', margin: '0 0 10px' }}>
          Run NAP audits in your Livesov dashboard
        </h2>
        <p style={{ fontSize: 15, color: '#4b5563', lineHeight: 1.6, maxWidth: 540, margin: '0 auto 12px' }}>
          The NAP Verification Tool lives in your dashboard so you can save an audit per client, re-run
          it on a schedule, get alerted when a citation breaks, and export a branded PDF. Log in or
          start free to use it.
        </p>
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 auto 22px', maxWidth: 460, textAlign: 'left', fontSize: 14, color: '#374151', lineHeight: 1.9 }}>
          <li>✓ Fetches each citation and extracts NAP (JSON-LD → regex → headless render)</li>
          <li>✓ Flags wrong phone, old address, name variations, missing suite, dead links</li>
          <li>✓ Duplicate-listing detection and a consistency score you can track over time</li>
          <li>✓ Bulk CSV import, scheduled re-runs with email alerts, CSV + PDF export</li>
        </ul>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/signup"
            style={{ display: 'inline-block', padding: '14px 28px', borderRadius: 10, background: 'var(--brand)', color: '#fff', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}
          >
            Start free
          </Link>
          <Link
            href="/login?next=/dashboard/nap-audits"
            style={{ display: 'inline-block', padding: '14px 28px', borderRadius: 10, background: '#fff', color: 'var(--brand)', border: '1px solid var(--brand)', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}
          >
            Log in to run audits
          </Link>
        </div>
      </div>

      <ToolArticle>
        <ArticleSchema
          headline="NAP Verification Tool: Audit Local Citation Consistency at Scale"
          description="Audit local citation consistency. Fetch every citation page, extract the name, address and phone, and flag mismatches against your canonical NAP. The complete guide to citation consistency for local SEO."
          url="https://livesov.com/tools/nap-verification"
          datePublished="2026-06-07"
          dateModified="2026-06-07"
        />

        <AnswerCapsule>
          The <strong>NAP Verification Tool</strong> takes your correct name, address and phone (NAP),
          fetches each citation URL you add, extracts the NAP each page actually shows — first from{' '}
          <code>LocalBusiness</code> JSON-LD, then via regex over the raw HTML, then via an optional
          headless render — and flags every mismatch with a per-citation match score and an overall
          consistency score. Available in the Livesov dashboard.
        </AnswerCapsule>

        <KeyTakeaways
          items={[
            'NAP consistency is a confirmed local ranking factor — inconsistent citations confuse search engines and split your authority.',
            'The most common issues are an old phone number, a moved address, a name variation, and a dropped suite/unit.',
            'Structured data (LocalBusiness JSON-LD) is the cleanest source of truth; this tool reads it first and falls back to HTML.',
            'Save an audit per client and re-run it on a schedule to catch citations that break over time.',
            'A dead citation link is its own problem — it passes no signal and wastes the listing.',
          ]}
        />

        <h2>What NAP consistency is and why it matters</h2>
        <p>
          NAP stands for <strong>Name, Address, Phone</strong> — the three identity fields a local
          business publishes across directories, review sites and data aggregators. Search engines use
          the agreement between those listings as a trust signal: when dozens of independent sources
          all show the same NAP, the engine is confident the business is real and the details are
          current. When they disagree, that confidence drops, and so can your local ranking.
        </p>
        <p>
          The hard part is that NAP drifts silently. You change a phone provider, move office, add a
          suite number, or rebrand from &quot;Ltd&quot; to a trading name — and the old details linger
          on directories you forgot you ever submitted to. This tool turns that invisible drift into a
          concrete, exportable list.
        </p>

        <h2>How the tool extracts NAP from each page</h2>
        <p>It uses three layers, applied per field, with the cleaner source winning:</p>
        <ol>
          <li>
            <strong>Schema (Layer 2).</strong> Most quality directories embed a{' '}
            <code>LocalBusiness</code> JSON-LD block with structured <code>name</code>,{' '}
            <code>telephone</code> and a <code>PostalAddress</code>. This is the cleanest data, so we
            parse it first.
          </li>
          <li>
            <strong>Regex (Layer 1).</strong> When there is no schema, we fall back to the raw HTML —{' '}
            <code>tel:</code> links, <code>itemprop</code> microdata, and postcode/phone patterns in
            the visible text.
          </li>
          <li>
            <strong>Headless render (Layer 3).</strong> For JavaScript-heavy or bot-blocked directories,
            the page is re-rendered so its NAP becomes readable.
          </li>
        </ol>

        <h2>How to read your results</h2>
        <ul>
          <li>
            <strong>Consistency score</strong> — the average match score across every citation. Aim for
            85+. Anything lower means real inconsistencies are diluting your local signal.
          </li>
          <li>
            <strong>Per-field status</strong> — each field is tagged <em>match</em>, <em>variation</em>{' '}
            (close but not exact, e.g. &quot;St&quot; vs &quot;Street&quot;), <em>mismatch</em>{' '}
            (genuinely different), or <em>missing</em> (not found on the page).
          </li>
          <li>
            <strong>Issue tags</strong> — plain-English labels like &quot;wrong phone&quot;, &quot;old
            address&quot;, &quot;name variation&quot; and &quot;missing suite&quot; so you know exactly
            what to fix on each listing.
          </li>
          <li>
            <strong>Dead links</strong> — citations that returned an error or non-200 status. Fix or
            replace these first; they pass no value.
          </li>
        </ul>

        <ExpertQuote
          quote="Most local SEO audits die in a spreadsheet — someone opens forty directory pages by hand and eyeballs the phone number. Automating the fetch-and-compare step is the single biggest time saver in a citation audit. You go from a morning of grind to a thirty-second export."
          name="Nik Sov"
          title="Founder, Livesov"
        />

        <h2>The most common NAP mismatches</h2>
        <table>
          <thead>
            <tr>
              <th>Mismatch</th>
              <th>Typical cause</th>
              <th>Fix</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Wrong phone</td><td>Changed provider or added a tracking number</td><td>Update to your single canonical line everywhere</td></tr>
            <tr><td>Old address</td><td>Moved premises; old listing never updated</td><td>Claim the listing and correct it, or request removal</td></tr>
            <tr><td>Name variation</td><td>&quot;Ltd&quot; vs trading name, abbreviations</td><td>Pick one exact public-facing name and standardise</td></tr>
            <tr><td>Missing suite</td><td>Directory dropped the unit/suite line</td><td>Re-add the full address including the suite</td></tr>
            <tr><td>Dead link</td><td>Listing removed or directory restructured</td><td>Rebuild the citation or replace the source</td></tr>
          </tbody>
        </table>

        <FaqSection
          items={[
            {
              q: 'Where do I run a NAP audit?',
              a: 'In your Livesov dashboard, under Tools → NAP Audits. Save an audit per client with their canonical NAP and citation URLs; re-run it any time or on a weekly/monthly schedule.',
            },
            {
              q: 'How many URLs can I check per audit?',
              a: 'Up to 50 citation or backlink URLs per audit — paste a list or bulk-import a CSV. Runs process in the background so large batches complete reliably.',
            },
            {
              q: 'How does duplicate listing detection work?',
              a: 'When two or more of the URLs in an audit live on the same directory domain (e.g. two Yelp pages), we flag it as a possible duplicate listing — a common ranking-diluting problem. If those duplicates also disagree on phone, name or postcode, we mark the group "conflicting".',
            },
            {
              q: 'What counts as a variation versus a mismatch?',
              a: 'A variation is a close-but-not-exact value — "St" vs "Street", or a company suffix like "Ltd" dropped. A mismatch is a genuinely different value, like a different phone number or a moved address. Variations score half credit; mismatches score zero.',
            },
            {
              q: 'Can it alert me when a citation breaks?',
              a: 'Yes. Put a saved audit on a weekly or monthly schedule and Livesov re-runs it automatically, emailing you when the consistency score drops, a citation dies, or new mismatches appear.',
            },
            {
              q: 'How often should I run a NAP audit?',
              a: 'Quarterly for a stable business, and immediately after any move, rebrand or phone change. A weekly or monthly schedule keeps your local signal clean automatically.',
            },
          ]}
        />

        <RelatedTools
          items={[
            { slug: 'citation-finder', name: 'AI Citation Finder', tagline: 'See which URLs Perplexity and ChatGPT cite for your brand.' },
            { slug: 'geo-score-checker', name: 'GEO Score Checker', tagline: 'Score any page for AI and search readiness.' },
            { slug: 'ai-readiness-audit', name: 'AI Readiness Audit', tagline: 'Full breakdown across 50+ AI-readiness checkpoints.' },
          ]}
        />
      </ToolArticle>
    </ToolPage>
  );
}
