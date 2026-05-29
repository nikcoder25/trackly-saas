'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// Overview — the main landing dashboard. Headline numbers, the per-engine grid,
// competitor SOV and cited sources are wired to the signed-in user's real brand
// data (fetched client-side); the design's sample values are used as a clearly
// temporary fallback where the app does not yet compute a figure.

import * as React from 'react';
import {
  PLATFORMS, type Platform, PlatformTile, Card, Badge, Delta, Bar, Pill, Spark,
  LineChart, type LineSeries, Filter, Seg, KPIRail, PageHead, Info, Cit,
} from '../ui';
import { GoalCard } from '../shell';

/* ───────────────────────── real-data hook ───────────────────────── */

interface OverviewData {
  hasReal: boolean;
  brandName: string;
  industry?: string;
  city?: string;
  sov: number;
  totalM: number;
  totalQ: number;
  health: number;
  sentiment: number;
  platforms: Platform[];
  competitors: { name: string; sov: number; d: number; me?: boolean; color: string }[];
  sources: { d: string; n: number; share: number }[];
  trend: number[];
}

const COMP_COLORS = ['var(--accent)', 'var(--text-2)', 'var(--mute)', 'var(--mute-2)', 'var(--info)', 'var(--warn)', '#a78bfa', '#f472b6'];

function normPlatform(pd: any): { sov: number; total: number; mentions: number; errors: number } {
  if (typeof pd === 'number') return { sov: pd, total: pd > 0 ? 1 : 0, mentions: pd > 0 ? 1 : 0, errors: 0 };
  if (pd && typeof pd === 'object') return { sov: pd.sov || 0, total: pd.total || pd.queries || 0, mentions: pd.mentions || 0, errors: pd.errors || 0 };
  return { sov: 0, total: 0, mentions: 0, errors: 0 };
}

export function useOverviewData(): OverviewData | null {
  const [data, setData] = React.useState<OverviewData | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/brands', { credentials: 'include' });
        if (!res.ok) { if (!cancelled) setData(buildFallback()); return; }
        const json = await res.json();
        const brands: any[] = json.brands || json || [];
        let selId: string | null = null;
        try { selId = localStorage.getItem('livesov_brand'); } catch { /* ignore */ }
        const brand = brands.find(b => b.id === selId) || brands[0];
        if (!brand) { if (!cancelled) setData(buildFallback()); return; }
        if (!cancelled) setData(buildFromBrand(brand));
      } catch {
        if (!cancelled) setData(buildFallback());
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return data;
}

function buildFallback(): OverviewData {
  return {
    hasReal: false,
    brandName: 'Acme PM',
    industry: 'Project management software', city: 'San Francisco',
    sov: 27.4, totalM: 1284, totalQ: 142, health: 78, sentiment: 74,
    platforms: PLATFORMS,
    competitors: [
      { name: 'Acme', sov: 27.4, d: +4.2, me: true, color: 'var(--accent)' },
      { name: 'Linear', sov: 22.1, d: -1.4, color: 'var(--text-2)' },
      { name: 'Asana', sov: 14.8, d: +0.6, color: 'var(--mute)' },
      { name: 'Monday', sov: 9.3, d: -2.1, color: 'var(--mute-2)' },
      { name: 'Notion', sov: 6.1, d: +1.1, color: 'var(--info)' },
      { name: 'Jira', sov: 5.4, d: -0.7, color: 'var(--warn)' },
    ],
    sources: [
      { d: 'acme.com/customers', n: 214, share: 18 },
      { d: 'acme.com/pricing', n: 182, share: 16 },
      { d: 'g2.com/products/acme', n: 96, share: 9 },
      { d: 'reddit.com/r/projectmanagement', n: 71, share: 6 },
      { d: 'acme.com/blog/agile', n: 54, share: 5 },
      { d: 'producthunt.com/products/acme', n: 41, share: 4 },
    ],
    trend: [18, 19, 20, 22, 20, 22, 24, 23, 25, 24, 26, 27, 27, 27.4],
  };
}

function buildFromBrand(brand: any): OverviewData {
  const fb = buildFallback();
  const runs: any[] = Array.isArray(brand.runs) ? brand.runs : [];
  const sorted = [...runs].sort((a, b) => new Date(a.time || a.date || 0).getTime() - new Date(b.time || b.date || 0).getTime());
  const lastRun = sorted[sorted.length - 1] || null;
  const prevRun = sorted.length >= 2 ? sorted[sorted.length - 2] : null;
  if (!lastRun) {
    return { ...fb, hasReal: true, brandName: brand.name || fb.brandName, industry: brand.industry, city: brand.city };
  }
  const sov = Math.round(Number(lastRun.sov) || 0);
  const totalM = Number(lastRun.totalM) || 0;
  const totalQ = Number(lastRun.totalQ) || (brand.queries?.length ?? 0);
  const prevSov = prevRun ? Math.round(Number(prevRun.sov) || 0) : sov;

  // sentiment from per-result data, fallback to mock
  const results: any[] = Array.isArray(lastRun.allResults) ? lastRun.allResults : [];
  const pos = results.filter(r => r.sentiment === 'positive').length;
  const neu = results.filter(r => r.sentiment === 'neutral').length;
  const neg = results.filter(r => r.sentiment === 'negative').length;
  const sentTotal = pos + neu + neg;
  const sentiment = sentTotal > 0 ? Math.round((pos * 100 + neu * 50) / sentTotal) : fb.sentiment;

  // health blend (visibility + sentiment)
  const mRate = totalQ > 0 ? totalM / totalQ : 0;
  const health = sentTotalSafe(sentTotal) ? Math.round(Math.min(100, mRate * 55 + (sentiment / 100) * 45)) : fb.health;

  // platforms: override design tiles with real SOV/mentions where present
  const rawPlatforms = lastRun.platforms || {};
  const platforms: Platform[] = PLATFORMS.map(p => {
    const key = Object.keys(rawPlatforms).find(k => k.toLowerCase() === p.name.toLowerCase());
    if (!key) return p;
    const n = normPlatform(rawPlatforms[key]);
    return { ...p, sov: Math.round(n.sov), ok: n.errors === 0, ms: p.ms };
  });

  // competitors
  const compRaw: Record<string, number> = lastRun.competitors || {};
  let competitors = fb.competitors;
  const compEntries = Object.entries(compRaw).sort((a, b) => b[1] - a[1]).slice(0, 7);
  if (compEntries.length > 0) {
    const total = compEntries.reduce((s, [, c]) => s + c, 0) + Math.max(1, totalM);
    competitors = [
      { name: brand.name || 'You', sov, d: sov - prevSov, me: true, color: 'var(--accent)' },
      ...compEntries.map(([name, c], i) => ({ name, sov: Math.round((c / total) * 100), d: 0, color: COMP_COLORS[(i + 1) % COMP_COLORS.length] })),
    ].sort((a, b) => b.sov - a.sov);
  }

  // sources / citations
  const citeRaw: Record<string, number> = lastRun.citations || {};
  let sources = fb.sources;
  const citeEntries = Object.entries(citeRaw).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (citeEntries.length > 0) {
    const total = citeEntries.reduce((s, [, c]) => s + c, 0) || 1;
    sources = citeEntries.map(([d, n]) => ({ d, n, share: Math.round((n / total) * 100) }));
  }

  // trend
  const trend = sorted.slice(-14).map(r => Math.round(Number(r.sov) || 0));
  return {
    hasReal: true,
    brandName: brand.name || fb.brandName,
    industry: brand.industry, city: brand.city,
    sov, totalM, totalQ, health, sentiment,
    platforms, competitors, sources,
    trend: trend.length >= 2 ? trend : fb.trend,
  };
}
function sentTotalSafe(n: number) { return n > 0; }

/* ───────────────────────── page ───────────────────────── */

export function PageOverview() {
  const [range, setRange] = React.useState('7d');
  const [drawer, setDrawer] = React.useState<any>(null);
  const data = useOverviewData();
  const d = data || buildFallback();

  const sovSeries: LineSeries[] = [
    { id: 'acme', label: d.competitors[0]?.name || 'You', color: 'var(--primary)', bold: true, fill: true, cur: d.sov, data: d.trend },
    { id: 'linear', label: 'Linear', color: 'var(--info)', dashed: true, cur: 22.1, data: [26, 25, 25, 24, 24, 23, 22, 23, 22, 22, 22, 22, 22, 22.1] },
    { id: 'asana', label: 'Asana', color: 'var(--mute)', dashed: true, cur: 14.8, data: [20, 19, 18, 17, 17, 16, 16, 15, 15, 15, 15, 15, 14, 14.8] },
    { id: 'monday', label: 'Monday', color: 'var(--mute-2)', dashed: true, cur: 9.3, data: [12, 12, 11, 11, 11, 10, 10, 10, 9, 9, 9, 9, 9, 9.3] },
  ];
  const xLabels = ['', 'M', '', 'W', '', 'F', '', 'S', '', 'T', '', 'T', '', 'today'];
  const fmt = (n: number) => n.toLocaleString();

  return (
    <>
      <PageHead title={<>Welcome back, <span style={{ color: 'var(--primary)' }}>Nikhil</span>.</>}
        sub={<>{d.brandName} is mentioned across the 5 AI engines — here&rsquo;s what changed in the last 7 days.</>}
        actions={<>
          <button className="btn-g">+ Compare brand</button>
          <button className="btn-p">↗ View live</button>
        </>} />

      <div className="page-body">
        <HealthBanner health={d.health} sentiment={d.sentiment} sov={d.sov} totalQ={d.totalQ} />
        <GoalCard current={d.sov} />
        <InsightsStrip />

        <Filter>
          <Seg value={range} onChange={setRange} options={['24h', '7d', '30d', '90d']} />
          <select className="sel"><option>All engines</option><option>ChatGPT</option><option>Claude</option><option>Gemini</option><option>Perplexity</option><option>Grok</option></select>
          <select className="sel"><option>All intents</option><option>Comparison</option><option>Recommendation</option><option>Pricing</option><option>Feature</option></select>
          <select className="sel"><option>vs Top 3 competitors</option><option>vs All competitors</option></select>
          <span style={{ flex: 1 }} />
          <Pill tone="acc"><span className="pulse" /> Auto-runs on · hourly</Pill>
        </Filter>

        <KPIRail items={[
          { k: 'SHARE OF VOICE', term: 'sov', v: String(d.sov), suffix: '%', d: +4.2, info: 'vs prev. 7d' },
          { k: 'MENTIONS', term: 'mention', v: fmt(d.totalM), d: +218, info: '5 engines' },
          { k: 'SENTIMENT', term: 'sentiment', v: String(d.sentiment), suffix: '%', d: +3.1, info: '+0.62 score' },
          { k: 'FALSE CLAIMS', term: 'hallucination', v: '6', d: -2, info: '3 fixed' },
          { k: 'COVERAGE', term: 'coverage', v: String(d.totalQ), d: +14, info: 'prompts' },
        ]} />

        <div className="g2">
          <Card title="Share of Voice — 14 days" info="sov"
            lede="How your slice of AI answers stacks up against rivals, day by day. Up = AI is recommending you more."
            right={<Pill>5 engines · 4 brands</Pill>} style={{ gridColumn: 'span 2' }}>
            <LineChart series={sovSeries} xLabels={xLabels} height={280} />
          </Card>
        </div>

        <OverviewEngineGrid platforms={d.platforms} />

        <div className="g2">
          <OverviewRecentMentions onOpen={setDrawer} total={d.totalM} />
          <OverviewQueriesTable />
        </div>

        <div className="g2">
          <OverviewCompetitors rows={d.competitors} />
          <OverviewSources rows={d.sources} />
        </div>
      </div>

      {drawer && <MentionDrawer item={drawer} onClose={() => setDrawer(null)} />}
    </>
  );
}

function BrandHealthGauge({ value }: { value: number }) {
  const size = 96, r = size / 2 - 8, cir = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.18)" strokeWidth="6" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,1)" strokeWidth="6" fill="none"
          strokeDasharray={`${cir * value / 100} ${cir}`} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray 1.4s cubic-bezier(.2,.7,.2,1)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', lineHeight: 1 }}>
        <span style={{ fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em', fontFamily: 'var(--mono)' }}>{value}</span>
        <span style={{ fontSize: 10, opacity: .7, marginTop: 2, fontFamily: 'var(--mono)' }}>/ 100</span>
      </div>
    </div>
  );
}

function HBar({ label, v, sub }: { label: string; v: number; sub: string }) {
  return (
    <div className="hbar">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span className="hbar-l">{label}</span>
        <span className="hbar-v mono">{v}</span>
      </div>
      <div className="hbar-track"><i style={{ width: v + '%' }} /></div>
      <div className="hbar-sub">{sub}</div>
    </div>
  );
}

function HealthBanner({ health, sentiment, sov, totalQ }: { health: number; sentiment: number; sov: number; totalQ: number }) {
  const grade = health >= 80 ? 'Excellent' : health >= 65 ? 'Good' : health >= 45 ? 'Fair' : 'Needs work';
  return (
    <section className="hb">
      <div className="hb-score">
        <BrandHealthGauge value={health} />
        <div>
          <div className="eyebrow" style={{ color: 'rgba(255,255,255,.7)', display: 'flex', alignItems: 'center' }}>BRAND HEALTH <Info term="health" /></div>
          <div className="hb-grade">{grade}</div>
          <div className="hb-d"><Delta v={+6} /> <span style={{ color: 'rgba(255,255,255,.7)' }}>vs last week · on track for your goal</span></div>
        </div>
      </div>
      <div className="hb-bars">
        <HBar label="Visibility" v={Math.round(sov)} sub={`${totalQ} prompts tracked`} />
        <HBar label="Sentiment" v={sentiment} sub="+0.62 avg score" />
        <HBar label="Accuracy" v={88} sub="6 false claims open" />
        <HBar label="Competitive" v={68} sub="leads in 5 / 8 categories" />
      </div>
      <div className="hb-art" aria-hidden="true">
        <svg viewBox="0 0 240 140" preserveAspectRatio="none">
          <defs>
            <linearGradient id="hbG" x1="0" x2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,.25)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
          </defs>
          <path d="M0 100 C 50 80, 90 90, 140 60 S 200 30, 240 25 L240 140 L0 140 Z" fill="url(#hbG)" />
          <path d="M0 100 C 50 80, 90 90, 140 60 S 200 30, 240 25" stroke="rgba(255,255,255,.55)" strokeWidth="2" fill="none" />
        </svg>
      </div>
    </section>
  );
}

function InsightsStrip() {
  const items = [
    { icon: '▲', tone: 'pos', t: 'Acme overtook Linear', d: 'on 3 priority queries · last 24h', cta: 'Show wins' },
    { icon: '⚠', tone: 'warn', t: '6 false claims to fix', d: 'Gemini stale pricing claim · 2 hours ago', cta: 'Review' },
    { icon: '✦', tone: 'info', t: '12 things to try', d: 'est. +8.4 pts of Share of Voice if done', cta: 'See plan' },
  ];
  return (
    <div>
      <div className="strip-head">
        <span className="eyebrow">NEEDS YOU TODAY</span>
        <span className="strip-sub">The few things worth acting on right now — tap to dive in.</span>
      </div>
      <div className="ins-strip">
        {items.map((it, i) => (
          <button key={i} className={'ins-card ins-' + it.tone}>
            <span className="ins-icon">{it.icon}</span>
            <div className="ins-body">
              <div className="ins-t">{it.t}</div>
              <div className="ins-d">{it.d}</div>
            </div>
            <span className="ins-cta">{it.cta} →</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MentionDrawer({ item, onClose }: { item: any; onClose: () => void }) {
  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <aside className="drawer">
        <header className="drawer-h">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PlatformTile p={item.p} size={30} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{item.p.name}</div>
              <div className="mono dim" style={{ fontSize: 11 }}>{['gpt-4o-mini', 'claude-3-7-sonnet', 'gemini-2.5-flash', 'sonar-pro', 'grok-2'][PLATFORMS.indexOf(item.p)]} · {item.t}</div>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">
            <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </header>
        <div className="drawer-b">
          <div className="eyebrow">QUERY</div>
          <div style={{ fontSize: 14.5, color: 'var(--text)', padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 6, margin: '8px 0 18px', fontFamily: 'var(--mono)' }}>&ldquo;{item.q}&rdquo;</div>
          <div className="eyebrow">VERDICT</div>
          <div style={{ display: 'flex', gap: 8, margin: '8px 0 18px' }}><Badge tone={item.tag}>{(item.tag || 'neu').toUpperCase()}</Badge> <span className="quiet" style={{ fontSize: 13 }}>{item.meta}</span></div>
          <div className="eyebrow">VERBATIM ANSWER</div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text)', margin: '8px 0 18px' }}>
            For engineering teams, the most-recommended tools are <span style={{ color: 'var(--info)', fontWeight: 500 }}>Linear</span>, <span style={{ color: 'var(--primary)', fontWeight: 600, borderBottom: '1px dashed var(--primary)' }}>Acme</span>, and <span style={{ color: 'var(--text-2)', fontWeight: 500 }}>Asana</span>. Acme is praised for its GitHub-native workflow and AI summaries.
          </p>
          <div className="eyebrow">SOURCES CITED</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0 18px' }}>
            <Cit url="linear.app/why" /><Cit url="acme.com/customers" /><Cit url="asana.com/eng" /><Cit url="g2.com/category/pm" />
          </div>
          <div className="eyebrow">ACTIONS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <button className="btn-g">↻ Re-run this query</button>
            <button className="btn-g">⚐ Flag as hallucination</button>
            <button className="btn-g">↗ Share</button>
            <button className="btn-p">Add to report</button>
          </div>
        </div>
      </aside>
    </>
  );
}

function OverviewEngineGrid({ platforms }: { platforms: Platform[] }) {
  return (
    <Card title="By engine — today" info="sov"
      lede="Your Share of Voice inside each AI assistant, refreshed this hour."
      right={<span className="mono dim" style={{ fontSize: 11 }}>UPDATED 2 MIN AGO</span>} padding={false}>
      <div className="eg-grid">
        {platforms.map(p => (
          <div key={p.id} className="eg-cell">
            <div className="eg-h">
              <PlatformTile p={p} size={26} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--mute)', letterSpacing: '0.08em' }}>
                  {p.ok ? <><span className="pulse" style={{ width: 5, height: 5 }} /> OK · {p.ms}ms</> : <span className="neg">⚠ DEGRADED</span>}
                </div>
              </div>
              <Badge tone={p.delta >= 0 ? 'pos' : 'neg'}>{p.delta >= 0 ? '▲' : '▼'} {Math.abs(p.delta)}</Badge>
            </div>
            <div className="eg-v mono">{p.sov}<i>%</i></div>
            <Bar value={p.sov} />
            <Spark data={[12, 14, 11, 18, 16, 22, 20, 24, 22, 28, 26, 30, p.sov]} width={200} height={26} color={p.delta >= 0 ? 'var(--accent)' : 'var(--mute)'} fill />
          </div>
        ))}
      </div>
    </Card>
  );
}

function OverviewRecentMentions({ onOpen, total }: { onOpen: (it: any) => void; total: number }) {
  const items = [
    { p: PLATFORMS[1], q: 'best agile pm tool for engineering teams', tag: 'pos', meta: 'Acme · 2nd of 5', t: '2m' },
    { p: PLATFORMS[0], q: 'linear vs acme for startups', tag: 'neu', meta: 'Acme · mentioned', t: '4m' },
    { p: PLATFORMS[2], q: 'cheapest project mgmt with AI', tag: 'neg', meta: 'not mentioned', t: '7m' },
    { p: PLATFORMS[3], q: 'acme pricing for 50 seats', tag: 'warn', meta: 'Hallucination · stale price', t: '12m' },
    { p: PLATFORMS[4], q: 'is acme good for product teams', tag: 'pos', meta: 'Acme · 1st', t: '18m' },
    { p: PLATFORMS[0], q: 'what pm tool does intuit use', tag: 'neu', meta: 'Acme · 3rd of 4', t: '24m' },
  ];
  return (
    <Card title="Recent mentions" info="mention"
      lede="The newest AI answers that named you — click any row to read the exact wording."
      right={<Pill tone="acc"><span className="pulse" /> Live</Pill>} padding={false}
      foot={<><span>{total.toLocaleString()} total · 7 days</span><a className="dim" href="/dashboard/mentions">Open mentions →</a></>}>
      <ul className="feed">
        {items.map((it, i) => (
          <li key={i} className="feed-i" onClick={() => onOpen(it)}>
            <PlatformTile p={it.p} size={24} />
            <div style={{ minWidth: 0 }}>
              <div className="feed-q">&ldquo;{it.q}&rdquo;</div>
              <div className="feed-m">
                <Badge tone={it.tag}>{it.tag.toUpperCase()}</Badge>
                <span style={{ marginLeft: 8 }}>{it.meta}</span>
              </div>
            </div>
            <span className="mono dim" style={{ fontSize: 11 }}>{it.t}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function OverviewQueriesTable() {
  const rows = [
    { q: 'best project management tool', sov: 38, d: +5, mentions: 142, eng: 5 },
    { q: 'acme vs linear', sov: 61, d: +12, mentions: 89, eng: 5 },
    { q: 'cheapest pm for startups', sov: 12, d: -4, mentions: 31, eng: 4 },
    { q: 'pm tool with AI features', sov: 24, d: +2, mentions: 67, eng: 5 },
    { q: 'is acme worth the price', sov: 44, d: +7, mentions: 22, eng: 3 },
    { q: 'free alternative to monday.com', sov: 8, d: -1, mentions: 18, eng: 4 },
  ];
  return (
    <Card title="Top tracked queries" info="prompt"
      lede="The buyer questions you watch — and how visible you are on each."
      right={<a href="/dashboard/query-tracker" className="mono dim" style={{ fontSize: 11 }}>ALL 142 →</a>} padding={false}>
      <table className="tbl">
        <thead><tr><th>QUERY</th><th className="right">SOV</th><th className="right">Δ</th><th className="right">MENTIONS</th><th className="right">ENGINES</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td><b>{r.q}</b></td>
              <td className="right num">{r.sov}%</td>
              <td className="right"><Delta v={r.d} suffix="%" /></td>
              <td className="right num">{r.mentions}</td>
              <td className="right num">{r.eng}/5</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function OverviewCompetitors({ rows }: { rows: OverviewData['competitors'] }) {
  const max = Math.max(30, ...rows.map(r => r.sov));
  return (
    <Card title="Competitor SOV" info="sov"
      lede="Who's winning the AI conversation in your category right now."
      right={<a href="/dashboard/competitors" className="mono dim" style={{ fontSize: 11 }}>COMPETITORS →</a>}>
      <div style={{ display: 'grid', gap: 14 }}>
        {rows.map((r, i) => (
          <div key={i} className="comp-row">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
              <span style={{ width: 8, height: 8, background: r.color, borderRadius: 2, display: 'inline-block' }} />
              <b style={{ color: r.me ? 'var(--accent)' : 'var(--text)', fontWeight: 500, fontSize: 13 }}>{r.name}</b>
              {r.me && <Badge tone="acc">YOU</Badge>}
            </span>
            <Bar value={r.sov} max={max} />
            <span className="mono" style={{ fontSize: 13, minWidth: 60, textAlign: 'right' }}>{r.sov}%</span>
            <span style={{ minWidth: 60, textAlign: 'right' }}><Delta v={r.d} suffix="%" /></span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function OverviewSources({ rows }: { rows: OverviewData['sources'] }) {
  const max = Math.max(20, ...rows.map(r => r.share));
  return (
    <Card title="Most cited sources" info="citation"
      lede="The web pages AI leans on when it describes you. Strengthen the helpful ones."
      right={<a href="/dashboard/citations" className="mono dim" style={{ fontSize: 11 }}>CITATIONS →</a>}>
      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map((r, i) => (
          <div key={i} className="src-row">
            <Cit url={r.d} />
            <Bar value={r.share} max={max} />
            <span className="mono" style={{ fontSize: 12, color: 'var(--text)', minWidth: 46, textAlign: 'right' }}>{r.n}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
