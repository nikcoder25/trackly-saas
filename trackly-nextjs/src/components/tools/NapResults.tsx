'use client';

import { useState } from 'react';
import { generateSchemaScriptTag, type CanonicalNap } from '@/lib/nap-verify';

// Shared presentational view for NAP check results — score + summary, possible
// duplicate listings, the per-URL results table, CSV export, and a paste-ready
// LocalBusiness schema generator. Used by both the public free tool and the
// saved-audit detail page in the dashboard so the two surfaces stay identical.

export type FieldStatus = 'match' | 'variation' | 'mismatch' | 'missing';

export interface FieldResult {
  status: FieldStatus;
  expected?: string;
  found?: string;
}

export interface NapUrlResult {
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
    source?: Partial<Record<'name' | 'phone' | 'street' | 'city' | 'postcode', 'schema' | 'regex'>>;
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
  rendered?: boolean;
  /** YYYY-MM-DD when the NAP was read from an Internet Archive snapshot. */
  archivedAt?: string;
}

export interface NapDuplicateGroup {
  domain: string;
  urls: string[];
  conflicting: boolean;
}

export interface NapResultsData {
  score: number;
  summary: { total: number; clean: number; withIssues: number; deadLinks: number; blocked?: number; duplicateListings: number };
  duplicates: NapDuplicateGroup[];
  results: NapUrlResult[];
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  padding: 32,
  boxShadow: '0 4px 24px rgba(0,0,0,.08)',
};

const STATUS_META: Record<FieldStatus, { bg: string; fg: string; ring: string; icon: string; label: string }> = {
  match: { bg: '#dcfce7', fg: '#166534', ring: '#bbf7d0', icon: '✓', label: 'Match' },
  variation: { bg: '#fef9c3', fg: '#854d0e', ring: '#fde68a', icon: '≈', label: 'Variation' },
  mismatch: { bg: '#fee2e2', fg: '#991b1b', ring: '#fecaca', icon: '✕', label: 'Mismatch' },
  missing: { bg: '#f1f5f9', fg: '#64748b', ring: '#e2e8f0', icon: '–', label: 'Missing' },
};

function StatusPill({ status }: { status: FieldStatus }) {
  const c = STATUS_META[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        fontWeight: 700,
        padding: '3px 8px',
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.ring}`,
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden style={{ fontSize: 10, lineHeight: 1 }}>{c.icon}</span>
      {c.label}
    </span>
  );
}

// NAP = Name, Address, Phone. The dedicated verdict column collapses just those
// three core fields into a single OK / Issues / can't-verify state — postcode and
// suite are deliberately excluded so the column answers "is the NAP itself right?".
type NapVerdict = 'ok' | 'verified' | 'issues' | 'unverified';

function napVerdict(r: NapUrlResult, overridden: boolean): { verdict: NapVerdict; failed: string[] } {
  if (overridden) return { verdict: 'verified', failed: [] };
  if (!r.reachable) return { verdict: 'unverified', failed: [] };
  const core: Array<[string, FieldStatus]> = [
    ['Name', r.fields.name.status],
    ['Phone', r.fields.phone.status],
    ['Address', r.fields.address.status],
  ];
  const failed = core.filter(([, s]) => s === 'mismatch' || s === 'missing').map(([l]) => l);
  return { verdict: failed.length === 0 ? 'ok' : 'issues', failed };
}

const NAP_META: Record<NapVerdict, { bg: string; fg: string; ring: string; icon: string; label: string }> = {
  ok: { bg: '#dcfce7', fg: '#166534', ring: '#bbf7d0', icon: '✓', label: 'NAP OK' },
  verified: { bg: '#cffafe', fg: '#0e7490', ring: '#a5f3fc', icon: '✓', label: 'Verified' },
  issues: { bg: '#fee2e2', fg: '#991b1b', ring: '#fecaca', icon: '✕', label: 'Issues' },
  unverified: { bg: '#fef9c3', fg: '#854d0e', ring: '#fde68a', icon: '?', label: 'Unverified' },
};

function NapBadge({ r, overridden }: { r: NapUrlResult; overridden: boolean }) {
  const { verdict, failed } = napVerdict(r, overridden);
  const m = NAP_META[verdict];
  const sub =
    verdict === 'issues'
      ? failed.join(' · ')
      : verdict === 'unverified'
        ? "Couldn't read"
        : verdict === 'verified'
          ? 'Manual'
          : null;
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 11.5,
          fontWeight: 800,
          padding: '4px 10px',
          borderRadius: 999,
          background: m.bg,
          color: m.fg,
          border: `1px solid ${m.ring}`,
          whiteSpace: 'nowrap',
        }}
      >
        <span aria-hidden style={{ fontSize: 11, lineHeight: 1 }}>{m.icon}</span>
        {m.label}
      </span>
      {sub && (
        <span style={{ fontSize: 10, color: m.fg, opacity: 0.8, fontWeight: 600 }}>{sub}</span>
      )}
    </div>
  );
}

// Scoped styling for the citation table: a pinned header (so column labels stay
// visible while scrolling long lists), zebra striping, row hover, and a tidy
// scrollbar. Kept as one string so it ships with the component wherever it renders.
const napTableCss = `
.nap-table th, .nap-table td { padding: 13px 16px; text-align: left; vertical-align: top; }
.nap-table thead th {
  position: sticky; top: 0; z-index: 2;
  background: #f8fafc;
  font-weight: 700; font-size: 11px; letter-spacing: .04em; text-transform: uppercase;
  color: #475569; white-space: nowrap;
  box-shadow: inset 0 -1px 0 #e2e8f0;
}
.nap-table tbody tr { transition: background .12s ease; }
.nap-table tbody tr:nth-child(even) { background: #fcfdfe; }
.nap-table tbody tr:hover { background: #f5f7ff; }
.nap-table tbody td { border-bottom: 1px solid #f1f5f9; }
.nap-table tbody tr:last-child td { border-bottom: none; }
.nap-found { font-size: 11px; color: #64748b; margin-top: 4px; line-height: 1.35; word-break: break-word; }
.nap-tag { display: inline-block; font-size: 10.5px; font-weight: 600; padding: 2px 7px; border-radius: 999px; white-space: nowrap; }
.nap-cite a:hover { text-decoration: underline; }
.nap-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
.nap-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 999px; border: 2px solid #fff; }
.nap-scroll::-webkit-scrollbar-track { background: transparent; }
`;

export function scoreColor(score: number): string {
  if (score >= 85) return '#16a34a';
  if (score >= 60) return '#ca8a04';
  return '#dc2626';
}

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function buildCsv(data: NapResultsData, overrides: Record<string, boolean>): string {
  const header = [
    'URL', 'HTTP Status', 'NAP Status', 'Match Score', 'Name Status', 'Found Name', 'Phone Status',
    'Found Phone', 'Address Status', 'Found Address', 'Postcode Status', 'Found Postcode',
    'Suite Status', 'Issues',
  ];
  const napLabel: Record<NapVerdict, string> = { ok: 'OK', verified: 'Verified (manual)', issues: 'Issues', unverified: 'Unverified' };
  const rows = data.results.map((r) =>
    [
      r.url,
      r.reachable ? String(r.httpStatus ?? '') : r.error || 'unreachable',
      napLabel[napVerdict(r, !!overrides[r.url]).verdict],
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

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function SchemaCard({ canonical }: { canonical: CanonicalNap }) {
  const [copied, setCopied] = useState(false);
  const snippet = generateSchemaScriptTag(canonical);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 6 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>LocalBusiness schema</h2>
        <button
          onClick={copy}
          style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--brand, #5B5BD6)', background: copied ? 'var(--brand, #5B5BD6)' : '#fff', color: copied ? '#fff' : 'var(--brand, #5B5BD6)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          {copied ? '✓ Copied' : 'Copy snippet'}
        </button>
      </div>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 14px' }}>
        Paste this into the <code>&lt;head&gt;</code> of any listing or page missing structured data. It
        makes your NAP machine-readable, so search engines and this tool read it cleanly.
      </p>
      <pre style={{ margin: 0, padding: 16, background: '#0f172a', color: '#e2e8f0', borderRadius: 10, fontSize: 12.5, lineHeight: 1.6, overflowX: 'auto' }}>
        {snippet}
      </pre>
    </div>
  );
}

export default function NapResults({
  data,
  label,
  canonical,
  overrides,
  onToggleOverride,
  busyUrl,
}: {
  data: NapResultsData;
  label?: string;
  canonical?: CanonicalNap;
  /** Manual verification map { [url]: true }. When provided, per-row toggles show. */
  overrides?: Record<string, boolean>;
  onToggleOverride?: (url: string, ok: boolean) => void;
  busyUrl?: string | null;
}) {
  const ov = overrides ?? {};
  const interactive = typeof onToggleOverride === 'function';
  const verifiedCount = data.results.filter((r) => ov[r.url]).length;
  const downloadCsv = () => {
    const blob = new Blob([buildCsv(data, ov)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nap-audit-${(label || 'results').trim().toLowerCase().replace(/\s+/g, '-') || 'results'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
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
            {(data.summary.blocked ?? 0) > 0 && <Stat label="Blocked" value={data.summary.blocked ?? 0} color="#b45309" />}
            <Stat label="Dead links" value={data.summary.deadLinks} color="#dc2626" />
            <Stat label="Duplicates" value={data.summary.duplicateListings} color="#9333ea" />
            {verifiedCount > 0 && <Stat label="Verified" value={verifiedCount} color="#0891b2" />}
          </div>
          <button
            onClick={downloadCsv}
            style={{
              padding: '10px 18px', borderRadius: 10, border: '1px solid var(--brand, #5B5BD6)',
              background: '#fff', color: 'var(--brand, #5B5BD6)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}
          >
            ↓ Export CSV
          </button>
        </div>
      </div>

      {data.results.some((r) => r.tags.includes('blocked')) && (
        <div style={{ ...cardStyle, background: '#fffbeb', border: '1px solid #fde68a' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
            Some citations were blocked by anti-bot protection
          </div>
          <p style={{ fontSize: 13, color: '#78350f', margin: 0, lineHeight: 1.6 }}>
            A few directories returned a block (e.g. Cloudflare/WAF) to our server even though they open
            in your browser — so their live NAP couldn&apos;t be read. These show as <strong>blocked</strong>,
            not a real mismatch. We automatically retry these for free through the Internet Archive and other
            public readers; archive-sourced rows are flagged <strong>via Web Archive</strong> with the snapshot
            date so you know how fresh they are. For anything still blocked, open it in your browser and
            <strong> Mark OK</strong> if the details are correct. (Image hosts like Gyazo have no NAP text to read.)
          </p>
        </div>
      )}

      {data.duplicates.length > 0 && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: '0 0 6px' }}>
            Possible duplicate listings
          </h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 14px' }}>
            These directories appear more than once in your list. Duplicate listings split your ranking
            signal — consolidate or remove the extras, starting with any that disagree on NAP.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.duplicates.map((g) => (
              <div
                key={g.domain}
                style={{
                  padding: 14, borderRadius: 10,
                  background: g.conflicting ? '#fef2f2' : '#faf5ff',
                  border: g.conflicting ? '1px solid #fecaca' : '1px solid #e9d5ff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>{g.domain}</span>
                  <span
                    style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                      background: g.conflicting ? '#fee2e2' : '#f3e8ff',
                      color: g.conflicting ? '#991b1b' : '#7e22ce',
                    }}
                  >
                    {g.urls.length} listings{g.conflicting ? ' · conflicting NAP' : ''}
                  </span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#6b7280' }}>
                  {g.urls.map((u) => (
                    <li key={u} style={{ wordBreak: 'break-all' }}>
                      <a href={u} target="_blank" rel="noopener noreferrer nofollow" style={{ color: '#6b7280', textDecoration: 'none' }}>
                        {u.replace(/^https?:\/\//, '')}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <style>{napTableCss}</style>
        {/* Header sits outside the scroll area so the title stays put while rows scroll. */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            padding: '18px 20px 14px',
            borderBottom: '1px solid #eef2f7',
          }}
        >
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>Citation details</h2>
            <p style={{ fontSize: 12.5, color: '#64748b', margin: '3px 0 0' }}>
              {data.results.length} {data.results.length === 1 ? 'listing' : 'listings'} checked · the <strong>NAP</strong> column verdict is based on Name, Address &amp; Phone only.
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {(['match', 'variation', 'mismatch', 'missing'] as FieldStatus[]).map((s) => (
              <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                <span aria-hidden style={{ width: 9, height: 9, borderRadius: 3, background: STATUS_META[s].bg, border: `1px solid ${STATUS_META[s].ring}` }} />
                {STATUS_META[s].label}
              </span>
            ))}
          </div>
        </div>
        {/* Vertical + horizontal scroll container — keeps the sticky header pinned. */}
        <div className="nap-scroll" style={{ overflow: 'auto', maxHeight: '70vh' }}>
          <table className="nap-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13 }}>
            <thead>
              <tr>
                {['Citation', 'NAP', 'Score', 'Name', 'Phone', 'Address', 'Postcode', 'Suite', 'Issues'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.results.map((r, i) => (
                <tr key={r.url + i}>
                  <td className="nap-cite" style={{ maxWidth: 260 }}>
                    <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" style={{ color: '#2563eb', textDecoration: 'none', wordBreak: 'break-all', fontWeight: 600 }}>
                      {r.url.replace(/^https?:\/\//, '')}
                    </a>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      {!r.reachable && (
                        <span className="nap-tag" style={{ background: '#fef2f2', color: '#dc2626' }}>
                          {r.error || `HTTP ${r.httpStatus ?? '—'}`}
                        </span>
                      )}
                      {r.reachable && !Object.values(r.extracted.source ?? {}).includes('schema') && (
                        <span className="nap-tag" style={{ background: '#faf5ff', color: '#9333ea' }}>no JSON-LD</span>
                      )}
                      {r.archivedAt ? (
                        <span
                          className="nap-tag"
                          style={{ background: '#ecfeff', color: '#0891b2' }}
                          title="Live page was blocked — read from the Internet Archive, so it may be out of date"
                        >
                          via Web Archive · {r.archivedAt}
                        </span>
                      ) : r.rendered ? (
                        <span className="nap-tag" style={{ background: '#ecfeff', color: '#0891b2' }}>JS-rendered</span>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <NapBadge r={r} overridden={!!ov[r.url]} />
                  </td>
                  <td>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 38,
                        height: 26,
                        padding: '0 8px',
                        borderRadius: 999,
                        fontWeight: 800,
                        fontSize: 12.5,
                        color: ov[r.url] ? '#0e7490' : r.reachable ? scoreColor(r.matchScore) : '#94a3b8',
                        background: ov[r.url] ? '#cffafe' : r.reachable ? `${scoreColor(r.matchScore)}1a` : '#f1f5f9',
                      }}
                    >
                      {ov[r.url] ? 'OK' : r.reachable ? r.matchScore : '—'}
                    </span>
                  </td>
                  <td>
                    <StatusPill status={r.fields.name.status} />
                    {r.extracted.name && <div className="nap-found">{r.extracted.name}</div>}
                  </td>
                  <td>
                    <StatusPill status={r.fields.phone.status} />
                    {r.extracted.phone && <div className="nap-found">{r.extracted.phone}</div>}
                  </td>
                  <td>
                    <StatusPill status={r.fields.address.status} />
                    {r.extracted.street && <div className="nap-found">{r.extracted.street}</div>}
                  </td>
                  <td>
                    <StatusPill status={r.fields.postcode.status} />
                    {r.extracted.postcode && <div className="nap-found">{r.extracted.postcode}</div>}
                  </td>
                  <td>
                    <StatusPill status={r.fields.suite.status} />
                  </td>
                  <td style={{ maxWidth: 210 }}>
                    {ov[r.url] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                        <span style={{ color: '#0891b2', fontSize: 12, fontWeight: 700 }}>✓ Verified manually</span>
                        {interactive && (
                          <button
                            onClick={() => onToggleOverride!(r.url, false)}
                            disabled={busyUrl === r.url}
                            style={{ background: 'none', border: 'none', padding: 0, color: '#6b7280', fontSize: 11, textDecoration: 'underline', cursor: 'pointer' }}
                          >
                            {busyUrl === r.url ? '…' : 'Undo'}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {r.tags.length === 0 ? (
                          <span style={{ color: '#16a34a', fontSize: 12, fontWeight: 600 }}>✓ Consistent</span>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {r.tags.map((t) => {
                              // "couldn't check" (blocked / dead link) is amber, not
                              // the red used for a genuine NAP mismatch.
                              const couldntCheck = t === 'blocked' || t === 'dead link';
                              return (
                                <span
                                  key={t}
                                  className="nap-tag"
                                  style={{
                                    background: couldntCheck ? '#fffbeb' : '#fef2f2',
                                    color: couldntCheck ? '#b45309' : '#b91c1c',
                                  }}
                                >
                                  {t}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {interactive && (r.tags.length > 0 || !r.reachable) && (
                          <button
                            onClick={() => onToggleOverride!(r.url, true)}
                            disabled={busyUrl === r.url}
                            title="I checked this listing by hand and the NAP is correct"
                            style={{
                              alignSelf: 'flex-start',
                              padding: '3px 9px',
                              borderRadius: 6,
                              border: '1px solid #0891b2',
                              background: '#fff',
                              color: '#0891b2',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {busyUrl === r.url ? '…' : '✓ Mark OK'}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canonical && <SchemaCard canonical={canonical} />}
    </div>
  );
}
