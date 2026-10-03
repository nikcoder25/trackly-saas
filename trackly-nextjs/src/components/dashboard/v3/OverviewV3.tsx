'use client';
// v3 Overview. Every figure comes from useOverviewData (the same hook the
// classic Overview uses) plus the open-recommendations list; nothing here is
// invented. Sections that have no backing data show a short empty state.

import * as React from 'react';
import Link from 'next/link';
import { useOverviewData, downloadBrandReport, type OverviewFilters } from '@/app/dashboard-v2/pages/overview';
import { PLATFORMS, useLS } from '@/app/dashboard-v2/ui';
import { useBrands } from '@/contexts/BrandContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRun } from '@/contexts/RunContext';
import { useToast } from '@/components/dashboard/Toast';
import { getPlanPlatforms } from '@/lib/constants';
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
function plural(n: number, word: string) { return `${n} ${word}${n === 1 ? '' : 's'}`; }
/** Oxford-free list: "ChatGPT, Claude and Gemini". */
function listNames(names: string[]) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/* ─────────────────────────── small parts ─────────────────────────── */

/** Change since the last scan: ▲ green, ▼ red, flat grey. */
function Delta({ v, first, sm, unit = 'pts' }: { v: number; first?: boolean; sm?: boolean; unit?: string }) {
  if (first) return <span className={'v3-delta' + (sm ? ' sm' : '')}>First scan</span>;
  const dir = v > 0 ? 'up' : v < 0 ? 'down' : '';
  return (
    <span className={`v3-delta ${dir}${sm ? ' sm' : ''}`} title="Change since your last scan">
      {v > 0 && <V3Icon name="arrow-up" size={sm ? 11 : 13} />}
      {v < 0 && <V3Icon name="arrow-down" size={sm ? 11 : 13} />}
      {v === 0 ? 'No change' : `${Math.abs(v)} ${unit}`}
    </span>
  );
}

/** Tiny trend line for an engine card. */
function Spark({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const W = 72, H = 24, max = Math.max(...data, 1), min = Math.min(...data, 0);
  const x = (i: number) => (i / (data.length - 1)) * W;
  const y = (v: number) => H - 2 - ((v - min) / Math.max(1, max - min)) * (H - 4);
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="v3-spark" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r={2.5} fill={color} />
    </svg>
  );
}

const ENGINE_COLOR: Record<string, string> = {
  chatgpt: '#10A37F', claude: '#D97757', gemini: '#4285F4', perplexity: '#1F8A96', grok: '#1D1D1F',
};

/* ─────────────────────────── rings ─────────────────────────── */

/** Three concentric progress rings: visibility against goal, facts right,
 *  positive tone. Each closes at 100% of its own target. */
function Rings({ rings, size = 188 }: { rings: { v: number | null; of: number; color: string; label: string }[]; size?: number }) {
  const stroke = 16, gap = 4;
  const label = rings.map(r => `${r.label} ${r.v == null ? 'not measured' : `${r.v}%`}`).join(', ');
  return (
    <div className="v3-rings">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`} fill="none" strokeWidth={stroke} strokeLinecap="round">
          {rings.map((ring, i) => {
            const r = size / 2 - stroke / 2 - i * (stroke + gap);
            const c = 2 * Math.PI * r;
            const frac = ring.v == null ? 0 : Math.max(0, Math.min(1, ring.v / Math.max(1, ring.of)));
            return (
              <g key={ring.label}>
                <circle cx={size / 2} cy={size / 2} r={r} stroke={ring.color} opacity={0.16} />
                {frac > 0 && <circle className="arc" cx={size / 2} cy={size / 2} r={r} stroke={ring.color} strokeDasharray={`${Math.max(0.001, frac * c)} ${c}`} />}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

/* ─────────────────────────── hero ─────────────────────────── */

/** Scans in a row (newest backwards) where the score held or rose. */
function streakOf(history: { sov: number }[]): number {
  let n = 0;
  for (let i = history.length - 1; i > 0; i--) {
    if (history[i].sov >= history[i - 1].sov) n++;
    else break;
  }
  return n;
}

function HeroCard({ sov, delta, first, noAnswers, answers, accuracy, positive, history, brandId, brandGoal, onSaved }: {
  sov: number; delta: number; first: boolean; noAnswers: boolean; answers: string; accuracy: number | null; positive: number | null;
  history: { t: number; sov: number }[]; brandId?: string; brandGoal: number; onSaved: () => void | Promise<void>;
}) {
  // Same fallback the classic GoalCard uses when the brand has no saved goal.
  const [lsGoal, setLsGoal] = useLS('lvx_goal', { target: 30, by: '' });
  const goal = brandGoal > 0 ? brandGoal : lsGoal.target;
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<string>(String(goal));
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const toGo = Math.max(0, Math.round((goal - sov) * 10) / 10);
  const streak = streakOf(history);
  const best = history.length >= 3 && sov > 0 && sov >= Math.max(...history.map(h => h.sov));

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
    <section className="v3-card v3-hero-card v3-rise" aria-labelledby="v3-hero-t">
      <Rings rings={[
        { v: sov, of: goal, color: 'var(--v3-accent)', label: 'Visibility toward goal' },
        { v: accuracy == null ? null : Math.round(accuracy), of: 100, color: 'var(--v3-good-vivid)', label: 'Facts right' },
        { v: positive, of: 100, color: 'var(--v3-tone)', label: 'Positive tone' },
      ]} />
      <div className="v3-hero-copy">
        <div className="v3-hero-k" id="v3-hero-t">AI visibility</div>
        <div className="v3-hero-num">
          <b>{sov}<small>%</small></b>
          {!noAnswers && <Delta v={delta} first={first} />}
        </div>
        <p className="v3-hero-line">
          {noAnswers ? 'Your last scan returned no answers.' : <>AI names you in <strong>{answers}</strong> answers.</>}
        </p>

        <div className="v3-goalbar">
          <div className="v3-goalbar-top">
            {editing ? null : (
              <>
                <span>{toGo > 0 ? <><b>{pts(toGo)}</b> to your {goal}% goal</> : <b className="v3-good">Goal of {goal}% reached</b>}</span>
                <button type="button" className="v3-link-btn" onClick={() => { setDraft(String(goal)); setEditing(true); }}>Edit goal</button>
              </>
            )}
          </div>
          {editing ? (
            <form className="v3-goal-edit" onSubmit={e => { e.preventDefault(); save(); }}>
              <label htmlFor="v3-goal-in">Goal (%)</label>
              <input id="v3-goal-in" type="number" min={1} max={100} value={draft} onChange={e => setDraft(e.target.value)} autoFocus className="v3-input" />
              <button type="submit" className="v3-btn v3-btn-primary v3-btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              <button type="button" className="v3-btn v3-btn-secondary v3-btn-sm" onClick={() => { setEditing(false); setErr(null); }} disabled={saving}>Cancel</button>
              {err && <p className="v3-err">{err}</p>}
            </form>
          ) : (
            <div className="v3-bar" role="progressbar" aria-valuenow={Math.min(sov, goal)} aria-valuemin={0} aria-valuemax={goal} aria-label="Progress to goal">
              <i style={{ width: `${Math.min(100, (sov / Math.max(1, goal)) * 100)}%` }} />
            </div>
          )}
        </div>

        {(streak >= 2 || best || toGo === 0) && (
          <div className="v3-badges">
            {streak >= 2 && <span className="v3-badge streak"><V3Icon name="flame" size={15} />{streak} scans without a drop</span>}
            {best && <span className="v3-badge best"><V3Icon name="trophy" size={15} />Personal best</span>}
            {toGo === 0 && <span className="v3-badge goal"><V3Icon name="target" size={15} />Goal hit</span>}
          </div>
        )}
      </div>
      <div className="v3-ring-legend">
        <div><span><i style={{ background: 'var(--v3-accent)' }} />Visibility</span><b>{sov}%<small> of {goal}%</small></b></div>
        <div><span><i style={{ background: 'var(--v3-good-vivid)' }} />Facts right</span><b>{accuracy != null ? `${Math.round(accuracy)}%` : <small>Not checked</small>}</b></div>
        <div><span><i style={{ background: 'var(--v3-tone)' }} />Positive tone</span><b>{positive != null ? `${positive}%` : <small>No data</small>}</b></div>
      </div>
    </section>
  );
}

/* ─────────────────────────── fixes ─────────────────────────── */

function DoNext() {
  const { recs, loaded, available } = useOpenRecommendations();
  const top = recs.slice(0, 4);
  return (
    <section className="v3-card v3-fixes v3-rise" aria-labelledby="v3-next-t">
      <div className="v3-card-head">
        <div>
          <h2 id="v3-next-t" className="v3-card-title">Your next moves</h2>
          <p className="v3-card-sub">{available && recs.length > 0 ? 'Each fix is a reason for AI to name you.' : 'Fixes from your latest scan.'}</p>
        </div>
        {available && loaded && recs.length > 0 && <span className="v3-fixes-count" aria-label={`${recs.length} open`}>{recs.length}</span>}
      </div>
      {!available ? (
        <div className="v3-fixes-empty"><p>Fix suggestions come with the Starter plan and up.</p></div>
      ) : !loaded ? (
        <p className="v3-empty">Loading…</p>
      ) : top.length === 0 ? (
        <div className="v3-fixes-empty">
          <span className="v3-done-ico"><V3Icon name="check" size={24} /></span>
          <p><b>All clear.</b> New fixes show up after each scan.</p>
        </div>
      ) : (
        <ol className="v3-fix-list">
          {top.map(r => (
            <li key={r.id}>
              <Link href={`/dashboard/recommendations#rec-${r.id}`} className="v3-fix-row">
                <span className="v3-fix-check" aria-hidden="true" />
                <span className="v3-fix-txt">
                  <span className="v3-fix-title">{r.title}</span>
                  <span className={`v3-sev ${r.severity}`}><i />{r.severity.charAt(0).toUpperCase() + r.severity.slice(1)} impact</span>
                </span>
                <V3Icon name="chevron-right" size={16} />
              </Link>
            </li>
          ))}
        </ol>
      )}
      <Link href={available ? '/dashboard/recommendations' : '/dashboard/account'} className="v3-btn v3-btn-tinted v3-btn-block">
        {available ? (recs.length > top.length ? `See all ${recs.length} fixes` : 'Open fixes') : 'See plans'}
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
    if (!el) return;
    const measure = (w: number) => setW(Math.max(240, Math.round(w)));
    measure(el.clientWidth || 640);
    if (typeof ResizeObserver === 'undefined') return;
    let raf = 0;
    const ro = new ResizeObserver(([e]) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => measure(e.contentRect.width));
    });
    ro.observe(el);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  const cutoff = Date.now() - RANGE_DAYS[range] * 86400_000;
  const inRange = history.filter(h => h.t >= cutoff);
  const pts0 = inRange.length > 0 ? inRange : history.slice(-1);
  const H = 300, padL = 34, padR = 12, padT = 12, padB = 26;
  const maxY = Math.min(100, Math.max(20, Math.ceil((Math.max(goal, ...pts0.map(p => p.sov)) + 5) / 10) * 10));
  const t0 = pts0.length > 1 ? pts0[0].t : cutoff;
  const t1 = pts0.length > 1 ? pts0[pts0.length - 1].t : Date.now();
  const x = (t: number) => padL + (t1 === t0 ? (W - padL - padR) : ((t - t0) / (t1 - t0)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - v / maxY) * (H - padT - padB);
  const line = pts0.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.sov).toFixed(1)}`).join(' ');
  const area = pts0.length > 1 ? `${line} L${x(pts0[pts0.length - 1].t).toFixed(1)},${y(0)} L${x(pts0[0].t).toFixed(1)},${y(0)} Z` : '';
  const ticks = [0, maxY / 2, maxY];
  const fmtDay = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const [hover, setHover] = React.useState<number | null>(null);
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pts0.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    pts0.forEach((p, i) => { if (Math.abs(x(p.t) - px) < Math.abs(x(pts0[best].t) - px)) best = i; });
    setHover(best);
  };
  const hp = hover != null ? pts0[hover] : null;
  return (
    <section className="v3-card v3-chart-card v3-rise" aria-labelledby="v3-chart-t">
      <div className="v3-card-head">
        <div>
          <h2 id="v3-chart-t" className="v3-card-title">Share of voice over time</h2>
          <p className="v3-card-sub">Each point is one scan. Hover to see a scan.</p>
        </div>
        <div className="v3-seg" role="group" aria-label="Chart range">
          {(['7d', '21d', '90d'] as Range[]).map(r => (
            <button key={r} type="button" aria-pressed={range === r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>
              {r === '7d' ? '7 days' : r === '21d' ? '3 weeks' : '90 days'}
            </button>
          ))}
        </div>
      </div>
      {history.length === 0 ? (
        <p className="v3-empty">Your chart starts after the first scan.</p>
      ) : (
        <div ref={boxRef} style={{ position: 'relative' }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="v3-chart" role="img" aria-label={`Share of voice, ${plural(pts0.length, 'scan')}`}
            onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
            <defs>
              <linearGradient id="v3-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5B5BD6" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#5B5BD6" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map(t => (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--v3-line-soft)" />
                <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="v3-chart-tick">{Math.round(t)}</text>
              </g>
            ))}
            <line x1={padL} x2={W - padR} y1={y(goal)} y2={y(goal)} stroke="var(--v3-good-vivid)" strokeDasharray="4 5" strokeWidth={1.5} />
            <text x={W - padR} y={y(goal) - 6} textAnchor="end" className="v3-chart-tick" style={{ fill: 'var(--v3-good)' }}>Goal {goal}%</text>
            {area && <path d={area} fill="url(#v3-area)" />}
            {pts0.length > 1 && <path d={line} fill="none" stroke="var(--v3-accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"/>}
            {pts0.map((p, i) => <circle key={`${p.t}-${i}`} cx={x(p.t)} cy={y(p.sov)} r={pts0.length > 12 ? 0 : 3.5} fill="var(--v3-surface)" stroke="var(--v3-accent)" strokeWidth={2} />)}
            {hp && <>
              <line x1={x(hp.t)} x2={x(hp.t)} y1={padT} y2={y(0)} stroke="var(--v3-line-btn)" />
              <circle cx={x(hp.t)} cy={y(hp.sov)} r={5} fill="var(--v3-accent)" stroke="#fff" strokeWidth={2} />
            </>}
          </svg>
          {hp && <div className="v3-chart-hover" style={{ left: x(hp.t), top: y(hp.sov) - 10 }}><b>{hp.sov}%</b>{fmtDay(hp.t)}</div>}
          <div className="v3-chart-x">
            <span>{fmtDay(pts0[0].t)}</span>
            {inRange.length === 0 && <span>No scans in this range, showing the latest</span>}
            <span>{fmtDay(pts0[pts0.length - 1].t)}</span>
          </div>
        </div>
      )}
    </section>
  );
}

function RankLadder({ rows, firstScan }: { rows: { name: string; sov: number; d?: number; me?: boolean }[]; firstScan: boolean }) {
  const max = Math.max(1, ...rows.map(r => r.sov));
  const meIdx = rows.findIndex(r => r.me);
  const ahead = meIdx > 0 ? rows[meIdx - 1] : null;
  const gap = ahead ? Math.max(1, ahead.sov - rows[meIdx].sov) : 0;
  return (
    <section className="v3-card v3-rise" aria-labelledby="v3-rivals-t">
      <div className="v3-card-head" style={{ marginBottom: 10 }}>
        <div>
          <h2 id="v3-rivals-t" className="v3-card-title">Your rank</h2>
          <p className="v3-card-sub">Share of mentions against your rivals in the last scan.</p>
        </div>
        <Link href="/dashboard/competitors" className="v3-link">Rivals <V3Icon name="chevron-right" size={14} /></Link>
      </div>
      {rows.length === 0 ? (
        <p className="v3-empty">No rivals named yet. Add competitors in <Link href="/dashboard/setup" className="v3-link">Brand Setup</Link>.</p>
      ) : (
        <>
          {meIdx >= 0 && (
            <>
              <div className="v3-rank-big"><b>#{meIdx + 1}</b><span>of {rows.length}</span></div>
              <p className="v3-rank-next">
                {ahead ? <><strong>{pts(gap)}</strong> to pass {ahead.name}.</> : <strong className="v3-good">You lead your category.</strong>}
              </p>
            </>
          )}
          <ol className="v3-ladder">
            {rows.map((r, i) => (
              <li key={`${r.name}-${i}`} className={r.me ? 'me' : ''}>
                <span className="v3-ladder-n">{i + 1}</span>
                <span className="v3-ladder-body">
                  <span className="v3-ladder-name" title={r.name}>{r.me ? `${r.name} (you)` : r.name}</span>
                  <span className="v3-bar"><i style={{ width: `${(r.sov / max) * 100}%` }} /></span>
                </span>
                <span className="v3-ladder-v">
                  {r.sov}%
                  {!firstScan && typeof r.d === 'number' && r.d !== 0 && <Delta v={r.d} sm />}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

/* ─────────────────────────── questions + sites ─────────────────────────── */

function BuyerQuestions({ grid, engineNames }: { grid: { q: string; engines: Record<string, boolean | null> }[]; engineNames: string[] }) {
  const [mode, setMode] = React.useState<'win' | 'miss'>('miss');
  // Columns: only the engines this brand scans. A 2-engine plan should not
  // see three columns of "no answer" on every row.
  const inGrid = new Set(grid.flatMap(g => Object.keys(g.engines)));
  const cols = PLATFORMS.filter(p => engineNames.includes(p.name) || inGrid.has(p.name));
  const colNames = cols.length > 0 ? cols.map(p => p.name) : ENGINE_NAMES;
  const shownCols = cols.length > 0 ? cols : PLATFORMS;
  const rows = grid.map(g => {
    const answered = colNames.filter(e => g.engines[e] != null);
    const named = answered.filter(e => g.engines[e]).length;
    return { ...g, named, answered: answered.length, winning: answered.length > 0 && named * 2 >= answered.length };
  });
  const shown = rows.filter(r => (mode === 'win' ? r.winning : !r.winning))
    .sort((a, b) => (mode === 'win' ? b.named - a.named : a.named - b.named));
  const counts = { win: rows.filter(r => r.winning).length, miss: rows.filter(r => !r.winning).length };
  return (
    <section className="v3-card v3-flush v3-rise" aria-labelledby="v3-q-t">
      <div className="v3-card-head v3-pad">
        <div>
          <h2 id="v3-q-t" className="v3-card-title">Buyer questions</h2>
          <p className="v3-card-sub">Winning means at least half the engines named you.</p>
        </div>
        <div className="v3-seg" role="group" aria-label="Question filter">
          <button type="button" aria-pressed={mode === 'win'} className={mode === 'win' ? 'on' : ''} onClick={() => setMode('win')}>Winning {counts.win}</button>
          <button type="button" aria-pressed={mode === 'miss'} className={mode === 'miss' ? 'on' : ''} onClick={() => setMode('miss')}>Missing {counts.miss}</button>
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
                {shownCols.map(p => <th key={p.id} className="c" title={p.name}><abbr title={p.name}>{p.short}</abbr></th>)}
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
                  {shownCols.map(p => {
                    const v = r.engines[p.name];
                    const label = v == null ? 'no answer' : v ? 'named you' : 'did not name you';
                    return (
                      <td key={p.id} className="c">
                        <span className={'v3-edot ' + (v == null ? 'na' : v ? 'yes' : 'no')} title={`${p.name}: ${label}`} aria-hidden="true" />
                        <span className="v3-sr">{p.name}: {label}</span>
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
    <section className="v3-card v3-rise" aria-labelledby="v3-sites-t">
      <div className="v3-card-head">
        <div>
          <h2 id="v3-sites-t" className="v3-card-title">Sites AI trusts for your category</h2>
          <p className="v3-card-sub">The domains quoted most in your last scan.</p>
        </div>
        <Link href="/dashboard/citations" className="v3-link">All sources <V3Icon name="chevron-right" size={14} /></Link>
      </div>
      {rows.length === 0 ? (
        <p className="v3-empty">No cited sites in the last scan.</p>
      ) : (
        <ol className="v3-sites">
          {rows.map(s => {
            const own = !!ownHost && (s.d === ownHost || s.d.endsWith('.' + ownHost));
            return (
              <li key={s.d} className={own ? 'own' : ''}>
                <span className={'v3-fav' + (own ? ' own' : '')} aria-hidden="true">{s.d.charAt(0)}</span>
                <span className="v3-sites-body">
                  <span className="v3-sites-top">
                    <span className="v3-sites-dwrap">
                      <span className="v3-sites-d" title={s.d}>{s.d}</span>
                      {own && <span className="v3-pill accent">You</span>}
                    </span>
                    <span className="v3-sites-count">{s.n} cite{s.n === 1 ? '' : 's'}</span>
                  </span>
                  <span className="v3-bar"><i style={{ width: `${(s.n / max) * 100}%` }} /></span>
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

function Header({ date, children, sub, actions }: { date: string; children: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="v3-ov-head">
      <div className="v3-ov-head-copy">
        <p className="v3-ov-date">{date}</p>
        <h1 className="v3-large-title">{children}</h1>
        {sub && <p className="v3-ov-lede">{sub}</p>}
      </div>
      {actions && <div className="v3-ov-actions">{actions}</div>}
    </header>
  );
}

function greeting(name?: string | null) {
  const h = new Date().getHours();
  const part = h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const first = String(name || '').trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

export default function OverviewV3() {
  const { data, loading, error, retry } = useOverviewData(FILTERS);
  const { selectedBrand, selectedBrandLocked, refreshBrands, plan } = useBrands();
  // The engines this brand actually scans: its own selection, else the plan default.
  const brandPlatforms = (selectedBrand as Record<string, unknown> | null)?.platforms;
  const engineNames: string[] = Array.isArray(brandPlatforms) && brandPlatforms.length > 0
    ? (brandPlatforms as string[]).filter(p => ENGINE_NAMES.includes(p))
    : getPlanPlatforms(plan);
  const engineList = listNames(engineNames.length > 0 ? engineNames : ENGINE_NAMES);
  const { live, startRun, pct } = useRun();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [lsGoal] = useLS('lvx_goal', { target: 30, by: '' });
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const { user } = useAuth();
  const hello = greeting(user?.name);

  const download = async () => {
    setBusy(true);
    try { await downloadBrandReport(selectedBrand?.id, selectedBrand?.name, toast); } finally { setBusy(false); }
  };

  if (loading) {
    return (
      <div className="v3-page" aria-busy="true">
        <Header date={today}>{hello}</Header>
        <div className="v3-skel-grid"><div className="v3-skel" /><div className="v3-skel" /></div>
        <div className="v3-skel" style={{ height: 150 }} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="v3-page">
        <Header date={today}>We could not load your data</Header>
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
        <Header date={today} sub="Add your brand to see how often AI names you.">{hello}</Header>
        <div className="v3-card v3-empty-card">
          <p>We ask {engineList} about your category and show how often they name you.</p>
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
        <Header date={today} sub={`We will ask ${engineList} your ${plural(d.promptCount, 'tracked question')} and show where ${d.brandName} shows up.`}>
          Run your first scan for {d.brandName}
        </Header>
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

  const hasPrev = d.hasPrev ?? d.runCount >= 2;
  const noAnswers = d.answersOk === 0;
  const trendLine = noAnswers
    ? 'Your last scan returned no answers. Check Platform Status and run it again.'
    : !hasPrev
    ? 'This is your first scan, so there is nothing to compare yet.'
    : d.sovDelta > 0 ? `Up ${pts(d.sovDelta)} since your last scan.`
    : d.sovDelta < 0 ? `Down ${pts(Math.abs(d.sovDelta))} since your last scan.`
    : 'Same as your last scan.';
  const weakLine = weakest && weakId ? ` ${weakest.name} is your weakest engine at ${weakest.sov}%.` : '';

  const meIdx = d.competitors.findIndex(c => c.me);
  const rank = meIdx >= 0 && d.competitors.length > 1 ? `#${meIdx + 1} of ${d.competitors.length}` : null;
  const goal = Number((selectedBrand as Record<string, unknown> | null)?.goal) || 0;
  const chartGoal = goal > 0 ? goal : Number(lsGoal.target) || 30;

  return (
    <div className="v3-page">
      <Header
        date={today}
        sub={<>{trendLine}{weakLine}</>}
        actions={<>
          <button type="button" className="v3-btn v3-btn-secondary" onClick={download} disabled={busy}>
            <V3Icon name="download" size={16} />{busy ? 'Preparing…' : 'Report'}
          </button>
          <Link href="/dashboard/recommendations" className="v3-btn v3-btn-primary">See what to fix</Link>
        </>}
      >
        {hello}
      </Header>

      {live.running && <p className="v3-note"><span className="v3-dot live" /> A scan is running. These numbers update as results come in.</p>}

      <div className="v3-row v3-row-2">
        <HeroCard
          sov={d.sov}
          delta={d.sovDelta}
          first={!hasPrev}
          noAnswers={noAnswers}
          answers={`${d.mentionsOk ?? d.totalM} of ${d.answersOk ?? d.totalQ}`}
          accuracy={d.accuracyRate}
          positive={d.positivePct ?? null}
          history={d.history || []}
          brandId={selectedBrand?.id}
          brandGoal={goal}
          onSaved={refreshBrands}
        />
        <DoNext />
      </div>

      <section aria-labelledby="v3-eng-t" className="v3-block">
        <div className="v3-block-head">
          <h2 id="v3-eng-t" className="v3-h2">By AI engine</h2>
          <Link href="/dashboard/platforms" className="v3-link">Engine details <V3Icon name="chevron-right" size={14} /></Link>
        </div>
        <div className="v3-engines">
          {d.platforms.map(p => {
            const weak = p.id === weakId;
            const color = ENGINE_COLOR[p.id] || 'var(--v3-ink)';
            return (
              <Link key={p.id} href="/dashboard/platforms" prefetch={false} className={'v3-engine v3-rise' + (weak ? ' weak' : '') + (p.noData ? ' nodata' : '')}>
                <div className="v3-engine-top">
                  <span className="v3-engine-name"><span className="v3-engine-logo" style={{ background: color }}>{p.name.charAt(0)}</span>{p.name}</span>
                  {weak && <span className="v3-pill warn">Weak spot</span>}
                </div>
                {p.noData ? (
                  <div className="v3-engine-v v3-dim">Not scanned</div>
                ) : (
                  <>
                    <div className="v3-engine-v">{p.sov}<small>%</small></div>
                    <div className="v3-engine-foot">
                      <Delta v={p.delta} first={!hasPrev} sm />
                      <Spark data={(p as { spark?: number[] }).spark || []} color={weak ? 'var(--v3-warn-vivid)' : color} />
                    </div>
                  </>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      <div className="v3-row v3-row-2">
        <SovChart history={d.history || []} goal={chartGoal} />
        <RankLadder rows={d.competitors} firstScan={!hasPrev} />
      </div>

      <div className="v3-row v3-row-2">
        <BuyerQuestions grid={d.grid || []} engineNames={engineNames} />
        <TrustedSites sources={d.sources} ownHost={hostOf(d.website)} />
      </div>
    </div>
  );
}
