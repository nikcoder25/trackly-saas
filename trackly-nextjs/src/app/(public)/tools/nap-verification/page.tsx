'use client';

import { useState } from 'react';
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

type FieldStatus = 'match' | 'variation' | 'mismatch' | 'missing';

interface FieldResult {
  status: FieldStatus;
  expected?: string;
  found?: string;
}

interface UrlResult {
  url: string;
  httpStatus: number | null;
  reachable: boolean;
  error?: string;
  extracted: {
    name?: string;
    phone?: string;
    street?: string;
    city?: string;
    postcode?: string;
  };
  fields: {
    name: FieldResult;
    phone: FieldResult;
    address: FieldResult;
    postcode: FieldResult;
    suite: FieldResult;
  };
  tags: string[];
  matchScore: number;
}

interface ApiResponse {
  canonical: Record<string, string | undefined>;
  score: number;
  summary: { total: number; clean: number; withIssues: number; deadLinks: number };
  results: UrlResult[];
}

const STATUS_COLOR: Record<FieldStatus, { bg: string; fg: string }> = {
  match: { bg: '#dcfce7', fg: '#166534' },
  variation: { bg: '#fef9c3', fg: '#854d0e' },
  mismatch: { bg: '#fee2e2', fg: '#991b1b' },
  missing: { bg: '#f1f5f9', fg: '#64748b' },
};

function StatusPill({ status }: { status: FieldStatus }) {
  const c = STATUS_COLOR[status];
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 11,
        fontWeight: 700,
        padding: '2px 7px',
        borderRadius: 6,
        background: c.bg,
        color: c.fg,
        textTransform: 'capitalize',
      }}
    >
      {status}
    </span>
  );
}

function scoreColor(score: number): string {
  if (score >= 85) return '#16a34a';
  if (score >= 60) return '#ca8a04';
  return '#dc2626';
}

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function buildCsv(data: ApiResponse): string {
  const header = [
    'URL',
    'HTTP Status',
    'Match Score',
    'Name Status',
    'Found Name',
    'Phone Status',
    'Found Phone',
    'Address Status',
    'Found Address',
    'Postcode Status',
    'Found Postcode',
    'Suite Status',
    'Issues',
  ];
  const rows = data.results.map((r) =>
    [
      r.url,
      r.reachable ? String(r.httpStatus ?? '') : r.error || 'unreachable',
      String(r.matchScore),
      r.fields.name.status,
      r.extracted.name || '',
      r.fields.phone.status,
      r.extracted.phone || '',
      r.fields.address.status,
      r.extracted.street || '',
      r.fields.postcode.status,
      r.extracted.postcode || '',
      r.fields.suite.status,
      r.tags.join('; '),
    ]
      .map((c) => csvEscape(String(c)))
      .join(','),
  );
  return [header.map(csvEscape).join(','), ...rows].join('\n');
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

  const downloadCsv = () => {
    if (!data) return;
    const blob = new Blob([buildCsv(data)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nap-audit-${name.trim().toLowerCase().replace(/\s+/g, '-') || 'results'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e', margin: '0 0 14px' }}>
            2. Citation URLs
          </h2>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="napUrls" style={labelStyle}>
              One URL per line (or comma-separated) — up to 20
            </label>
            <textarea
              id="napUrls"
              required
              rows={6}
              placeholder={'https://www.yelp.com/biz/your-listing\nhttps://www.yell.com/...\nhttps://your-directory.com/...'}
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
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
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={cardStyle}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 16,
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>Consistency score</div>
                <div style={{ fontSize: 44, fontWeight: 800, color: scoreColor(data.score), lineHeight: 1.1 }}>
                  {data.score}
                  <span style={{ fontSize: 20, color: '#9ca3af' }}>/100</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                <Stat label="Citations" value={data.summary.total} color="#1a1a2e" />
                <Stat label="Clean" value={data.summary.clean} color="#16a34a" />
                <Stat label="With issues" value={data.summary.withIssues} color="#ca8a04" />
                <Stat label="Dead links" value={data.summary.deadLinks} color="#dc2626" />
              </div>
              <button
                onClick={downloadCsv}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: '1px solid var(--brand)',
                  background: '#fff',
                  color: 'var(--brand)',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                ↓ Export CSV
              </button>
            </div>
          </div>

          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                    {['Citation', 'Score', 'Name', 'Phone', 'Address', 'Postcode', 'Suite', 'Issues'].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '12px 14px',
                          fontWeight: 700,
                          color: '#0f172a',
                          borderBottom: '1px solid #e5e7eb',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((r, i) => (
                    <tr key={r.url + i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 14px', maxWidth: 260 }}>
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          style={{ color: '#2563eb', textDecoration: 'none', wordBreak: 'break-all' }}
                        >
                          {r.url.replace(/^https?:\/\//, '')}
                        </a>
                        {!r.reachable && (
                          <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>
                            {r.error || `HTTP ${r.httpStatus ?? '—'}`}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: scoreColor(r.matchScore) }}>
                        {r.reachable ? r.matchScore : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <StatusPill status={r.fields.name.status} />
                        {r.extracted.name && (
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{r.extracted.name}</div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <StatusPill status={r.fields.phone.status} />
                        {r.extracted.phone && (
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{r.extracted.phone}</div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <StatusPill status={r.fields.address.status} />
                        {r.extracted.street && (
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{r.extracted.street}</div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <StatusPill status={r.fields.postcode.status} />
                        {r.extracted.postcode && (
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{r.extracted.postcode}</div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <StatusPill status={r.fields.suite.status} />
                      </td>
                      <td style={{ padding: '12px 14px', maxWidth: 180 }}>
                        {r.tags.length === 0 ? (
                          <span style={{ color: '#16a34a', fontSize: 12 }}>✓ Consistent</span>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {r.tags.map((t) => (
                              <span
                                key={t}
                                style={{
                                  fontSize: 11,
                                  padding: '2px 6px',
                                  borderRadius: 5,
                                  background: '#fef2f2',
                                  color: '#b91c1c',
                                }}
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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
              a: 'Up to 20 citation URLs per run on the free tool, with 5 runs per IP per day. The paid product removes both limits and lets you save a URL set per client and re-run it on a schedule.',
            },
            {
              q: 'Why did a page show no extracted NAP?',
              a: 'Three usual reasons: the directory renders its content with JavaScript (a plain fetch sees an empty page), the page blocks automated requests, or the listing genuinely omits that field. A headless-browser layer closes the first two gaps and is on the roadmap.',
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

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>{label}</div>
    </div>
  );
}
