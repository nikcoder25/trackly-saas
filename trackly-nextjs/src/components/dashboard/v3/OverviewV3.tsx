'use client';
// v3 Overview. Every figure comes from useOverviewData (the same hook the
// classic Overview uses) plus the open-recommendations list; nothing here is
// invented. Sections that have no backing data show a short empty state.

import * as React from 'react';
import Link from 'next/link';
import { useOverviewData, downloadBrandReport, type OverviewFilters } from '@/app/dashboard-v2/pages/overview';
import { PLATFORMS, useLS } from '@/app/dashboard-v2/ui';
import { useBrands } from '@/contexts/BrandContext';
import { useRun } from '@/contexts/RunContext';
import { useToast } from '@/components/dashboard/Toast';
import { V3Icon } from './icons';
import { useOpenRecommendations } from './hooks';

const FILTERS: OverviewFilters = { range: '90d', engine: 'all', intent: 'all', competitorView: 'all' };
const ENGINE_NAMES = PLATFORMS.map(p => p.name);

type Range = '7d' | '21d' | '90d';
const RANGE_DAYS: Record<Range, number> = { '7d': 7, '21d': 21, '90d': 90 };

function hostOf(raw?: string | null): string {
  if (!raw) return '';
  try { return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return ''; }
}

function pts(n: number) { return `${n} point${Math.abs(n) === 1 ? '' : 's'}`; }

/* ─────────────────────────── goal ring ─────────────────────────── */

function GoalRing({ current, goal }: { current: number; goal: number }) {
  const size = 168, stroke = 14, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const arc = (v: number) => `${(clamp(v) / 100) * c} ${c}`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={`Share of voice ${current}% of a ${goal}% goal`} className="v3-ring">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`} fill="none" strokeWidth={stroke} strokeLinecap="round">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--v3-line-soft)" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--v3-accent-ring)" strokeDasharray={arc(goal)} />
        {current > 0 && <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--v3-accent)" strokeDasharray={arc(current)} />}
      </g>
      <text x="50%" y="47%" textAnchor="middle" className="v3-ring-v">{current}%</text>
      <text x="50%" y="62%" textAnchor="middle" className="v3-ring-l">share of voice</text>
    </svg>
  );
}

function GoalCard({ sov, answers, rank, accuracy, positive, brandId, brandGoal, onSaved }: {
  sov: number; answers: string; rank: string | null; accuracy: number | null; positive: number | null;
  brandId?: string; brandGoal: number; onSaved: () => void | Promise<void>;
}) {
  // Same fallback the classic GoalCard uses when the brand has no saved goal.
  const [lsGoal, setLsGoal] = useLS('lvx_goal', { target: 30, by: '' });
  const goal = brandGoal > 0 ? brandGoal : lsGoal.target;
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<string>(String(goal));
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const toGo = Math.max(0, Math.round((goal - sov) * 10) / 10);

  const save = async () => {
    const n = Math.max(1, Math.min(100, Math.round(Number(draft)) || goal));
    setErr(null);
    if (brandId) {
      setSaving(true);
      try {
        const res = await fetch(`/api/brands/${brandId}`, {
          method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal: n }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `HTTP ${res.status}`);
        await onSaved();
      } catch (e) {
        setErr((e as Error).message || 'Could not save goal');
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    setLsGoal({ ...lsGoal, target: n });
    setEditing(false);
  };

  return (
    <section className="v3-card v3-goal" aria-labelledby="v3-goal-t">
      <div className="v3-goal-top">
        <GoalRing current={sov} goal={goal} />
        <div className="v3-goal-copy">
          <div className="v3-eyebrow">Your goal</div>
          {editing ? (
            <form className="v3-goal-edit" onSubmit={e => { e.preventDefault(); save(); }}>
              <label htmlFor="v3-goal-in">Goal share of voice (%)</label>
              <div className="v3-goal-edit-row">
                <input id="v3-goal-in" type="number" min={1} max={100} value={draft} onChange={e => setDraft(e.target.value)} autoFocus className="v3-input" />
                <button type="submit" className="v3-btn v3-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                <button type="button" className="v3-btn v3-btn-secondary" onClick={() => { setEditing(false); setErr(null); }} disabled={saving}>Cancel</button>
              </div>
              {err && <p className="v3-err">{err}</p>}
            </form>
          ) : (
            <>
              <h2 id="v3-goal-t" className="v3-goal-t">Goal: {goal}% share of voice</h2>
              <p className="v3-goal-sub">
                {toGo > 0 ? <><b>{pts(toGo)}</b> to go</> : <b className="v3-good">Goal reached. Time to aim higher.</b>}
              </p>
              <button type="button" className="v3-link-btn" onClick={() => { setDraft(String(goal)); setEditing(true); }}>Edit goal</button>
            </>
          )}
          <div className="v3-legend">
            <span><i style={{ background: 'var(--v3-accent)' }} />You today</span>
            <span><i style={{ background: 'var(--v3-accent-ring)' }} />Goal</span>
          </div>
        </div>
      </div>
      <div className="v3-tiles">
        <div className="v3-tile"><div className="v3-tile-k">Answers naming you</div><div className="v3-tile-v">{answers}</div></div>
        <div className="v3-tile"><div className="v3-tile-k">Rank vs rivals</div><div className="v3-tile-v">{rank ?? <small>Add rivals in Brand Setup</small>}</div></div>
        <div className="v3-tile"><div className="v3-tile-k">Facts AI gets right</div>
          <div className={'v3-tile-v' + (accuracy != null ? ' good' : '')}>{accuracy != null ? `${Math.round(accuracy)}%` : <small>Not checked yet</small>}</div></div>
        <div className="v3-tile"><div className="v3-tile-k">Positive tone</div>
          <div className="v3-tile-v">{positive != null ? `${positive}%` : <small>No tone data yet</small>}</div></div>
      </div>
    </section>
  );
}

/* ─────────────────────────── do these next ─────────────────────────── */

function DoNext() {
  const { recs, loaded, available } = useOpenRecommendations();
  const top = recs.slice(0, 3);
  return (
    <section className="v3-dark-card" aria-labelledby="v3-next-t">
      <div className="v3-eyebrow v3-on-dark">Do these next</div>
      <h2 id="v3-next-t" className="v3-dark-t">{top.length > 0 ? `${recs.length} fix${recs.length === 1 ? '' : 'es'} waiting` : 'Your to-do list'}</h2>
      {!available ? (
        <p className="v3-dark-p">Fix suggestions come with the Starter plan and up.</p>
      ) : !loaded ? (
        <p className="v3-dark-p">Loading…</p>
      ) : top.length === 0 ? (
        <p className="v3-dark-p">Nothing open right now. New fixes show up after each scan.</p>
      ) : (
        <ol className="v3-next-list">
          {top.map((r, i) => (
            <li key={r.id}>
              <Link href={`/dashboard/recommendations#rec-${r.id}`} className="v3-next-row">
                <span className="v3-next-n">{i + 1}</span>
                <span className="v3-next-txt">
                  <span className="v3-next-title">{r.title}</span>
                  <span className="v3-next-meta">{r.severity} priority</span>
                </span>
                <V3Icon name="chevron-right" size={18} />
              </Link>
            </li>
          ))}
        </ol>
      )}
      <Link href={available ? '/dashboard/recommendations' : '/dashboard/account'} className="v3-btn v3-btn-primary v3-btn-block v3-next-cta">
        {available ? 'See every fix' : 'See plans'}
      </Link>
    </section>
  );
}

/* ─────────────────────────── SOV chart ─────────────────────────── */

function SovChart({ history, goal }: { history: { t: number; sov: number }[]; goal: number }) {
  const [range, setRange] = React.useState<Range>('21d');
  // Draw at the real pixel width so labels never stretch on phones.
  const boxRef = React.useRef<HTMLDivElement>(null);
  const [W, setW] = React.useState(640);
  React.useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cutoff = Date.now() - RANGE_DAYS[range] * 86400_000;
  const inRange = history.filter(h => h.t >= cutoff);
  const pts0 = inRange.length > 0 ? inRange : history.slice(-1);
  const H = 220, padL = 34, padR = 12, padT = 12, padB = 26;
  const maxY = Math.min(100, Math.max(20, Math.ceil((Math.max(goal, ...pts0.map(p => p.sov)) + 5) / 10) * 10));
  const t0 = pts0.length > 1 ? pts0[0].t : cutoff;
  const t1 = pts0.length > 1 ? pts0[pts0.length - 1].t : Date.now();
  const x = (t: number) => padL + (t1 === t0 ? (W - padL - padR) : ((t - t0) / (t1 - t0)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - v / maxY) * (H - padT - padB);
  const line = pts0.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.sov).toFixed(1)}`).join(' ');
  const area = pts0.length > 1 ? `${line} L${x(pts0[pts0.length - 1].t).toFixed(1)},${y(0)} L${x(pts0[0].t).toFixed(1)},${y(0)} Z` : '';
  const ticks = [0, maxY / 2, maxY];
  const fmtDay = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return (
    <section className="v3-card v3-chart-card" aria-labelledby="v3-chart-t">
      <div className="v3-card-head">
        <div>
          <h2 id="v3-chart-t" className="v3-card-title">Share of voice over time</h2>
          <p className="v3-card-sub">Each point is one scan. The dashed line is your goal.</p>
        </div>
        <div className="v3-seg" role="tablist" aria-label="Chart range">
          {(['7d', '21d', '90d'] as Range[]).map(r => (
            <button key={r} type="button" role="tab" aria-selected={range === r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>
              {r === '7d' ? '7d' : r === '21d' ? '3 weeks' : '90d'}
            </button>
          ))}
        </div>
      </div>
      {history.length === 0 ? (
        <p className="v3-empty">Your chart starts after the first scan.</p>
      ) : (
        <div ref={boxRef}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="v3-chart" role="img" aria-label={`Share of voice, ${pts0.length} scans`}>
            {ticks.map(t => (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--v3-line-soft)" />
                <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="v3-chart-tick">{Math.round(t)}</text>
              </g>
            ))}
            <line x1={padL} x2={W - padR} y1={y(goal)} y2={y(goal)} stroke="var(--v3-accent)" strokeDasharray="5 5" strokeWidth={1.5} opacity={0.6} />
            {area && <path d={area} fill="var(--v3-accent-50)" />}
            {pts0.length > 1 && <path d={line} fill="none" stroke="var(--v3-accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"/>}
            {pts0.map(p => <circle key={p.t} cx={x(p.t)} cy={y(p.sov)} r={pts0.length > 12 ? 0 : 3.5} fill="var(--v3-surface)" stroke="var(--v3-accent)" strokeWidth={2} />)}
          </svg>
          <div className="v3-chart-x v3-mono">
            <span>{fmtDay(pts0[0].t)}</span>
            {inRange.length === 0 && <span>No scans in this range, showing the latest</span>}
            <span>{fmtDay(pts0[pts0.length - 1].t)}</span>
          </div>
        </div>
      )}
    </section>
  );
}

function RivalBars({ rows }: { rows: { name: string; sov: number; me?: boolean }[] }) {
  const max = Math.max(1, ...rows.map(r => r.sov));
  return (
    <section className="v3-card" aria-labelledby="v3-rivals-t">
      <div className="v3-card-head">
        <div>
          <h2 id="v3-rivals-t" className="v3-card-title">You vs competitors</h2>
          <p className="v3-card-sub">Share of all brand mentions in the last scan.</p>
        </div>
        <Link href="/dashboard/competitors" className="v3-link">All rivals <V3Icon name="arrow-right" size={14} /></Link>
      </div>
      {rows.length === 0 ? (
        <p className="v3-empty">No rivals named yet. Add competitors in <Link href="/dashboard/setup" className="v3-link">Brand Setup</Link>.</p>
      ) : (
        <ul className="v3-bars">
          {rows.map(r => (
            <li key={r.name} className={r.me ? 'me' : ''}>
              <div className="v3-bars-top">
                <span className="v3-bars-name">{r.name}{r.me && <span className="v3-pill accent">You</span>}</span>
                <span className="v3-mono">{r.sov}%</span>
              </div>
              <div className="v3-bar thick"><i style={{ width: `${(r.sov / max) * 100}%`, background: r.me ? 'var(--v3-accent)' : 'var(--v3-text-3)' }} /></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ─────────────────────────── questions + sites ─────────────────────────── */

function BuyerQuestions({ grid }: { grid: { q: string; engines: Record<string, boolean | null> }[] }) {
  const [mode, setMode] = React.useState<'win' | 'miss'>('miss');
  const rows = grid.map(g => {
    const answered = ENGINE_NAMES.filter(e => g.engines[e] != null);
    const named = answered.filter(e => g.engines[e]).length;
    return { ...g, named, answered: answered.length, winning: answered.length > 0 && named * 2 >= answered.length };
  });
  const shown = rows.filter(r => (mode === 'win' ? r.winning : !r.winning))
    .sort((a, b) => (mode === 'win' ? b.named - a.named : a.named - b.named));
  const counts = { win: rows.filter(r => r.winning).length, miss: rows.filter(r => !r.winning).length };
  return (
    <section className="v3-card v3-flush" aria-labelledby="v3-q-t">
      <div className="v3-card-head v3-pad">
        <div>
          <h2 id="v3-q-t" className="v3-card-title">Buyer questions</h2>
          <p className="v3-card-sub">Winning means at least half the engines named you.</p>
        </div>
        <div className="v3-seg" role="tablist" aria-label="Question filter">
          <button type="button" role="tab" aria-selected={mode === 'win'} className={mode === 'win' ? 'on' : ''} onClick={() => setMode('win')}>Winning {counts.win}</button>
          <button type="button" role="tab" aria-selected={mode === 'miss'} className={mode === 'miss' ? 'on' : ''} onClick={() => setMode('miss')}>Missing {counts.miss}</button>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="v3-empty v3-pad">{mode === 'win' ? 'No questions won yet. Start with the fixes list.' : 'You are winning every tracked question.'}</p>
      ) : (
        <div className="v3-table-scroll">
          <table className="v3-table">
            <thead>
              <tr>
                <th>Question</th>
                {PLATFORMS.map(p => <th key={p.id} className="c" title={p.name}>{p.short}</th>)}
              </tr>
            </thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.q}>
                  <td className="v3-q">
                    {/* Link sits under the question so it can never be pushed
                        past the card edge by a long question. */}
                    <span className="v3-q-text">{r.q}</span>
                    <Link className="v3-link v3-q-link" href={`/dashboard/prompt-details?q=${encodeURIComponent(r.q)}`}>
                      {mode === 'win' ? 'See answers' : 'How to win'} <V3Icon name="arrow-right" size={14} />
                    </Link>
                  </td>
                  {PLATFORMS.map(p => {
                    const v = r.engines[p.name];
                    return (
                      <td key={p.id} className="c">
                        <span className={'v3-edot ' + (v == null ? 'na' : v ? 'yes' : 'no')}
                          title={`${p.name}: ${v == null ? 'no answer' : v ? 'named you' : 'did not name you'}`} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="v3-legend v3-pad">
        <span><i className="v3-edot yes" />Named you</span>
        <span><i className="v3-edot no" />Did not</span>
        <span><i className="v3-edot na" />No answer</span>
      </div>
    </section>
  );
}

function TrustedSites({ sources, ownHost }: { sources: { d: string; n: number; share: number }[]; ownHost: string }) {
  const rows = sources.slice(0, 5);
  const max = Math.max(1, ...rows.map(r => r.n));
  return (
    <section className="v3-card" aria-labelledby="v3-sites-t">
      <div className="v3-card-head">
        <div>
          <h2 id="v3-sites-t" className="v3-card-title">Sites AI trusts for your category</h2>
          <p className="v3-card-sub">The domains quoted most in your last scan.</p>
        </div>
        <Link href="/dashboard/citations" className="v3-link">All sources <V3Icon name="arrow-right" size={14} /></Link>
      </div>
      {rows.length === 0 ? (
        <p className="v3-empty">No cited sites in the last scan.</p>
      ) : (
        <ol className="v3-sites">
          {rows.map((s, i) => {
            const own = !!ownHost && (s.d === ownHost || s.d.endsWith('.' + ownHost));
            return (
              <li key={s.d}>
                <span className="v3-sites-n v3-mono">{i + 1}</span>
                <span className="v3-sites-body">
                  <span className="v3-sites-top">
                    <span className="v3-sites-dwrap">
                      <span className="v3-sites-d" title={s.d}>{s.d}</span>
                      {own && <span className="v3-pill accent">You</span>}
                    </span>
                    <span className="v3-sites-count v3-mono v3-dim">{s.n} cite{s.n === 1 ? '' : 's'}</span>
                  </span>
                  <span className="v3-bar"><i style={{ width: `${(s.n / max) * 100}%`, background: own ? 'var(--v3-accent)' : 'var(--v3-ink)' }} /></span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/* ─────────────────────────── page ─────────────────────────── */

function Hero({ eyebrow, children, sub, actions }: { eyebrow: string; children: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="v3-hero">
      <div className="v3-hero-copy">
        <div className="v3-eyebrow">{eyebrow}</div>
        <h1 className="v3-hero-t v3-serif">{children}</h1>
        {sub && <p className="v3-hero-sub">{sub}</p>}
      </div>
      {actions && <div className="v3-hero-a">{actions}</div>}
    </header>
  );
}

export default function OverviewV3() {
  const { data, loading, error, retry } = useOverviewData(FILTERS);
  const { selectedBrand, selectedBrandLocked, refreshBrands } = useBrands();
  const { live, startRun, pct } = useRun();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [lsGoal] = useLS('lvx_goal', { target: 30, by: '' });
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  const download = async () => {
    setBusy(true);
    try { await downloadBrandReport(selectedBrand?.id, selectedBrand?.name, toast); } finally { setBusy(false); }
  };

  if (loading) {
    return (
      <div className="v3-page" aria-busy="true">
        <Hero eyebrow={today}>Loading your numbers…</Hero>
        <div className="v3-skel-grid"><div className="v3-skel" /><div className="v3-skel" /></div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="v3-page">
        <Hero eyebrow={today}>We could not load your data.</Hero>
        <div className="v3-card v3-empty-card">
          <p>{error}</p>
          <button type="button" className="v3-btn v3-btn-primary" onClick={() => retry()}>Try again</button>
        </div>
      </div>
    );
  }
  if (!data || !data.hasReal) {
    return (
      <div className="v3-page">
        <Hero eyebrow={today}>Add your brand to <em>get started</em>.</Hero>
        <div className="v3-card v3-empty-card">
          <p>We ask ChatGPT, Claude, Gemini, Perplexity and Grok about your category and show how often they name you.</p>
          <p className="v3-dim">Use &ldquo;Add brand&rdquo; in the brand menu to begin.</p>
        </div>
      </div>
    );
  }

  const d = data;
  const runBtn = (
    <button type="button" className="v3-btn v3-btn-primary" onClick={() => startRun(false)} disabled={live.running || selectedBrandLocked}>
      {live.running ? <>Scanning… {pct}%</> : <><V3Icon name="play" size={16} /> Run your first scan</>}
    </button>
  );
  if (d.noData) {
    return (
      <div className="v3-page">
        <Hero eyebrow={today} sub={`We will ask the 5 AI engines your ${d.promptCount} tracked questions and show where ${d.brandName} shows up.`}>
          Run your first scan for <em>{d.brandName}</em>.
        </Hero>
        <div className="v3-card v3-empty-card">
          <p>A scan takes a few minutes. You can leave this page while it runs.</p>
          {runBtn}
        </div>
      </div>
    );
  }

  // Weakest engine: the lowest real score, flagged only when it sits well
  // below the rest (at least 10 points and under 60% of their average).
  const real = d.platforms.filter(p => !p.noData);
  const sortedEng = [...real].sort((a, b) => a.sov - b.sov);
  const weakest = sortedEng[0];
  const othersAvg = real.length > 1 ? real.filter(p => p !== weakest).reduce((s, p) => s + p.sov, 0) / (real.length - 1) : 0;
  const weakId = weakest && real.length > 1 && othersAvg - weakest.sov >= 10 && weakest.sov < othersAvg * 0.6 ? weakest.id : null;

  const trendLine = d.runCount < 2
    ? 'This is your first scan, so there is nothing to compare yet.'
    : d.sovDelta > 0 ? `Up ${pts(d.sovDelta)} since your last scan.`
    : d.sovDelta < 0 ? `Down ${pts(Math.abs(d.sovDelta))} since your last scan.`
    : 'Same as your last scan.';
  const weakLine = weakest && real.length > 1 ? ` ${weakest.name} is your weakest engine at ${weakest.sov}%.` : '';

  const meIdx = d.competitors.findIndex(c => c.me);
  const rank = meIdx >= 0 && d.competitors.length > 1 ? `#${meIdx + 1} of ${d.competitors.length}` : null;
  const goal = Number((selectedBrand as Record<string, unknown> | null)?.goal) || 0;
  const chartGoal = goal > 0 ? goal : Number(lsGoal.target) || 30;

  return (
    <div className="v3-page">
      <Hero
        eyebrow={today}
        sub={<>{trendLine}{weakLine}</>}
        actions={<>
          <button type="button" className="v3-btn v3-btn-secondary" onClick={download} disabled={busy}>
            <V3Icon name="download" size={16} />{busy ? 'Preparing…' : 'Download report'}
          </button>
          <Link href="/dashboard/recommendations" className="v3-btn v3-btn-primary">See what to fix</Link>
        </>}
      >
        AI names you in <em>{d.sov} of every 100</em> answers.
      </Hero>

      {live.running && <p className="v3-note"><span className="v3-dot live" /> A scan is running. These numbers update when it finishes.</p>}

      <div className="v3-row v3-row-goal">
        <GoalCard
          sov={d.sov}
          answers={`${d.totalM} of ${d.answersOk ?? d.totalQ}`}
          rank={rank}
          accuracy={d.accuracyRate}
          positive={d.positivePct ?? null}
          brandId={selectedBrand?.id}
          brandGoal={goal}
          onSaved={refreshBrands}
        />
        <DoNext />
      </div>

      <section aria-labelledby="v3-eng-t" className="v3-block">
        <div className="v3-block-head">
          <h2 id="v3-eng-t" className="v3-h2">How each AI engine sees you</h2>
          <Link href="/dashboard/platforms" className="v3-link">Engine details <V3Icon name="arrow-right" size={14} /></Link>
        </div>
        <div className="v3-engines">
          {d.platforms.map(p => {
            const weak = p.id === weakId;
            return (
              <div key={p.id} className={'v3-engine' + (weak ? ' weak' : '') + (p.noData ? ' nodata' : '')}>
                <div className="v3-engine-top">
                  <span className="v3-engine-name">{p.name}</span>
                  {weak && <span className="v3-pill warn">Weak spot</span>}
                </div>
                {p.noData ? (
                  <div className="v3-engine-v v3-dim">No data</div>
                ) : (
                  <>
                    <div className="v3-engine-v">{p.sov}<small>%</small></div>
                    <div className="v3-bar"><i style={{ width: `${p.sov}%`, background: weak ? 'var(--v3-warn)' : undefined }} /></div>
                    <div className="v3-engine-d v3-mono">
                      {d.runCount < 2 ? 'first scan' : p.delta > 0 ? `+${p.delta} pts` : p.delta < 0 ? `${p.delta} pts` : 'no change'}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="v3-row v3-row-chart">
        <SovChart history={d.history || []} goal={chartGoal} />
        <RivalBars rows={d.competitors} />
      </div>

      <div className="v3-row v3-row-q">
        <BuyerQuestions grid={d.grid || []} />
        <TrustedSites sources={d.sources} ownHost={hostOf(d.website)} />
      </div>
    </div>
  );
}
