'use client';

import { useRef, useState } from 'react';
import { generateSchemaScriptTag, type CanonicalNap } from '@/lib/nap-verify';

// Shared presentational view for NAP check results - an overview hero (score
// gauge + KPI rail + consistency trend), possible duplicate listings, the
// per-URL citation table with filterable, expandable rows, CSV export, and a
// paste-ready LocalBusiness schema generator. Rendered inside the dashboard's
// `.lvx` shell, so it builds on the design-system tokens and component classes
// (cards, badges) for full cohesion and dark-mode support.

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

function FieldPill({ status }: { status: FieldStatus }) {
  const m = FIELD_BADGE[status];
  return (
    <span className={`badge badge-${m.tone}`} style={{ fontSize: 11, padding: '3px 7px' }}>
      <span aria-hidden style={{ fontSize: 9 }}>{m.icon}</span>
      {m.label}
    </span>
  );
}

// NAP = Name, Address, Phone. The dedicated verdict column collapses just those
// three core fields into a single OK / Issues / can't-verify state - postcode and
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

/** A clean verdict is one the customer can treat as correct - auto-OK or hand-verified. */
function isCleanVerdict(r: NapUrlResult, overridden: boolean): boolean {
  const { verdict } = napVerdict(r, overridden);
  return verdict === 'ok' || verdict === 'verified';
}

const NAP_BADGE: Record<NapVerdict, { tone: string; icon: string; label: string }> = {
  ok: { tone: 'pos', icon: '✓', label: 'NAP OK' },
  verified: { tone: 'pos', icon: '✓', label: 'Resolved' },
  issues: { tone: 'neg', icon: '✕', label: 'Issues' },
  unverified: { tone: 'warn', icon: '?', label: 'Unverified' },
};

function VerdictBadge({ r, overridden }: { r: NapUrlResult; overridden: boolean }) {
  const { verdict } = napVerdict(r, overridden);
  const m = NAP_BADGE[verdict];
  return (
    <span className={`badge badge-${m.tone}`} style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 9px' }}>
      <span aria-hidden style={{ fontSize: 10 }}>{m.icon}</span>
      {m.label}
    </span>
  );
}

/** Score band - colour + soft background + verdict word, themed via tokens. */
function band(score: number): { color: string; soft: string; word: string } {
  if (score < 50) return { color: 'var(--danger)', soft: 'var(--danger-50)', word: 'POOR' };
  if (score < 80) return { color: 'var(--warn)', soft: 'var(--warn-50)', word: 'FAIR' };
  if (score < 90) return { color: 'var(--success)', soft: 'var(--success-50)', word: 'GOOD' };
  return { color: 'var(--success)', soft: 'var(--success-50)', word: 'EXCELLENT' };
}

export function scoreColor(score: number): string {
  return band(score).color;
}

// Per-status colour + word for the field-health consistency bars and legend.
const SEG: Record<FieldStatus, { color: string; word: string }> = {
  match: { color: 'var(--success)', word: 'match' },
  variation: { color: 'var(--warn)', word: 'variation' },
  mismatch: { color: 'var(--danger)', word: 'mismatch' },
  missing: { color: 'var(--surface-3)', word: 'missing' },
};
const FH_ORDER: FieldStatus[] = ['match', 'variation', 'mismatch', 'missing'];

/** Colour scale for a consistency percentage: green ≥80, amber ≥50, else red. */
function pctColor(p: number): string {
  if (p >= 80) return 'var(--success)';
  if (p >= 50) return 'var(--warn)';
  return 'var(--danger)';
}

interface FieldHealth {
  key: keyof NapUrlResult['fields'];
  label: string;
  pct: number;
  segs: Array<{ flex: number; color: string }>;
  summary: string;
}

/** Share of listings that agree with the canonical value for one NAP field. */
function fieldHealth(results: NapUrlResult[], key: keyof NapUrlResult['fields'], label: string): FieldHealth {
  const counts: Record<FieldStatus, number> = { match: 0, variation: 0, mismatch: 0, missing: 0 };
  results.forEach((r) => { counts[r.fields[key].status]++; });
  const total = results.length || 1;
  const pct = Math.round((counts.match / total) * 100);
  const present = FH_ORDER.filter((s) => counts[s] > 0);
  const segs = present.map((s) => ({ flex: counts[s], color: SEG[s].color }));
  const summary = present.map((s) => `${counts[s]} ${SEG[s].word}`).join(' · ');
  return { key, label, pct, segs, summary };
}

/** Segmented consistency bar (one block per status, sized by share). */
function HealthBar({ segs, height }: { segs: FieldHealth['segs']; height: number }) {
  return (
    <div className="nap2-fh-bar" style={{ height }}>
      {segs.map((sg, i) => (
        <div key={i} className="nap2-fh-seg" style={{ flex: sg.flex, background: sg.color }} />
      ))}
    </div>
  );
}

// Scoped styling for the citation table + overview grid. The table is a CSS-grid
// of self-aligning columns that scrolls horizontally on narrow viewports rather
// than collapsing the per-field readout, and each row expands in place.
const napCss = `
.lvx .nap2-topgrad { height: 3px; background: linear-gradient(90deg, var(--primary), transparent); }

/* Scorecard: hero (gauge + diagnosis + CTA) | field-health panel */
.lvx .nap2-score { display: grid; grid-template-columns: 312px 1fr; }
.lvx .nap2-hero { padding: 24px 24px 22px; border-right: 1px solid var(--line); display: flex; flex-direction: column; gap: 20px; }
.lvx .nap2-gauge-wrap { min-height: 172px; display: flex; align-items: center; justify-content: center; }
.lvx .nap2-diag { border-top: 1px dashed var(--line); padding-top: 18px; }

.lvx .nap2-health { padding: 24px; display: flex; flex-direction: column; gap: 18px; }
.lvx .nap2-fh { display: flex; flex-direction: column; gap: 7px; }
.lvx .nap2-fh-bar { display: flex; gap: 2px; }
.lvx .nap2-fh-seg { border-radius: 3px; }
.lvx .nap2-info { border-top: 1px solid var(--line); padding-top: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }

/* Bottom strip: 5 KPIs + consistency sparkline */
.lvx .nap2-strip { border-top: 1px solid var(--line); display: grid; grid-template-columns: repeat(5, 1fr) 1.4fr; }
.lvx .nap2-stat { padding: 18px 16px; border-right: 1px solid var(--line); }
.lvx .nap2-stat-k { font-family: var(--mono); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--mute); font-weight: 500; display: flex; align-items: center; gap: 6px; }
.lvx .nap2-stat-v { margin-top: 10px; display: flex; align-items: baseline; gap: 6px; }
.lvx .nap2-stat-v b { font-size: 28px; font-weight: 700; letter-spacing: -.03em; line-height: 1; }
.lvx .nap2-stat-v i { font-style: normal; font-size: 12px; color: var(--mute); }
.lvx .nap2-spark { padding: 16px 22px; display: flex; flex-direction: column; justify-content: center; gap: 8px; min-width: 0; }

.lvx .nap2-scroll { overflow-x: auto; }
.lvx .nap2-tbl { min-width: 800px; }
.lvx .nap2-rowgrid { display: grid; grid-template-columns: 26px minmax(200px,1fr) repeat(5, 78px) 96px 54px; align-items: center; gap: 8px; padding: 12px var(--pad); }
.lvx .nap2-head { background: var(--surface-2); border-bottom: 1px solid var(--line); }
.lvx .nap2-th { font-family: var(--mono); font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--mute); font-weight: 500; }
.lvx .nap2-row { border-bottom: 1px solid var(--line); }
.lvx .nap2-row:last-child { border-bottom: none; }
.lvx .nap2-row-main { cursor: pointer; transition: background .12s ease; }
.lvx .nap2-row-main:hover { background: var(--surface-2); }
.lvx .nap2-caret { font-size: 10px; color: var(--mute); transition: transform .18s ease; }
.lvx .nap2-host { color: var(--primary); font-weight: 600; font-size: 13px; white-space: nowrap; }
.lvx .nap2-path { color: var(--text-3); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lvx .nap2-flag { font-family: var(--mono); font-size: 9.5px; letter-spacing: .02em; padding: 2px 6px; border-radius: 5px; white-space: nowrap; }
.lvx .nap2-expand { background: var(--surface-2); border-top: 1px solid var(--line); padding: 16px var(--pad) 22px 56px; }
.lvx .nap2-expand-grid { display: grid; grid-template-columns: 1fr 280px; gap: 26px; }
.lvx .nap2-kv { display: grid; grid-template-columns: 96px 1fr auto; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
.lvx .nap2-kv:last-child { border-bottom: none; }

@media (max-width: 860px) {
  .lvx .nap2-score { grid-template-columns: 1fr; }
  .lvx .nap2-hero { border-right: none; border-bottom: 1px solid var(--line); }
}
@media (max-width: 760px) {
  .lvx .nap2-strip { grid-template-columns: repeat(2, 1fr); }
  .lvx .nap2-stat { border-bottom: 1px solid var(--line); }
  .lvx .nap2-stat:nth-child(2n) { border-right: none; }
  .lvx .nap2-spark { grid-column: 1 / -1; border-top: 1px solid var(--line); }
  .lvx .nap2-info { grid-template-columns: 1fr; gap: 14px; }
  .lvx .nap2-expand-grid { grid-template-columns: 1fr; }
}
`;

/** Split a URL into a non-breaking host + an ellipsis-able path for clean display. */
function splitUrl(raw: string): { host: string; path: string } {
  const noProto = raw.replace(/^https?:\/\//, '').replace(/^www\./, '');
  const slash = noProto.indexOf('/');
  if (slash === -1) return { host: noProto, path: '' };
  return { host: noProto.slice(0, slash), path: noProto.slice(slash) };
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

/** Circular consistency-score gauge (SVG, themed via tokens). */
function ScoreGauge({ score }: { score: number }) {
  const size = 172, stroke = 13, r = 54, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const b = band(score);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 128 128" style={{ transform: 'rotate(-90deg)', display: 'block' }}>
          <circle cx={64} cy={64} r={r} stroke="var(--surface-3)" strokeWidth={stroke} fill="none" />
          <circle
            cx={64} cy={64} r={r} stroke={b.color} strokeWidth={stroke} fill="none"
            strokeDasharray={`${c * pct} ${c}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1s cubic-bezier(.2,.7,.2,1)' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <span style={{ fontSize: 48, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, color: 'var(--text)' }}>{score}</span>
            <span className="mono" style={{ fontSize: 14, color: 'var(--mute)' }}>/100</span>
          </div>
          <span className="mono" style={{ marginTop: 5, fontSize: 11, letterSpacing: '0.16em', fontWeight: 600, color: b.color }}>{b.word}</span>
        </div>
      </div>
      <div className="mono" style={{ fontSize: 10.5, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--mute)' }}>
        NAP consistency
      </div>
    </div>
  );
}

/* ── Syntax-highlighted JSON-LD for the terminal block ──
   Keys, string values and the <script> wrapper are coloured against a fixed
   dark terminal (intentionally dark in both light & dark themes, like a code block). */
const TERM = { key: '#9ee6b3', val: '#e7c98b', tag: '#7b86c9', base: '#cfd3f5' };
function highlightLine(line: string): React.ReactNode[] {
  if (/^\s*<\/?script/.test(line)) {
    // Colour the whole script wrapper line in the tag tone, keeping its quoted type readable.
    const out: React.ReactNode[] = [];
    const re = /"(?:[^"\\]|\\.)*"/g;
    let last = 0, m: RegExpExecArray | null, i = 0;
    while ((m = re.exec(line))) {
      if (m.index > last) out.push(<span key={i++} style={{ color: TERM.tag }}>{line.slice(last, m.index)}</span>);
      out.push(<span key={i++} style={{ color: TERM.key }}>{m[0]}</span>);
      last = m.index + m[0].length;
    }
    if (last < line.length) out.push(<span key={i++} style={{ color: TERM.tag }}>{line.slice(last)}</span>);
    return out;
  }
  const out: React.ReactNode[] = [];
  const re = /"(?:[^"\\]|\\.)*"/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(<span key={i++} style={{ color: TERM.base }}>{line.slice(last, m.index)}</span>);
    const after = line.slice(m.index + m[0].length).trimStart();
    const isKey = after.startsWith(':');
    out.push(<span key={i++} style={{ color: isKey ? TERM.key : TERM.val }}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(<span key={i++} style={{ color: TERM.base }}>{line.slice(last)}</span>);
  return out;
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
            Paste into the <code className="mono">&lt;head&gt;</code> of any listing missing structured data so engines read your NAP cleanly.
          </span>
        </span>
        <span className="card-r">
          <button onClick={copy} className={copied ? 'btn-p' : 'btn-g'}>{copied ? '✓ Copied' : 'Copy snippet'}</button>
        </span>
      </header>
      <div className="card-b">
        <div style={{ borderRadius: 'var(--radius-lg)', background: '#14142a', overflow: 'hidden', border: '1px solid #20203c' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f57' }} />
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#febc2e' }} />
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#28c840' }} />
            <span className="mono" style={{ marginLeft: 8, fontSize: 11, color: 'rgba(255,255,255,.4)' }}>localbusiness.jsonld</span>
          </div>
          <pre style={{ margin: 0, padding: '18px 20px', fontFamily: 'var(--mono)', fontSize: 12.5, lineHeight: 1.65, color: TERM.base, overflowX: 'auto' }}>
            {snippet.split('\n').map((line, i) => (
              <div key={i}>{highlightLine(line)}</div>
            ))}
          </pre>
        </div>
      </div>
    </section>
  );
}

// Presentational flag list (no JSON-LD, JS-rendered, archive snapshot, unreachable).
type FlagView = { label: string; color: string; bg: string };
function rowFlags(r: NapUrlResult): FlagView[] {
  const flags: FlagView[] = [];
  const hasSchema = Object.values(r.extracted.source ?? {}).includes('schema');
  if (!r.reachable) flags.push({ label: r.error || `HTTP ${r.httpStatus ?? '-'}`, color: 'var(--danger)', bg: 'var(--danger-50)' });
  if (r.reachable && !hasSchema) flags.push({ label: 'no JSON-LD', color: 'var(--primary)', bg: 'var(--primary-50)' });
  if (r.archivedAt) flags.push({ label: `via Web Archive · ${r.archivedAt}`, color: 'var(--info)', bg: 'var(--info-50)' });
  else if (r.rendered) flags.push({ label: 'JS-rendered', color: 'var(--info)', bg: 'var(--info-50)' });
  return flags;
}

/* ── A single citation row: collapsed summary + in-place expand ── */
function CitationRow({
  r, overridden, interactive, expanded, onExpand, onToggle, busy,
}: {
  r: NapUrlResult;
  overridden: boolean;
  interactive: boolean;
  expanded: boolean;
  onExpand: () => void;
  onToggle: (url: string, ok: boolean) => void;
  busy: boolean;
}) {
  const { host, path } = splitUrl(r.url);
  const flags = rowFlags(r);
  // Left accent edge keyed to severity, so the eye lands on the worst rows first.
  const { verdict } = napVerdict(r, overridden);
  const accentEdge = overridden
    ? 'var(--success-100)'
    : verdict === 'ok'
      ? 'transparent'
      : verdict === 'unverified'
        ? 'var(--warn)'
        : r.matchScore < 50 ? 'var(--danger)' : 'var(--warn)';
  const fieldOrder: Array<{ k: string; status: FieldStatus; found?: string; mono?: boolean }> = [
    { k: 'Name', status: r.fields.name.status, found: r.extracted.name },
    { k: 'Phone', status: r.fields.phone.status, found: r.extracted.phone, mono: true },
    { k: 'Address', status: r.fields.address.status, found: r.extracted.street },
    { k: 'Postcode', status: r.fields.postcode.status, found: r.extracted.postcode, mono: true },
    { k: 'Suite', status: r.fields.suite.status },
  ];

  return (
    <div className="nap2-row" style={{ opacity: overridden ? 0.62 : 1 }}>
      <div
        className="nap2-rowgrid nap2-row-main"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onExpand}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onExpand(); } }}
        style={{ background: expanded ? 'var(--surface-2)' : 'transparent', borderLeft: `3px solid ${accentEdge}` }}
      >
        <span className="nap2-caret" aria-hidden style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}>▶</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
            <span className="nap2-host">{host}</span>
            <span className="nap2-path">{path}</span>
          </div>
          {flags.length > 0 && (
            <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {flags.map((f, i) => (
                <span key={i} className="nap2-flag" style={{ background: f.bg, color: f.color }}>{f.label}</span>
              ))}
            </div>
          )}
        </div>
        {fieldOrder.map((f) => (
          <div key={f.k} style={{ display: 'flex', justifyContent: 'center' }}>
            <FieldPill status={f.status} />
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <VerdictBadge r={r} overridden={overridden} />
        </div>
        <div className="mono" style={{ textAlign: 'right', fontSize: 17, fontWeight: 600, color: overridden ? 'var(--info)' : r.reachable ? band(r.matchScore).color : 'var(--mute)' }}>
          {overridden ? 'OK' : r.reachable ? r.matchScore : '-'}
        </div>
      </div>

      {expanded && (
        <div className="nap2-expand">
          <div className="nap2-expand-grid">
            <div>
              <div className="mono" style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 10 }}>Captured values</div>
              <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--surface)' }}>
                {fieldOrder.map((f) => {
                  const missing = f.status === 'missing' || (!f.found && f.k !== 'Suite');
                  const value = missing ? 'not found' : (f.found || '-');
                  return (
                    <div className="nap2-kv" key={f.k}>
                      <span className="mono" style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--mute)' }}>{f.k}</span>
                      <span style={{ fontSize: 13, color: missing ? 'var(--mute)' : 'var(--text)', fontWeight: missing ? 400 : 500, fontFamily: f.mono ? 'var(--mono)' : 'var(--sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={value}>{value}</span>
                      <FieldPill status={f.status} />
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 7 }}>
                {overridden ? (
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--info)', background: 'var(--info-50)', border: '1px solid var(--info-100)', padding: '3px 9px', borderRadius: 7 }}>verified manually</span>
                ) : r.tags.length === 0 ? (
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--success)', background: 'var(--success-50)', border: '1px solid var(--success-100)', padding: '3px 9px', borderRadius: 7 }}>all fields consistent</span>
                ) : (
                  r.tags.map((t) => {
                    const couldntCheck = t === 'blocked' || t === 'dead link';
                    return (
                      <span key={t} className="mono" style={{ fontSize: 10.5, color: couldntCheck ? 'var(--warn)' : 'var(--danger)', background: couldntCheck ? 'var(--warn-50)' : 'var(--danger-50)', border: `1px solid ${couldntCheck ? 'var(--warn-100)' : 'var(--danger-100)'}`, padding: '3px 9px', borderRadius: 7 }}>{t}</span>
                    );
                  })
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', padding: 14, background: 'var(--surface)' }}>
                <div className="mono" style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--mute)' }}>Verdict basis</div>
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>
                  {r.reachable
                    ? 'Verdict computed from Name, Phone & Address. Postcode & Suite are informational.'
                    : `Couldn't read this listing (${r.error || `HTTP ${r.httpStatus ?? '-'}`}), so its NAP is unverified rather than a confirmed mismatch.`}
                </div>
              </div>
              <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="btn-g" style={{ justifyContent: 'center', textDecoration: 'none' }}>Open listing ↗</a>
              {interactive && (
                <button
                  onClick={() => onToggle(r.url, !overridden)}
                  disabled={busy}
                  className={overridden ? 'btn-g' : 'btn-p'}
                  style={{ justifyContent: 'center', ...(overridden ? {} : { background: 'var(--success)' }) }}
                  title={overridden ? 'Reopen this listing as unresolved' : 'I checked this listing by hand and the NAP is correct'}
                >
                  {busy ? '…' : overridden ? '↺ Reopen' : '✓ Mark OK'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
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
  trend,
  runTag,
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
  /** Optional pill shown next to the overview title (e.g. "Manual run", "Auto · weekly"). */
  runTag?: string;
}) {
  const ov = overrides ?? {};
  const interactive = typeof onToggleOverride === 'function';
  const [filter, setFilter] = useState<'all' | 'issues' | 'clean'>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const tableRef = useRef<HTMLElement>(null);

  const cleanCount = data.results.filter((r) => isCleanVerdict(r, !!ov[r.url])).length;
  const issueCount = data.results.length - cleanCount;

  // Field health: share of listings that agree with the canonical value, per field.
  // Name/Phone/Address drive the verdict; Postcode/Suite are informational.
  const napFields = [
    fieldHealth(data.results, 'name', 'Name'),
    fieldHealth(data.results, 'phone', 'Phone'),
    fieldHealth(data.results, 'address', 'Address'),
  ];
  const infoFields = [
    fieldHealth(data.results, 'postcode', 'Postcode'),
    fieldHealth(data.results, 'suite', 'Suite'),
  ];
  const weakest = [...napFields].sort((a, b) => a.pct - b.pct)[0];
  const diagnosis = issueCount > 0 && weakest
    ? `${weakest.label} is your weakest field — only ${weakest.pct}% of listings match.`
    : 'Every listing agrees with your canonical NAP.';

  const focusIssues = () => {
    setFilter('issues');
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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

  const stats: Array<{ k: string; v: number; unit?: string; color: string }> = [
    { k: 'Citations', v: data.summary.total, color: 'var(--text)' },
    { k: 'Clean', v: data.summary.clean, unit: 'listings', color: 'var(--success)' },
    { k: 'With issues', v: data.summary.withIssues, unit: 'listings', color: 'var(--warn)' },
    { k: 'Dead links', v: data.summary.deadLinks, color: data.summary.deadLinks > 0 ? 'var(--danger)' : 'var(--text)' },
    { k: 'Duplicates', v: data.summary.duplicateListings, color: data.summary.duplicateListings > 0 ? 'var(--primary)' : 'var(--text)' },
  ];

  const filterDefs: Array<{ key: 'all' | 'issues' | 'clean'; label: string; count: number }> = [
    { key: 'all', label: 'All', count: data.results.length },
    { key: 'issues', label: 'With issues', count: issueCount },
    { key: 'clean', label: 'Clean', count: cleanCount },
  ];

  // Worst-first: unresolved issues, then unverified, then clean; lower score first.
  const verdictRank = (r: NapUrlResult): number => {
    const { verdict } = napVerdict(r, !!ov[r.url]);
    return verdict === 'issues' ? 0 : verdict === 'unverified' ? 1 : 2;
  };
  const sorted = [...data.results].sort(
    (a, b) => verdictRank(a) - verdictRank(b) || a.matchScore - b.matchScore,
  );
  const visible = sorted.filter((r) => {
    if (filter === 'all') return true;
    const clean = isCleanVerdict(r, !!ov[r.url]);
    return filter === 'clean' ? clean : !clean;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{napCss}</style>

      {/* ─── Overview: gauge + diagnosis/CTA · field health · KPI strip + trend ─── */}
      <section className="card">
        <div className="nap2-topgrad" aria-hidden />
        <header className="card-h">
          <span className="card-tw" style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span className="card-t">Audit overview</span>
            {runTag && (
              <span className="mono" style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--mute)', background: 'var(--surface-3)', padding: '3px 8px', borderRadius: 6 }}>{runTag}</span>
            )}
          </span>
          <span className="card-r">
            <button onClick={downloadCsv} className="btn-g">↓ Export CSV</button>
          </span>
        </header>
        <div className="card-b no-pad">
          <div className="nap2-score">
            {/* hero: gauge + diagnosis + fix CTA */}
            <div className="nap2-hero">
              <div className="nap2-gauge-wrap">
                <ScoreGauge score={data.score} />
              </div>
              <div className="nap2-diag">
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-2)' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{issueCount} of {data.results.length} listings</span>
                  {' '}have NAP issues. {diagnosis}
                </p>
                {issueCount > 0 && (
                  <button
                    onClick={focusIssues}
                    className="btn-p"
                    style={{ marginTop: 14, width: '100%', justifyContent: 'center', padding: 11, fontSize: 13.5 }}
                  >
                    ⚡ Fix {issueCount} {issueCount === 1 ? 'issue' : 'issues'}
                  </button>
                )}
              </div>
            </div>

            {/* field health: per-field consistency bars */}
            <div className="nap2-health">
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text)' }}>NAP field health</div>
                  <div style={{ marginTop: 3, fontSize: 12, color: 'var(--mute)' }}>Share of listings that agree with your canonical value</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  {FH_ORDER.map((s) => (
                    <span key={s} className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--mute)' }}>
                      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: SEG[s].color }} />
                      {FIELD_BADGE[s].label}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                {napFields.map((fh) => (
                  <div className="nap2-fh" key={fh.key}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>{fh.label}</span>
                      <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: pctColor(fh.pct) }}>
                        {fh.pct}%<span style={{ color: 'var(--mute)', fontWeight: 400 }}> consistent</span>
                      </span>
                    </div>
                    <HealthBar segs={fh.segs} height={10} />
                    <span className="mono" style={{ fontSize: 10.5, color: 'var(--mute)' }}>{fh.summary}</span>
                  </div>
                ))}
              </div>

              <div className="nap2-info">
                {infoFields.map((fh) => (
                  <div className="nap2-fh" key={fh.key}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)' }}>
                        {fh.label}{' '}
                        <span className="mono" style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--mute)', fontWeight: 500 }}>· info</span>
                      </span>
                      <span className="mono" style={{ fontSize: 11.5, fontWeight: 600, color: pctColor(fh.pct) }}>{fh.pct}%</span>
                    </div>
                    <HealthBar segs={fh.segs} height={7} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* bottom strip: KPIs + consistency sparkline */}
          <div className="nap2-strip">
            {stats.map((s) => (
              <div className="nap2-stat" key={s.k}>
                <div className="nap2-stat-k">{s.k}</div>
                <div className="nap2-stat-v">
                  <b style={{ color: s.color }}>{s.v}</b>
                  {s.unit && <i>{s.unit}</i>}
                </div>
              </div>
            ))}
            <div className="nap2-spark">
              <div className="mono" style={{ fontSize: 9.5, letterSpacing: '0.11em', textTransform: 'uppercase', color: 'var(--mute)', fontWeight: 500 }}>Consistency over time</div>
              {trend ?? <p className="quiet" style={{ fontSize: 12, margin: 0, color: 'var(--text-3)' }}>Re-run this audit over time to see a consistency trend here.</p>}
            </div>
          </div>
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
              in your browser - so their live NAP couldn&apos;t be read. These show as <strong>Unverified</strong>,
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
                Duplicates split your ranking signal - consolidate or remove the extras, starting with any that disagree on NAP.
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
      <section className="card" ref={tableRef} style={{ scrollMarginTop: 16 }}>
        <header className="card-h has-lede">
          <span className="card-tw" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="card-t">Citation details</span>
            <span className="card-lede">
              {data.results.length} {data.results.length === 1 ? 'listing' : 'listings'} checked - the <strong>NAP</strong> verdict is based on Name, Address &amp; Phone only.
            </span>
          </span>
          <span className="card-r" style={{ flexWrap: 'wrap', justifyContent: 'flex-end', gap: 13 }}>
            {(['match', 'variation', 'mismatch', 'missing'] as FieldStatus[]).map((s) => (
              <span key={s} className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--text-3)' }}>
                <span aria-hidden style={{ width: 9, height: 9, borderRadius: 3, background: `var(--${s === 'match' ? 'success' : s === 'variation' ? 'warn' : s === 'mismatch' ? 'danger' : 'mute'})` }} />
                {FIELD_BADGE[s].label}
              </span>
            ))}
          </span>
        </header>

        {/* filter tabs */}
        <div style={{ padding: '0 var(--pad) 14px', display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          {filterDefs.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={active ? 'btn-p' : 'btn-g'}
                style={{ padding: '6px 12px', fontWeight: active ? 600 : 500 }}
              >
                {f.label}
                <span className="mono" style={{ fontSize: 11, color: active ? 'rgba(255,255,255,.75)' : 'var(--mute)' }}>{f.count}</span>
              </button>
            );
          })}
        </div>

        <div className="card-b no-pad">
          <div className="nap2-scroll">
            <div className="nap2-tbl">
              {/* table header */}
              <div className="nap2-rowgrid nap2-head">
                <span />
                <span className="nap2-th">Source</span>
                <span className="nap2-th" style={{ textAlign: 'center' }}>Name</span>
                <span className="nap2-th" style={{ textAlign: 'center' }}>Phone</span>
                <span className="nap2-th" style={{ textAlign: 'center' }}>Address</span>
                <span className="nap2-th" style={{ textAlign: 'center' }}>Postcode</span>
                <span className="nap2-th" style={{ textAlign: 'center' }}>Suite</span>
                <span className="nap2-th" style={{ textAlign: 'center' }}>Verdict</span>
                <span className="nap2-th" style={{ textAlign: 'right' }}>Score</span>
              </div>
              {visible.length === 0 ? (
                <div className="quiet" style={{ padding: '28px var(--pad)', textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
                  No listings match this filter.
                </div>
              ) : (
                visible.map((r, i) => (
                  <CitationRow
                    key={r.url + i}
                    r={r}
                    overridden={!!ov[r.url]}
                    interactive={interactive}
                    expanded={!!expanded[r.url]}
                    onExpand={() => setExpanded((e) => ({ ...e, [r.url]: !e[r.url] }))}
                    onToggle={(url, okFlag) => onToggleOverride?.(url, okFlag)}
                    busy={busyUrl === r.url}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {canonical && <SchemaCard canonical={canonical} />}
    </div>
  );
}
