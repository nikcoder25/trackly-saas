'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// Shared dashboard primitives, charts and the comprehension (glossary/tooltip) layer.
// Ported from the Dashboard.html design bundle (dash-components / dash-charts / dash-learn).

import * as React from 'react';

/* ───────────────────────────── Platforms ───────────────────────────── */

export interface Platform {
  id: string;
  name: string;
  short: string;
  sov: number;
  delta: number;
  ok: boolean;
  ms: number;
}

export const PLATFORMS: Platform[] = [
  { id: 'chatgpt',    name: 'ChatGPT',    short: 'GPT', sov: 42, delta: +6,  ok: true,  ms: 1840 },
  { id: 'claude',     name: 'Claude',     short: 'CLA', sov: 31, delta: +12, ok: true,  ms: 2120 },
  { id: 'gemini',     name: 'Gemini',     short: 'GEM', sov: 18, delta: -3,  ok: true,  ms: 1560 },
  { id: 'perplexity', name: 'Perplexity', short: 'PRP', sov: 24, delta: +4,  ok: true,  ms: 3200 },
  { id: 'grok',       name: 'Grok',       short: 'GRK', sov: 12, delta: -1,  ok: false, ms: 0 },
];

export function PlatformTile({ p, size = 26 }: { p: Platform; size?: number }) {
  return (
    <span className={'ptile ptile-' + p.id + ' mono'} style={{ width: size, height: size, fontSize: Math.max(9, size * 0.34), borderRadius: Math.max(4, size * 0.22) }}>
      {p.short}
    </span>
  );
}

export function Logo({ size = 14 }: { size?: number }) {
  return (
    <span className="lv-logo" style={{ fontSize: size, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className="lv-mark" aria-hidden="true" style={{
        width: size + 8, height: size + 8,
        background: 'linear-gradient(135deg, var(--primary), var(--primary-600))',
        borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', boxShadow: 'var(--shadow-1)',
      }}>
        <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
          <path d="M2 9 L4.5 9 L6 4 L8 11 L9.5 7 L12 7" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="lv-word" style={{ fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text)' }}>livesov</span>
    </span>
  );
}

/* ───────────────────────────── Primitives ───────────────────────────── */

export function Badge({ tone = 'neu', children, ...rest }: { tone?: string; children?: React.ReactNode; [k: string]: any }) {
  return <span className={'badge badge-' + tone} {...rest}>{children}</span>;
}

export function Delta({ v, suffix = '' }: { v?: number | null; suffix?: string }) {
  if (v == null) return null;
  const up = v >= 0;
  return (
    <span className={'delta mono ' + (up ? 'up' : 'down')}>
      {up ? '▲' : '▼'} {Math.abs(v)}{suffix}
    </span>
  );
}

export function KPI({ k, v, d, suffix = '', danger = false, info, term }: {
  k: React.ReactNode; v: React.ReactNode; d?: number | null; suffix?: string; danger?: boolean; info?: string; term?: string;
}) {
  return (
    <div className="kpi">
      <div className="kpi-k mono">{k}{term && <Info term={term} />}</div>
      <div className={'kpi-v mono ' + (danger ? 'neg' : '')}>{v}{suffix && <i>{suffix}</i>}</div>
      {(d != null || info) && <div className="kpi-d">{d != null && <Delta v={d} />}{info && <span className="kpi-info mono">{info}</span>}</div>}
    </div>
  );
}

export function KPIRail({ items }: { items: any[] }) {
  return (
    <div className="kpi-rail" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map((it, i) => <KPI key={i} {...it} />)}
    </div>
  );
}

export function Bar({ value, max = 100, color }: { value: number; max?: number; color?: string; sub?: any }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <span className="bar">
      <i style={{ width: pct + '%', background: color || 'var(--accent)' }} />
    </span>
  );
}

export function Card({ title, right, padding = true, children, foot, style, lede, info }: {
  title?: React.ReactNode; right?: React.ReactNode; padding?: boolean; children?: React.ReactNode;
  foot?: React.ReactNode; style?: React.CSSProperties; lede?: React.ReactNode; info?: string;
}) {
  return (
    <section className="card" style={style}>
      {(title || right) && (
        <header className={'card-h' + (lede ? ' has-lede' : '')}>
          <span className="card-tw" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="card-t">{title}{info && <Info term={info} />}</span>
            {lede && <span className="card-lede">{lede}</span>}
          </span>
          <span className="card-r">{right}</span>
        </header>
      )}
      <div className={'card-b' + (padding ? '' : ' no-pad')}>{children}</div>
      {foot && <footer className="card-f">{foot}</footer>}
    </section>
  );
}

export function PageHead({ title, sub, actions }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-t">{title}</h1>
        {sub && <p className="page-s">{sub}</p>}
      </div>
      {actions && <div className="page-a">{actions}</div>}
    </div>
  );
}

export function Filter({ children }: { children?: React.ReactNode }) {
  return <div className="filter">{children}</div>;
}

type SegOpt = string | { value: string; label: string };
export function Seg({ value, onChange, options }: { value: string; onChange?: (v: string) => void; options: SegOpt[] }) {
  return (
    <div className="seg mono" role="tablist">
      {options.map(o => {
        const val = typeof o === 'object' ? o.value : o;
        const label = typeof o === 'object' ? o.label : o;
        return (
          <button key={val} className={'seg-i ' + (val === value ? 'on' : '')} onClick={() => onChange?.(val)}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Pill({ children, tone = 'neu', mono = true }: { children?: React.ReactNode; tone?: string; mono?: boolean }) {
  return <span className={'pill pill-' + tone + (mono ? ' mono' : '')}>{children}</span>;
}

/* ───────────────────────────── Charts ───────────────────────────── */

export function Spark({ data, width = 100, height = 28, color, strokeWidth = 1.5, fill = false }: {
  data: number[]; width?: number; height?: number; color?: string; strokeWidth?: number; fill?: boolean;
}) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => [i * stepX, height - ((v - min) / range) * (height - 4) - 2]);
  const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const c = color || 'var(--accent)';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      {fill && <path d={d + ` L ${width} ${height} L 0 ${height} Z`} fill={c} fillOpacity="0.12" />}
      <path d={d} stroke={c} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface LineSeries { id: string; label: string; color: string; data: number[]; bold?: boolean; fill?: boolean; dashed?: boolean; dots?: boolean; cur?: number; suffix?: string; }
export function LineChart({ series, height = 260, yTicks = 6, xLabels, valSuffix = '%' }: {
  series: LineSeries[]; height?: number; yTicks?: number; xLabels?: string[]; valSuffix?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [w, setW] = React.useState(720);
  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const padL = 36, padR = 12, padT = 14, padB = 24;
  const innerW = w - padL - padR, innerH = height - padT - padB;
  const all = series.flatMap(s => s.data);
  const yMin = 0;
  const yMax = Math.ceil(Math.max(...all, 1) / 10) * 10;
  const n = series[0]?.data.length || 1;
  const stepX = innerW / Math.max(1, n - 1);
  const yToPx = (v: number) => padT + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;
  const xToPx = (i: number) => padL + i * stepX;

  return (
    <div ref={ref} className="lchart">
      <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`lg-${i}-${s.id}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={s.fill ? 0.35 : 0} />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const v = yMin + (yMax - yMin) * (i / yTicks);
          const y = yToPx(v);
          return (
            <g key={i}>
              <line x1={padL} x2={w - padR} y1={y} y2={y} stroke="var(--line)" strokeWidth="1" />
              <text x={padL - 6} y={y + 3} fontSize="9.5" fontFamily="var(--mono)" fill="var(--mute)" textAnchor="end">{Math.round(yMax - (yMax - yMin) * (i / yTicks))}{valSuffix}</text>
            </g>
          );
        })}
        {xLabels && xLabels.map((l, i) => (
          <text key={i} x={xToPx(i)} y={height - 6} fontSize="9.5" fontFamily="var(--mono)" fill="var(--mute)" textAnchor="middle">{l}</text>
        ))}
        {series.map((s, si) => {
          const pts = s.data.map((v, i) => [xToPx(i), yToPx(v)]);
          const dLine = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
          const dArea = dLine + ` L ${xToPx(n - 1)} ${yToPx(yMin)} L ${padL} ${yToPx(yMin)} Z`;
          return (
            <g key={si}>
              {s.fill && <path d={dArea} fill={`url(#lg-${si}-${s.id})`} />}
              <path d={dLine} stroke={s.color} strokeWidth={s.bold ? 2.4 : 1.6} fill="none" strokeLinejoin="round" strokeDasharray={s.dashed ? '4 4' : undefined} />
              {s.dots && pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2" fill={s.color} />)}
            </g>
          );
        })}
      </svg>
      <div className="lchart-leg mono">
        {series.map(s => (
          <span key={s.id}><i style={{ background: s.color }} /> {s.label} <b>{s.suffix || ''}{s.cur != null ? s.cur : ''}{valSuffix}</b></span>
        ))}
      </div>
    </div>
  );
}

export function Donut({ value, max = 100, size = 120, label, sub, color }: {
  value: number; max?: number; size?: number; label?: string; sub?: string; color?: string;
}) {
  const c = color || 'var(--accent)';
  const r = size / 2 - 8;
  const cir = 2 * Math.PI * r;
  const pct = Math.min(1, value / max);
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-3)" strokeWidth="6" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={c} strokeWidth="6" fill="none"
          strokeDasharray={`${cir * pct} ${cir}`} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray 1s cubic-bezier(.2,.7,.2,1)' }} />
      </svg>
      <div className="donut-c">
        <div className="donut-v mono">{Math.round(value)}<i>%</i></div>
        {label && <div className="donut-l mono">{label}</div>}
      </div>
      {sub && <div className="donut-sub mono">{sub}</div>}
    </div>
  );
}

export function Heatmap({ rows, cols, data, label }: { rows: string[]; cols: string[]; data: number[][]; label?: string }) {
  return (
    <div className="heat">
      <div className="heat-grid" style={{ gridTemplateColumns: `60px repeat(${cols.length}, 1fr)` }}>
        <div></div>
        {cols.map((c, i) => <div key={i} className="heat-x mono">{c}</div>)}
        {rows.map((r, ri) => (
          <React.Fragment key={ri}>
            <div className="heat-y mono">{r}</div>
            {cols.map((_, ci) => {
              const v = data[ri][ci];
              const op = 0.1 + v * 0.9;
              return <div key={ci} className="heat-cell" style={{ background: `color-mix(in oklch, var(--accent) ${Math.round(op * 100)}%, transparent)` }} title={`${r} · ${cols[ci]} · ${Math.round(v * 100)}%`} />;
            })}
          </React.Fragment>
        ))}
      </div>
      {label && <div className="heat-l mono">{label}</div>}
    </div>
  );
}

export function StackBar({ items, height = 14 }: { items: { label: string; value: number; color?: string }[]; height?: number }) {
  const total = items.reduce((a, b) => a + b.value, 0);
  return (
    <div className="stack" style={{ height }}>
      {items.map((it, i) => (
        <span key={i} style={{ width: `${(it.value / total) * 100}%`, background: it.color || 'var(--accent)' }} title={`${it.label}: ${it.value}`} />
      ))}
    </div>
  );
}

export function Cit({ url }: { url: string }) {
  return <a className="cit mono" href="#" onClick={e => e.preventDefault()}>{url}</a>;
}

/* ───────────────────────────── Glossary + tooltips ───────────────────────────── */

export const GLOSSARY: Record<string, { term: string; short: string; why?: string }> = {
  sov: { term: 'Share of Voice (SOV)', short: 'Of every time an AI named a brand in your category, the share that was you.', why: 'Think “market share, but inside AI answers.” Higher means the AIs recommend you more than rivals.' },
  geo: { term: 'GEO', short: 'Generative Engine Optimization — getting your brand to show up well in AI answers.', why: 'Like SEO, but the audience is ChatGPT, Claude, Gemini & co. instead of Google.' },
  mention: { term: 'Mention', short: 'One instance of an AI engine naming your brand inside an answer.', why: 'More mentions across more questions = more chances a buyer hears about you from the AI.' },
  engine: { term: 'AI engine', short: 'An AI assistant we ask on your behalf — ChatGPT, Claude, Gemini, Perplexity, Grok.', why: 'We run your tracked questions through each one so you see where you win and where you don’t.' },
  hallucination: { term: 'Hallucination', short: 'When an AI states something false about you — a wrong price, a made-up feature.', why: 'These mislead buyers. Catch them fast and submit a correction to set the record straight.' },
  citation: { term: 'Citation', short: 'A web page an AI pulled from to write its answer about you.', why: 'These are the pages AI “trusts.” Strengthen the ones that help and fix the ones that don’t.' },
  position: { term: 'Position', short: 'Where your brand ranked in the answer’s list — 1st, 2nd, 3rd…', why: 'Lower number = more prominent. Being named 1st gets far more attention than 5th.' },
  sentiment: { term: 'Sentiment', short: 'How positive or negative the AI sounded about you, from −1 to +1.', why: 'Being mentioned is good; being mentioned warmly is better. Watch for dips.' },
  health: { term: 'Brand Health', short: 'One 0–100 score blending visibility, sentiment, accuracy and competitiveness.', why: 'Your single “how am I doing in AI” number. Watch it climb week over week.' },
  prompt: { term: 'Tracked prompt', short: 'A real buyer question we ask the engines on a schedule to see if you come up.', why: 'These are the questions your customers actually type. Track the ones that matter to you.' },
  coverage: { term: 'Query coverage', short: 'The share of your tracked questions where you got mentioned at all.', why: 'Low coverage means whole topics where AI never brings you up — opportunity to win.' },
  pp: { term: 'Percentage points (pp)', short: 'The plain difference between two percentages (22% → 27% is +5 pp).', why: 'Used so “up 5 points” isn’t confused with “up 5 percent of the old number.”' },
  intent: { term: 'Intent', short: 'What the asker is trying to do — compare, get a price, find a feature, get a pick.', why: 'Winning “comparison” questions matters more when buyers are close to choosing.' },
  audit: { term: 'GEO Audit', short: 'An on-demand snapshot of how you perform across all engines right now.', why: 'Great for a board deck or a weekly stand-up — one run, one shareable result.' },
};

function useTip() {
  const [tip, setTip] = React.useState<{ x: number; y: number; below: boolean } | null>(null);
  const show = (e: React.SyntheticEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let x = r.left + r.width / 2;
    x = Math.max(160, Math.min(window.innerWidth - 160, x));
    const below = r.bottom + 320 < window.innerHeight || r.top < 340;
    setTip({ x, y: below ? r.bottom + 9 : r.top - 9, below });
  };
  const hide = () => setTip(null);
  return { tip, show, hide };
}

function TipCard({ tip, g, body }: { tip: any; g?: any; body?: React.ReactNode }) {
  if (!tip) return null;
  return (
    <span className={'lv-tip ' + (tip.below ? 'below' : 'above')} style={{ left: tip.x, top: tip.y }}>
      {g && <b className="lv-tip-t">{g.term}</b>}
      <span className="lv-tip-s">{body || g?.short}</span>
      {g?.why && <em className="lv-tip-w">{g.why}</em>}
    </span>
  );
}

export function Info({ term, children, size = 13 }: { term?: string | null; children?: React.ReactNode; size?: number }) {
  const g = term ? GLOSSARY[term] : undefined;
  const { tip, show, hide } = useTip();
  return (
    <span className="lv-info" tabIndex={0} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
      aria-label={g ? g.term : 'More info'}>
      <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="5.6" stroke="currentColor" strokeWidth="1.2" />
        <path d="M7 6.2v3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="7" cy="4.3" r="0.75" fill="currentColor" />
      </svg>
      <TipCard tip={tip} g={g} body={children} />
    </span>
  );
}

export function Term({ term, children }: { term?: string; children?: React.ReactNode }) {
  const g = term ? GLOSSARY[term] : undefined;
  const { tip, show, hide } = useTip();
  return (
    <span className="lv-term" tabIndex={0} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children || g?.term}
      <TipCard tip={tip} g={g} />
    </span>
  );
}

/* ───────────────────────────── small helpers ───────────────────────────── */

export function useLS<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = React.useState<T>(initial);
  // Read after mount to stay hydration-safe.
  React.useEffect(() => {
    try { const s = localStorage.getItem(key); if (s != null) setV(JSON.parse(s)); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = React.useCallback((nv: T | ((p: T) => T)) => {
    setV(prev => {
      const val = typeof nv === 'function' ? (nv as (p: T) => T)(prev) : nv;
      try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* ignore */ }
      return val;
    });
  }, [key]);
  return [v, set];
}

export const todayStr = () => new Date().toISOString().slice(0, 10);
export const dayDiff = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

export function lvCelebrate(opts: { x?: number; y?: number; count?: number } = {}) {
  if (typeof document === 'undefined') return;
  const colors = ['#5B5BD6', '#059669', '#D97706', '#0284C7', '#E11D48'];
  const cv = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  const W = window.innerWidth, H = window.innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999;';
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d'); if (!ctx) { cv.remove(); return; }
  ctx.scale(dpr, dpr);
  const cx = opts.x ?? W / 2, cy = opts.y ?? H * 0.32, N = opts.count ?? 90;
  const parts = Array.from({ length: N }).map(() => {
    const a = Math.random() * Math.PI * 2, sp = 5 + Math.random() * 11;
    return { x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 5, g: 0.28 + Math.random() * 0.2, s: 5 + Math.random() * 6, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, c: colors[(Math.random() * colors.length) | 0] };
  });
  const t0 = performance.now();
  (function frame(t: number) {
    const el = t - t0; ctx.clearRect(0, 0, W, H);
    parts.forEach(p => {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, 1 - el / 1600); ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); ctx.restore();
    });
    if (el < 1600) requestAnimationFrame(frame); else cv.remove();
  })(t0);
}
