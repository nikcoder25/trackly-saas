'use client';

import { useRef, useState } from 'react';
import { extractUrlsFromText } from '@/lib/nap-verify';
import NapResults, { type NapResultsData } from '@/components/tools/NapResults';
import ToolPage, {
  cardStyle,
  inputStyle,
  labelStyle,
  PrimaryButton,
  ErrorBanner,
  ToolArticle,
  FaqSection,
  RelatedTools,
  AnswerCapsule,
  KeyTakeaways,
  ExpertQuote,
  ArticleSchema,
} from '@/components/tools/ToolPage';

interface ApiResponse extends NapResultsData {
  canonical: Record<string, string | undefined>;
}

export default function NapVerificationPage() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [street, setStreet] = useState('');
  const [suite, setSuite] = useState('');
  const [city, setCity] = useState('');
  const [postcode, setPostcode] = useState('');
  const [urls, setUrls] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<ApiResponse | null>(null);
  const [importNote, setImportNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const MAX_URLS = 50;

  const mergeUrls = (incoming: string[]) => {
    const existing = extractUrlsFromText(urls, MAX_URLS);
    const seen = new Set(existing);
    const merged = [...existing];
    let added = 0;
    for (const u of incoming) {
      if (merged.length >= MAX_URLS) break;
      if (seen.has(u)) continue;
      seen.add(u);
      merged.push(u);
      added++;
    }
    setUrls(merged.join('\n'));
    return { added, total: merged.length };
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const text = await file.text();
        const found = extractUrlsFromText(text, MAX_URLS);
        if (found.length === 0) {
          setImportNote('No URLs found in that file.');
        } else {
          const { added, total } = mergeUrls(found);
          setImportNote(
            `Imported ${added} new URL${added === 1 ? '' : 's'} (${total}/${MAX_URLS} total).`,
          );
        }
      } catch {
        setImportNote('Could not read that file.');
      }
    }
    // Reset so re-selecting the same file fires onChange again.
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) return;
    setError('');
    setData(null);
    setLoading(true);
    try {
      const res = await fetch('/api/tools/nap-checker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonical: {
            name: name.trim(),
            phone: phone.trim(),
            street: street.trim(),
            suite: suite.trim(),
            city: city.trim(),
            postcode: postcode.trim(),
          },
          urls,
          website: honeypot,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Something went wrong.');
        return;
      }
      setData(json);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolPage
      title={
        <>
          NAP <span style={{ color: 'var(--brand)' }}>Verification</span> Tool
        </>
      }
      subtitle="Enter your correct name, address and phone, paste your citation URLs, and we'll fetch each page, extract the NAP it shows, and flag every mismatch."
      toolName="NAP Verification Tool"
      toolSlug="nap-verification"
    >
      <div style={cardStyle}>
        <form onSubmit={handleSubmit}>
          <div
            style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }}
            aria-hidden="true"
            tabIndex={-1}
          >
            <label htmlFor="nap-website">Website</label>
            <input
              id="nap-website"
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>

          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e', margin: '0 0 14px' }}>
            1. Your canonical NAP
          </h2>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="napName" style={labelStyle}>
              Business name
            </label>
            <input
              id="napName"
              type="text"
              required
              maxLength={200}
              placeholder="e.g. Acme Dental Care"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label htmlFor="napPhone" style={labelStyle}>
                Phone <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                id="napPhone"
                type="text"
                maxLength={200}
                placeholder="e.g. 020 7946 0123"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="napPostcode" style={labelStyle}>
                Postcode <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                id="napPostcode"
                type="text"
                maxLength={200}
                placeholder="e.g. SW1A 1AA"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label htmlFor="napStreet" style={labelStyle}>
                Street address <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                id="napStreet"
                type="text"
                maxLength={200}
                placeholder="e.g. 12 High Street"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="napSuite" style={labelStyle}>
                Suite / unit <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                id="napSuite"
                type="text"
                maxLength={200}
                placeholder="e.g. Suite 4"
                value={suite}
                onChange={(e) => setSuite(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="napCity" style={labelStyle}>
              City / town <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              id="napCity"
              type="text"
              maxLength={200}
              placeholder="e.g. London"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>
              2. Citation &amp; backlink URLs
            </h2>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={handleFile}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                background: '#fff',
                color: '#374151',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              ↑ Bulk import CSV
            </button>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="napUrls" style={labelStyle}>
              One URL per line (or comma-separated) — up to {MAX_URLS}. Paste a list or bulk-import a CSV of backlinks.
            </label>
            <textarea
              id="napUrls"
              required
              rows={6}
              placeholder={'https://www.yelp.com/biz/your-listing\nhttps://www.yell.com/...\nhttps://your-directory.com/...'}
              value={urls}
              onChange={(e) => { setUrls(e.target.value); setImportNote(''); }}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
            {importNote && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>{importNote}</div>
            )}
          </div>

          <PrimaryButton type="submit" loading={loading}>
            {loading ? 'Checking citations…' : 'Verify NAP Consistency'}
          </PrimaryButton>
          <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
            5 free audits per day.{' '}
            <a href="/signup" style={{ color: 'var(--brand)', fontWeight: 600 }}>
              Sign up
            </a>{' '}
            to save audits per client and re-run them to track progress.
          </div>
        </form>
        <ErrorBanner message={error} />
      </div>

      {data && (
        <div style={{ marginTop: 24 }}>
          <NapResults
            data={data}
            label={name}
            canonical={{
              name: name.trim(),
              phone: phone.trim() || undefined,
              street: street.trim() || undefined,
              suite: suite.trim() || undefined,
              city: city.trim() || undefined,
              postcode: postcode.trim() || undefined,
            }}
          />
        </div>
      )}

      <ToolArticle>
        <ArticleSchema
          headline="NAP Verification Tool: Audit Local Citation Consistency at Scale"
          description="Free NAP verification tool. Fetch every citation page, extract the name, address and phone, and flag mismatches against your canonical NAP. The complete guide to citation consistency for local SEO."
          url="https://livesov.com/tools/nap-verification"
          datePublished="2026-06-07"
          dateModified="2026-06-07"
        />

        <AnswerCapsule>
          The <strong>NAP Verification Tool</strong> takes your correct name, address and phone (NAP),
          fetches each citation URL you paste, extracts the NAP each page actually shows — first from{' '}
          <code>LocalBusiness</code> JSON-LD, then via regex over the raw HTML — and flags every
          mismatch with a per-citation match score and an overall consistency score. Free, with 5
          audits per IP per day.
        </AnswerCapsule>

        <KeyTakeaways
          items={[
            'NAP consistency is a confirmed local ranking factor — inconsistent citations confuse search engines and split your authority.',
            'The most common issues are an old phone number, a moved address, a name variation, and a dropped suite/unit.',
            'Structured data (LocalBusiness JSON-LD) is the cleanest source of truth; this tool reads it first and falls back to HTML.',
            'Audit citations quarterly. NAP drifts every time you move, rebrand or change a phone line.',
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
        <p>It uses two layers, applied per field, with the cleaner source winning:</p>
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
        </ol>
        <div className="callout">
          <strong>Why some pages return little.</strong> JS-heavy or bot-blocked directories may render
          their NAP client-side, so a plain fetch sees an empty shell. That is a known gap a headless
          browser (Layer 3) closes — on the roadmap for the paid product.
        </div>

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
              q: 'How many URLs can I check at once?',
              a: 'Up to 50 citation or backlink URLs per run on the free tool — paste a list or bulk-import a CSV — with 5 runs per IP per day. The paid product removes both limits and lets you save a URL set per client and re-run it on a schedule.',
            },
            {
              q: 'Why did a page show no extracted NAP?',
              a: 'Three usual reasons: the directory renders its content with JavaScript (a plain fetch sees an empty page), the page blocks automated requests, or the listing genuinely omits that field. A headless-browser layer closes the first two gaps and is on the roadmap.',
            },
            {
              q: 'How does duplicate listing detection work?',
              a: 'When two or more of the URLs you submit live on the same directory domain (e.g. two Yelp pages), we flag it as a possible duplicate listing — a common ranking-diluting problem. If those duplicates also disagree on phone, name or postcode, we mark the group "conflicting", which is the most damaging variant and the first thing to fix.',
            },
            {
              q: 'What counts as a variation versus a mismatch?',
              a: 'A variation is a close-but-not-exact value — "St" vs "Street", or a company suffix like "Ltd" dropped. A mismatch is a genuinely different value, like a different phone number or a moved address. Variations score half credit; mismatches score zero.',
            },
            {
              q: 'Does it check Google Business Profile?',
              a: 'This free tool checks any citation URL you paste. Pulling your GBP automatically as the source of truth is a Phase 3 feature in the full product.',
            },
            {
              q: 'Is my data stored?',
              a: 'No. The free tool runs the check and returns results without saving them. Signing up lets you deliberately save audits per client so you can track consistency improving over time.',
            },
            {
              q: 'How often should I run a NAP audit?',
              a: 'Quarterly for a stable business, and immediately after any move, rebrand or phone change. NAP drift compounds quietly, so a regular cadence keeps your local signal clean.',
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
