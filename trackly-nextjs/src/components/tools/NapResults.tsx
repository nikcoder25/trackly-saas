'use client';

import { useState } from 'react';
import { generateSchemaScriptTag, type CanonicalNap } from '@/lib/nap-verify';

// Shared presentational view for NAP check results — an overview hero (score
// gauge + KPI rail), possible duplicate listings, the per-URL citation table,
// CSV export, and a paste-ready LocalBusiness schema generator. Rendered inside
// the dashboard's `.lvx` shell, so it builds on the design-system tokens and
// component classes (cards, badges, KPIs) for full cohesion and dark-mode support.

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

// Per-field status → design-system badge tone + glyph.
const FIELD_BADGE: Record<FieldStatus, { tone: string; icon: string; label: string }> = {
  match: { tone: 'pos', icon: '✓', label: 'Match' },
  variation: { tone: 'warn', icon: '≈', label: 'Variation' },
  mismatch: { tone: 'neg', icon: '✕', label: 'Mismatch' },
  missing: { tone: 'miss', icon: '–', label: 'Missing' },
};

function StatusPill({ status }: { status: FieldStatus }) {
  const m = FIELD_BADGE[status];
  return (
    <span className={`badge badge-${m.tone}`}>
      <span aria-hidden style={{ fontSize: 9 }}>{m.icon}</span>
      {m.label}
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

const NAP_BADGE: Record<NapVerdict, { tone: string; icon: string; label: string }> = {
  ok: { tone: 'pos', icon: '✓', label: 'NAP OK' },
  verified: { tone: 'info', icon: '✓', label: 'Verified' },
  issues: { tone: 'neg', icon: '✕', label: 'Issues' },
  unverified: { tone: 'warn', icon: '?', label: 'Unverified' },
};

function NapBadge({ r, overridden }: { r: NapUrlResult; overridden: boolean }) {
  const { verdict, failed } = napVerdict(r, overridden);
  const m = NAP_BADGE[verdict];
  const sub =
    verdict === 'issues' ? failed.join(' · ')
      : verdict === 'unverified' ? "Couldn't read"
        : verdict === 'verified' ? 'Manual'
          : null;
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      <span className={`badge badge-${m.tone}`} style={{ fontSize: 11, padding: '4px 9px' }}>
        <span aria-hidden style={{ fontSize: 10 }}>{m.icon}</span>
        {m.label}
      </span>
      {sub && <span className="mono" style={{ fontSize: 9.5, color: 'var(--text-3)', letterSpacing: '0.03em' }}>{sub}</span>}
    </div>
  );
}

export function scoreColor(score: number): string {
  if (score >= 85) return 'var(--success)';
  if (score >= 60) return 'var(--warn)';
  return 'var(--danger)';
}
function scoreSoft(score: number): string {
  if (score >= 85) return 'var(--success-50)';
  if (score >= 60) return 'var(--warn-50)';
  return 'var(--danger-50)';
}
function scoreLabel(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 60) return 'Needs work';
  return 'Poor';
}

// Scoped styling for the citation table: a pinned header (so column labels stay
// visible while scrolling long lists), zebra striping, row hover, and a tidy
// scrollbar — all on design tokens so it tracks light/dark themes.
const napTableCss = `
.lvx .nap-table th, .lvx .nap-table td { padding: 12px 16px; text-align: left; vertical-align: top; }
.lvx .nap-table thead th {
  position: sticky; top: 0; z-index: 2;
  background: var(--surface-2);
  font-family: var(--mono); font-weight: 600; font-size: 10px; letter-spacing: .08em; text-transform: uppercase;
  color: var(--text-3); white-space: nowrap;
  box-shadow: inset 0 -1px 0 var(--line);
}
.lvx .nap-table tbody tr { transition: background .12s ease; }
.lvx .nap-table tbody tr:nth-child(even) { background: var(--surface-2); }
.lvx .nap-table tbody tr:hover { background: var(--primary-50); }
.lvx .nap-table tbody td { border-bottom: 1px solid var(--line); }
.lvx .nap-table tbody tr:last-child td { border-bottom: none; }
.lvx .nap-found { font-size: 11px; color: var(--text-3); margin-top: 5px; line-height: 1.35; word-break: break-word; }
.lvx .nap-tag { display: inline-block; font-family: var(--mono); font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 999px; white-space: nowrap; letter-spacing: .02em; }
.lvx .nap-cite a { color: var(--primary); text-decoration: none; font-weight: 600; word-break: break-all; }
.lvx .nap-cite a:hover { text-decoration: underline; }
.lvx .nap-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
.lvx .nap-scroll::-webkit-scrollbar-thumb { background: var(--line-2); border-radius: 999px; border: 2px solid var(--surface); }
.lvx .nap-scroll::-webkit-scrollbar-track { background: transparent; }
`;

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

/** Circular consistency-score gauge (SVG, themed via tokens). */
function ScoreGauge({ score }: { score: number }) {
  const size = 156, stroke = 13, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = scoreColor(score);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ display: 'block' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-3)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={`${c * pct} ${c}`} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 1s cubic-bezier(.2,.7,.2,1)' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 42, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1 }}>
          {score}<span style={{ fontSize: 15, color: 'var(--mute)', fontWeight: 400 }}>/100</span>
        </div>
        <div className="mono" style={{ marginTop: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color }}>
          {scoreLabel(score)}
        </div>
      </div>
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
    <section className="card">
      <header className="card-h has-lede">
        <span className="card-tw" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="card-t">LocalBusiness schema</span>
          <span className="card-lede">
            Paste into the &lt;head&gt; of any listing missing structured data so engines read your NAP cleanly.
          </span>
        </span>
        <span className="card-r">
          <button onClick={copy} className={copied ? 'btn-p' : 'btn-g'}>{copied ? '✓ Copied' : 'Copy snippet'}</button>
        </span>
      </header>
      <div className="card-b">
        <pre style={{ margin: 0, padding: 16, background: '#0f172a', color: '#e2e8f0', borderRadius: 'var(--radius)', fontSize: 12.5, lineHeight: 1.6, overflowX: 'auto', fontFamily: 'var(--mono)' }}>
          {snippet}
        </pre>
      </div>
    </section>
  );
}

export default function NapResults({
  data,
  label,
  canonical,
  overrides,
  onToggleOverride,
  busyUrl,
  trend,
}: {
  data: NapResultsData;
  label?: string;
  canonical?: CanonicalNap;
  /** Manual verification map { [url]: true }. When provided, per-row toggles show. */
  overrides?: Record<string, boolean>;
  onToggleOverride?: (url: string, ok: boolean) => void;
  busyUrl?: string | null;
  /** Optional "consistency over time" content rendered inside the overview hero. */
  trend?: React.ReactNode;
}) {
  const ov = overrides ?? {};
  const interactive = typeof onToggleOverride === 'function';
  const verifiedCount = data.results.filter((r) => ov[r.url]).length;
  const blocked = data.summary.blocked ?? 0;
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

  const kpis: Array<{ k: string; v: number; c: string }> = [
    { k: 'Citations', v: data.summary.total, c: 'var(--text)' },
    { k: 'Clean', v: data.summary.clean, c: 'var(--success)' },
    { k: 'With issues', v: data.summary.withIssues, c: 'var(--warn)' },
    ...(blocked > 0 ? [{ k: 'Blocked', v: blocked, c: 'var(--warn)' }] : []),
    { k: 'Dead links', v: data.summary.deadLinks, c: 'var(--danger)' },
    { k: 'Duplicates', v: data.summary.duplicateListings, c: 'var(--primary)' },
    ...(verifiedCount > 0 ? [{ k: 'Verified', v: verifiedCount, c: 'var(--info)' }] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{napTableCss}</style>

      {/* ─── Overview hero: score gauge + KPI rail (+ optional trend) ─── */}
      <section className="card">
        <header className="card-h">
          <span className="card-t">Audit overview</span>
          <span className="card-r">
            <button onClick={downloadCsv} className="btn-g">↓ Export CSV</button>
          </span>
        </header>
        <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <ScoreGauge score={data.score} />
              <div className="mono" style={{ fontSize: 9.5, letterSpacing: '0.12em', color: 'var(--mute)', textTransform: 'uppercase' }}>
                NAP consistency
              </div>
            </div>
            <div className="kpi-rail" style={{ flex: 1, minWidth: 280, gridTemplateColumns: `repeat(${Math.min(kpis.length, 3)}, 1fr)` }}>
              {kpis.map((it) => (
                <div className="kpi" key={it.k}>
                  <div className="kpi-k mono">{it.k}</div>
                  <div className="kpi-v mono" style={{ color: it.c }}>{it.v}</div>
                </div>
              ))}
            </div>
          </div>
          {trend && (
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
              <div className="kpi-k mono" style={{ marginBottom: 12 }}>Consistency over time</div>
              {trend}
            </div>
          )}
        </div>
      </section>

      {/* ─── Blocked-citation note ─── */}
      {data.results.some((r) => r.tags.includes('blocked')) && (
        <section className="card" style={{ borderColor: 'var(--warn-200)' }}>
          <div className="card-b" style={{ background: 'var(--warn-50)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--warn)', marginBottom: 4 }}>
              Some citations were blocked by anti-bot protection
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
              A few directories returned a block (e.g. Cloudflare/WAF) to our server even though they open
              in your browser — so their live NAP couldn&apos;t be read. These show as <strong>Unverified</strong>,
              not a real mismatch. We automatically retry these for free through the Internet Archive and other
              public readers; archive-sourced rows are flagged <strong>via Web Archive</strong> with the snapshot
              date so you know how fresh they are. For anything still blocked, open it in your browser and
              <strong> Mark OK</strong> if the details are correct.
            </p>
          </div>
        </section>
      )}

      {/* ─── Possible duplicate listings ─── */}
      {data.duplicates.length > 0 && (
        <section className="card">
          <header className="card-h has-lede">
            <span className="card-tw" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="card-t">Possible duplicate listings</span>
              <span className="card-lede">
                Duplicates split your ranking signal — consolidate or remove the extras, starting with any that disagree on NAP.
              </span>
            </span>
          </header>
          <div className="card-b" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.duplicates.map((g) => (
              <div
                key={g.domain}
                style={{
                  padding: 14, borderRadius: 'var(--radius)',
                  background: g.conflicting ? 'var(--danger-50)' : 'var(--surface-2)',
                  border: `1px solid ${g.conflicting ? 'var(--danger-100)' : 'var(--line)'}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{g.domain}</span>
                  <span className={`badge badge-${g.conflicting ? 'neg' : 'neu'}`}>
                    {g.urls.length} listings{g.conflicting ? ' · conflicting NAP' : ''}
                  </span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-3)' }}>
                  {g.urls.map((u) => (
                    <li key={u} style={{ wordBreak: 'break-all' }}>
                      <a href={u} target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'var(--text-3)', textDecoration: 'none' }}>
                        {u.replace(/^https?:\/\//, '')}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Citation details table ─── */}
      <section className="card">
        <header className="card-h has-lede">
          <span className="card-tw" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="card-t">Citation details</span>
            <span className="card-lede">
              {data.results.length} {data.results.length === 1 ? 'listing' : 'listings'} checked · the <strong>NAP</strong> verdict is based on Name, Address &amp; Phone only.
            </span>
          </span>
          <span className="card-r" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {(['match', 'variation', 'mismatch', 'missing'] as FieldStatus[]).map((s) => (
              <span key={s} className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.04em' }}>
                <span aria-hidden className={`badge badge-${FIELD_BADGE[s].tone}`} style={{ width: 14, height: 14, padding: 0, justifyContent: 'center', fontSize: 8 }}>{FIELD_BADGE[s].icon}</span>
                {FIELD_BADGE[s].label}
              </span>
            ))}
          </span>
        </header>
        <div className="card-b no-pad">
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
                      <a href={r.url} target="_blank" rel="noopener noreferrer nofollow">
                        {r.url.replace(/^https?:\/\//, '')}
                      </a>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
                        {!r.reachable && (
                          <span className="nap-tag" style={{ background: 'var(--danger-50)', color: 'var(--danger)' }}>
                            {r.error || `HTTP ${r.httpStatus ?? '—'}`}
                          </span>
                        )}
                        {r.reachable && !Object.values(r.extracted.source ?? {}).includes('schema') && (
                          <span className="nap-tag" style={{ background: 'var(--primary-50)', color: 'var(--primary)' }}>no JSON-LD</span>
                        )}
                        {r.archivedAt ? (
                          <span
                            className="nap-tag"
                            style={{ background: 'var(--info-50)', color: 'var(--info)' }}
                            title="Live page was blocked — read from the Internet Archive, so it may be out of date"
                          >
                            via Web Archive · {r.archivedAt}
                          </span>
                        ) : r.rendered ? (
                          <span className="nap-tag" style={{ background: 'var(--info-50)', color: 'var(--info)' }}>JS-rendered</span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <NapBadge r={r} overridden={!!ov[r.url]} />
                    </td>
                    <td>
                      <span
                        className="mono"
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          minWidth: 40, height: 26, padding: '0 9px', borderRadius: 999,
                          fontWeight: 700, fontSize: 12.5,
                          color: ov[r.url] ? 'var(--info)' : r.reachable ? scoreColor(r.matchScore) : 'var(--mute)',
                          background: ov[r.url] ? 'var(--info-50)' : r.reachable ? scoreSoft(r.matchScore) : 'var(--surface-3)',
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
                          <span style={{ color: 'var(--info)', fontSize: 12, fontWeight: 600 }}>✓ Verified manually</span>
                          {interactive && (
                            <button
                              onClick={() => onToggleOverride!(r.url, false)}
                              disabled={busyUrl === r.url}
                              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-3)', fontSize: 11, textDecoration: 'underline', cursor: 'pointer' }}
                            >
                              {busyUrl === r.url ? '…' : 'Undo'}
                            </button>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                          {r.tags.length === 0 ? (
                            <span style={{ color: 'var(--success)', fontSize: 12, fontWeight: 600 }}>✓ Consistent</span>
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
                                      background: couldntCheck ? 'var(--warn-50)' : 'var(--danger-50)',
                                      color: couldntCheck ? 'var(--warn)' : 'var(--danger)',
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
                              className="btn-d"
                              style={{ alignSelf: 'flex-start', color: 'var(--info)', borderColor: 'var(--info-100)' }}
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
      </section>

      {canonical && <SchemaCard canonical={canonical} />}
    </div>
  );
}
