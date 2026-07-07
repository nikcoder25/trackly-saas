'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { PLATFORMS, PlatformTile, Badge, Delta, Bar, Card, PageHead, Filter, Seg, Pill, KPIRail, Spark, LineChart, Donut, Heatmap, StackBar, Cit, Info, Term } from '../ui';
import { useExtras } from '../shell';

// ─────────────────────────── MENTIONS ───────────────────────────
export function PageMentions() {
  const [tag, setTag] = React.useState('all');
  const mentions = generateMentions(40);
  const filtered = tag === 'all' ? mentions : mentions.filter(m => m.tag === tag);
  return (
    <>
      <PageHead title="Mentions" sub="Every answer where an AI assistant named Acme - across the 142 buyer questions you track."
        actions={<><button className="btn-d">⇣ Export CSV</button><button className="btn-g">⚙ Columns</button></>}/>
      <div className="page-body">
        <KPIRail items={[
          { k: 'TOTAL · 7D', term: 'mention', v: '1,284', d: +218 },
          { k: 'POSITIVE',   term: 'sentiment', v: '952',   d: +180 },
          { k: 'NEGATIVE',   term: 'sentiment', v: '64',    d: -12 },
          { k: 'FALSE CLAIMS', term: 'hallucination', v: '6', d: -2 },
          { k: 'NOT MENTIONED', term: 'coverage', v: '262', d: -34, info: 'queries where we lost' },
        ]} />

        <Filter>
          <div className="search-box"><span className="dim mono">⌕</span><input placeholder="Filter mentions, queries, sources…"/></div>
          <Seg value={tag} onChange={setTag} options={[
            { value: 'all', label: 'ALL' },
            { value: 'pos', label: 'POSITIVE' },
            { value: 'neg', label: 'NEGATIVE' },
            { value: 'warn', label: 'FALSE CLAIM' },
            { value: 'miss', label: 'NOT MENTIONED' },
          ]}/>
          <select className="sel"><option>All engines</option>{PLATFORMS.map(p=><option key={p.id}>{p.name}</option>)}</select>
          <select className="sel"><option>All time</option><option>Last 24h</option><option>Last 7 days</option></select>
          <select className="sel"><option>All intents</option><option>Comparison</option><option>Pricing</option></select>
          <span style={{flex:1}}/>
          <Pill tone="acc"><Spark data={[10,12,11,16,15,19,22,20,25,28]} width={60} height={16} color="var(--accent)" fill/> +18% week</Pill>
        </Filter>

        <Card title="All mentions" info="mention"
          lede="One row per AI answer. “Verdict” is how you showed up; “position” is where you ranked in the answer’s list."
          padding={false} foot={<><span>Showing {filtered.length} of 1,284</span><span>Auto-refreshing · live</span></>}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>
                <th>ENGINE</th><th>QUERY</th><th>VERDICT <Info>How you showed up in this answer - named first, mentioned, missed, or a false claim.</Info></th><th>POSITION <Info term="position"/></th><th>SOURCES <Info term="citation"/></th><th>SENTIMENT <Info term="sentiment"/></th><th className="right">TIME</th>
              </tr></thead>
              <tbody>
                {filtered.slice(0, 18).map((m,i) => (
                  <tr key={i} style={{cursor:'pointer'}}>
                    <td><span style={{display:'inline-flex',alignItems:'center',gap:8}}><PlatformTile p={m.p} size={22}/> <b>{m.p.name}</b></span></td>
                    <td><span style={{color:'var(--text)'}}>&ldquo;{m.q}&rdquo;</span></td>
                    <td><Badge tone={m.tag}>{m.tagLabel}</Badge></td>
                    <td className="num">{m.pos}</td>
                    <td><span className="mono dim" style={{fontSize:11}}>{m.sources} cited</span></td>
                    <td><span className="num">{m.sent > 0 ? '+' : ''}{m.sent.toFixed(2)}</span></td>
                    <td className="right num dim">{m.t}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

function generateMentions(n: any) {
  const queries = [
    'best project management tool for engineering','linear vs acme for startups','cheapest pm with AI features',
    'acme pricing for 50 seats','is acme good for product teams','what pm tool does intuit use',
    'pm tools that integrate with github','acme vs notion','free alternative to monday.com',
    'best agile pm tool','acme feature comparison','pm for remote teams',
  ];
  const tags = [
    { tag: 'pos', label: 'POSITIVE · 2ND', pos: '2/5', sent: 0.71 },
    { tag: 'pos', label: 'POSITIVE · 1ST', pos: '1/4', sent: 0.84 },
    { tag: 'neu', label: 'MENTIONED', pos: '3/6', sent: 0.12 },
    { tag: 'warn', label: 'FALSE CLAIM', pos: '-', sent: -0.10 },
    { tag: 'neg', label: 'NEGATIVE', pos: '4/4', sent: -0.42 },
    { tag: 'miss', label: 'NOT MENTIONED', pos: '-', sent: 0 },
  ];
  return Array.from({length: n}).map((_, i) => {
    const t = tags[i % tags.length];
    return {
      p: PLATFORMS[i % 5],
      q: queries[i % queries.length],
      tag: t.tag, tagLabel: t.label, pos: t.pos, sent: t.sent,
      sources: 1 + (i % 5),
      t: `${1 + (i % 59)}m`,
    };
  });
}

// ─────────────────────── EVIDENCE & PROOF ───────────────────────
export function PageProof() {
  return (
    <>
      <PageHead title="Evidence & Proof" sub="The exact line of text where each engine answered. Forwardable to your CMO."
        actions={<><button className="btn-d">⇣ PDF report</button><button className="btn-g">Send to legal</button></>}/>
      <div className="page-body">
        <Filter>
          <Seg value="claude" onChange={()=>{}} options={[
            { value: 'all', label: 'ALL ENGINES' },
            ...PLATFORMS.map(p => ({ value: p.id, label: p.short })),
          ]}/>
          <select className="sel"><option>"best pm tool for engineering"</option><option>"acme vs linear"</option><option>+ all 142 queries</option></select>
          <Pill>Run · today · 14:02</Pill>
          <span style={{flex:1}}/>
          <button className="btn-d">↻ Re-run query</button>
        </Filter>

        <div className="g2">
          <Card title="Verbatim model output" right={<><PlatformTile p={PLATFORMS[1]} size={22}/><Pill tone="pos">POSITIVE · 2/5</Pill></>} style={{ gridColumn: 'span 2' }}>
            <div className="proof-body">
              <div className="proof-q mono"><span className="dim">QUERY ›</span> &ldquo;best project management tool for engineering teams&rdquo;</div>
              <div className="proof-answer">
                For engineering teams in 2026 that prioritize speed and developer ergonomics, the most-recommended options are typically <span className="hl">Linear</span> for its keyboard-driven UI, <span className="hl me">Acme</span> for its GitHub-native workflow and AI summaries, and <span className="hl">Asana</span> for cross-functional projects. Smaller teams often start with Linear; larger orgs that need roadmapping and resource planning lean toward Acme or Jira.
              </div>
              <div className="proof-meta mono">
                <span><span className="dim">CITED:</span> linear.app/why · <span className="me">acme.com/customers</span> · asana.com/engineering · g2.com/category/pm</span>
                <span className="dim">·</span>
                <span><span className="dim">TOKENS:</span> 184 in · 312 out</span>
                <span className="dim">·</span>
                <span><span className="dim">RAN:</span> 2 min ago</span>
              </div>
            </div>
          </Card>

          <Card title="Mentions in this answer" padding={false}>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>BRAND</th><th>POS.</th><th>SENTIMENT</th><th>LINKED</th></tr></thead>
                <tbody>
                  <tr><td><b>Linear</b></td><td className="num">1</td><td className="pos num">+0.78</td><td className="mono dim">linear.app/why</td></tr>
                  <tr><td><b style={{color:'var(--accent)'}}>Acme</b> <Badge tone="acc">YOU</Badge></td><td className="num">2</td><td className="pos num">+0.71</td><td className="mono dim">acme.com/customers</td></tr>
                  <tr><td><b>Asana</b></td><td className="num">3</td><td className="pos num">+0.62</td><td className="mono dim">asana.com/eng</td></tr>
                  <tr><td><b>Jira</b></td><td className="num">4</td><td className="neu num">+0.05</td><td className="mono dim">-</td></tr>
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Same query across engines" padding={false}>
            <ul className="proof-eng">
              {PLATFORMS.map(p => (
                <li key={p.id}>
                  <PlatformTile p={p} size={22}/>
                  <span style={{flex:1,fontSize:12.5}}>{p.name}</span>
                  <Badge tone={p.delta >= 0 ? 'pos' : 'neg'}>{p.delta >= 0 ? 'POS · ' + (1 + Math.abs(p.delta % 3)) : 'NEG'}</Badge>
                  <span className="mono dim" style={{fontSize:11}}>2m</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Prompt history" right={<a className="mono dim" style={{fontSize:11}}>FULL TIMELINE →</a>} style={{ gridColumn: 'span 2' }}>
            <div style={{display:'grid',gap:10}}>
              {[
                { t: '14:02', q: 'best project management tool for engineering teams', verdict: 'POS · 2nd', tone: 'pos' },
                { t: '13:01', q: 'best project management tool for engineering teams', verdict: 'POS · 3rd', tone: 'pos' },
                { t: '12:00', q: 'best project management tool for engineering teams', verdict: 'POS · 3rd', tone: 'pos' },
                { t: '11:00', q: 'best project management tool for engineering teams', verdict: 'NEU · mentioned', tone: 'neu' },
                { t: '10:00', q: 'best project management tool for engineering teams', verdict: 'MISS', tone: 'neg' },
              ].map((h, i) => (
                <div key={i} className="hist-row">
                  <span className="mono dim">{h.t}</span>
                  <Badge tone={h.tone}>{h.verdict}</Badge>
                  <span style={{color:'var(--text-2)',fontSize:12.5}}>{h.q}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

// ───────────────────────── PLATFORM STATUS ─────────────────────────
export function PagePlatforms() {
  return (
    <>
      <PageHead title="Platform Status" sub="Health of every engine - uptime, latency, queue, and last successful run."
        actions={<><button className="btn-d">Subscribe to status</button><button className="btn-p">Run all engines now</button></>}/>
      <div className="page-body">
        <KPIRail items={[
          { k: 'ENGINES UP',     v: '4/5', d: 0, info: 'Grok degraded' },
          { k: 'AVG. LATENCY',   v: '2.1', suffix: 's', d: -0.3 },
          { k: 'RUNS / DAY',     v: '24',  d: 0, info: 'every hour' },
          { k: 'SUCCESS · 7D',   v: '99.2', suffix: '%', d: -0.4 },
          { k: 'QUEUE',          v: '0',   d: 0, info: 'idle' },
        ]}/>

        <div className="g2">
          {PLATFORMS.map(p => (
            <Card key={p.id} title={<span style={{display:'inline-flex',alignItems:'center',gap:10}}><PlatformTile p={p} size={26}/> {p.name}</span>}
              right={p.ok ? <Pill tone="acc"><span className="pulse" style={{width:5,height:5}}/> OPERATIONAL</Pill> : <Pill tone="neg">⚠ DEGRADED</Pill>}>
              <div className="plat-grid">
                <div>
                  <div className="eyebrow">LATENCY · 7D</div>
                  <div className="kpi-v mono" style={{fontSize:22}}>{p.ms || '-'}<i>ms</i></div>
                  <Spark data={[1800,2100,1700,1950,2200,1820,p.ms || 4000]} width={140} height={28} color={p.ok ? 'var(--accent)' : 'var(--mute)'} fill/>
                </div>
                <div>
                  <div className="eyebrow">SUCCESS RATE</div>
                  <div className="kpi-v mono" style={{fontSize:22}}>{p.ok ? '99.4' : '78.1'}<i>%</i></div>
                  <div className="mono" style={{fontSize:11,color:'var(--mute)'}}>last 1,024 runs</div>
                </div>
                <div>
                  <div className="eyebrow">MODEL</div>
                  <div className="mono" style={{fontSize:13}}>{['gpt-4o-mini','claude-3-7-sonnet','gemini-2.5-flash','sonar-pro','grok-2'][PLATFORMS.indexOf(p)]}</div>
                  <div className="mono" style={{fontSize:11,color:'var(--mute)'}}>auto · search-on</div>
                </div>
                <div>
                  <div className="eyebrow">LAST RUN</div>
                  <div className="mono" style={{fontSize:13}}>{p.ok ? '2 min ago' : '54 min ago'}</div>
                  <div className="mono" style={{fontSize:11,color: p.ok ? 'var(--success)' : 'var(--danger)'}}>{p.ok ? '✓ success' : '✗ 429 rate limit'}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Card title="Recent run timeline" padding={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>RUN</th><th>STARTED</th><th>ENGINES</th><th>QUERIES</th><th>DURATION</th><th>RESULT</th></tr></thead>
              <tbody>
                {Array.from({length: 8}).map((_,i) => (
                  <tr key={i}>
                    <td className="num"><b>#1284 - {i}</b></td>
                    <td className="num">{`${(14 - i).toString().padStart(2,'0')}:02:18`}</td>
                    <td><div style={{display:'inline-flex',gap:4}}>{PLATFORMS.map(p => <PlatformTile key={p.id} p={p} size={18}/>)}</div></td>
                    <td className="num">142</td>
                    <td className="num">{(38 + i*2)}s</td>
                    <td>{i === 3 ? <Badge tone="warn">PARTIAL · grok 429</Badge> : <Badge tone="pos">SUCCESS</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

// ─────────────────────────── COMPETITORS ───────────────────────────
// Celebratory "you overtook a rival" banner - fires confetti once per session.
function OvertakeBanner() {
  const ex = useExtras();
  const [hidden, setHidden] = React.useState(false);
  React.useEffect(() => {
    try {
      if (!sessionStorage.getItem('lv_celebrated_overtake')) {
        sessionStorage.setItem('lv_celebrated_overtake', '1');
        setTimeout(() => ex && ex.celebrate({ count: 80 }), 500);
      }
    } catch (e) {}
  }, []); // eslint-disable-line
  if (hidden) return null;
  return (
    <div className="overtake">
      <span className="overtake-ic">★</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="overtake-t">You just overtook Linear for #1 in your category</div>
        <div className="overtake-d">Acme reached <b>27.4%</b> Share of Voice this week - up <b>4.2 points</b>, your best run yet.</div>
      </div>
      <button className="btn-g" onClick={() => ex && ex.celebrate({ count: 90 })}>✦ Celebrate</button>
      <button className="overtake-x" title="Dismiss" onClick={() => setHidden(true)}>
        <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
      </button>
    </div>
  );
}

export function PageCompetitors() {
  const comps = [
    { name: 'Acme',   sov: 27.4, d: +4.2, mentions: 1284, ai: 'You', color: 'var(--accent)', me: true },
    { name: 'Linear', sov: 22.1, d: -1.4, mentions: 1042, color: 'var(--text-2)' },
    { name: 'Asana',  sov: 14.8, d: +0.6, mentions: 698,  color: 'var(--mute)' },
    { name: 'Monday', sov: 9.3,  d: -2.1, mentions: 438,  color: 'var(--mute-2)' },
    { name: 'Notion', sov: 6.1,  d: +1.1, mentions: 287,  color: 'var(--info)' },
    { name: 'Jira',   sov: 5.4,  d: -0.7, mentions: 255,  color: 'var(--warn)' },
    { name: 'ClickUp',sov: 4.8,  d: +0.4, mentions: 226,  color: '#a78bfa' },
    { name: 'Trello', sov: 3.1,  d: -0.2, mentions: 146,  color: '#f472b6' },
  ];
  return (
    <>
      <PageHead title="Competitors" sub="Where Acme stands against the 7 brands you track - across every engine, every question."
        actions={<><button className="btn-d">+ Add competitor</button><button className="btn-g">⇣ Export</button></>}/>
      <div className="page-body">
        <OvertakeBanner />
        <Filter>
          <Seg value="7d" onChange={()=>{}} options={['24h','7d','30d','90d']}/>
          <select className="sel"><option>All engines</option></select>
          <select className="sel"><option>All queries</option><option>Comparison only</option></select>
          <span style={{flex:1}}/>
          <Pill tone="acc">Acme leads in 5 of 8 categories</Pill>
        </Filter>

        <Card title="Share of Voice" info="sov"
          lede="Everyone's slice of the AI conversation, added up across all engines. Your bar is highlighted."
          right={<span className="mono dim" style={{fontSize:11}}>STACKED · ALL ENGINES</span>}>
          <StackBar items={comps.map(c => ({ label: c.name, value: c.sov, color: c.color }))} height={32}/>
          <div style={{display:'flex',gap:18,marginTop:14,flexWrap:'wrap',fontSize:11,fontFamily:'var(--mono)',color:'var(--mute)'}}>
            {comps.map(c => (
              <span key={c.name} style={{display:'inline-flex',alignItems:'center',gap:6}}>
                <i style={{width:8,height:8,background:c.color,borderRadius:1,display:'inline-block'}}/>
                <b style={{color: c.me ? 'var(--accent)' : 'var(--text)'}}>{c.name}</b> {c.sov}%
              </span>
            ))}
          </div>
        </Card>

        <Card title="Head-to-head matrix" right={<span className="mono dim" style={{fontSize:11}}>WIN RATE · QUERIES WHERE BOTH APPEAR</span>} padding={false}
          lede="For questions where two brands both show up, how often the row brand beats the column brand.">
          <div className="h2h" style={{ gridTemplateColumns: `120px repeat(${comps.length}, 1fr)` }}>
            <div></div>
            {comps.map(c => <div key={c.name} className="h2h-y mono" style={{color: c.me ? 'var(--accent)':''}}>{c.name}</div>)}
            {comps.map((row, ri) => (
              <React.Fragment key={ri}>
                <div className="h2h-x mono" style={{color: row.me ? 'var(--accent)':''}}>{row.name}</div>
                {comps.map((col, ci) => {
                  if (ri === ci) return <div key={ci} className="h2h-self mono">-</div>;
                  const win = (((ri+1) * (ci+3)) % 100) / 100;
                  const op = 0.15 + win * 0.85;
                  return <div key={ci} className="h2h-c mono" style={{ background: `color-mix(in oklch, var(--accent) ${Math.round(op*60)}%, transparent)`, color: win > 0.55 ? 'var(--accent)' : 'var(--text-2)' }}>{Math.round(win*100)}%</div>;
                })}
              </React.Fragment>
            ))}
          </div>
        </Card>

        <Card title="Competitor leaderboard" info="sov"
          lede="Every brand you track, ranked by Share of Voice. Green = gaining, red = slipping."
          padding={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>
                <th>RANK</th><th>BRAND</th><th>SOV</th><th>Δ 7D</th><th>MENTIONS</th><th>SOV TREND</th><th>WHEN MENTIONED</th>
              </tr></thead>
              <tbody>
                {comps.map((c,i) => (
                  <tr key={c.name}>
                    <td className="num"><b>{(i+1).toString().padStart(2,'0')}</b></td>
                    <td><span style={{display:'inline-flex',alignItems:'center',gap:8}}>
                      <span style={{width:10,height:10,background:c.color,borderRadius:2,display:'inline-block'}}/>
                      <b style={{color: c.me ? 'var(--accent)':'var(--text)'}}>{c.name}</b>
                      {c.me && <Badge tone="acc">YOU</Badge>}
                    </span></td>
                    <td className="num"><b>{c.sov}%</b></td>
                    <td><Delta v={c.d} suffix="%"/></td>
                    <td className="num">{c.mentions.toLocaleString()}</td>
                    <td><Spark data={Array.from({length:14}).map((_,j) => c.sov + Math.sin(j*0.8 + i)*3)} width={120} height={24} color={c.me ? 'var(--accent)' : c.color}/></td>
                    <td><div style={{display:'inline-flex',gap:3}}>{PLATFORMS.map((p,j) => <span key={p.id} className="mono" style={{fontSize:9,padding:'2px 5px',borderRadius:2,background:`color-mix(in oklch, ${c.color} ${[55,45,30,20,10][j]}%, transparent)`,color:'var(--text)'}}>{p.short}</span>)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

// ───────────────────────────── SOV TRENDS ─────────────────────────────
export function PageTrends() {
  const months = ['Mar 12','Mar 19','Mar 26','Apr 02','Apr 09','Apr 16','Apr 23','Apr 30','May 07','May 14'];
  const main = [
    { id: 'acme',   label: 'Acme',   color: 'var(--accent)', bold: true, fill: true, cur: 27.4, data: [12,14,15,18,19,21,22,24,26,27] },
    { id: 'linear', label: 'Linear', color: 'var(--text-2)', dashed: true, cur: 22.1, data: [28,28,27,26,25,24,24,23,22,22] },
    { id: 'asana',  label: 'Asana',  color: 'var(--mute)',   dashed: true, cur: 14.8, data: [22,21,20,20,19,18,17,16,15,15] },
    { id: 'monday', label: 'Monday', color: 'var(--mute-2)', dashed: true, cur: 9.3,  data: [14,13,12,12,11,11,10,10,9,9] },
  ];
  return (
    <>
      <PageHead title="SOV Trends" sub="Long-term share of voice - month-over-month and year-over-year."
        actions={<><button className="btn-d">Add brand to chart</button><button className="btn-g">⇣ Snapshot</button></>}/>
      <div className="page-body">
        <Filter>
          <Seg value="90d" onChange={()=>{}} options={['30d','90d','6m','1y']}/>
          <Seg value="line" onChange={()=>{}} options={[{value:'line',label:'LINE'},{value:'area',label:'STACKED'},{value:'pct',label:'% OF VOICE'}]}/>
          <select className="sel"><option>Daily</option><option>Weekly</option><option>Monthly</option></select>
          <span style={{flex:1}}/>
          <Pill tone="acc">+15.4 pp SOV gain · 90d</Pill>
        </Filter>

        <Card title="Share of Voice · 90 days" right={<span className="mono dim" style={{fontSize:11}}>WEEKLY · ALL ENGINES</span>}>
          <LineChart series={main} xLabels={months} height={340}/>
        </Card>

        <div className="g3">
          <Card title="SOV by engine">
            <div style={{display:'grid',gap:12}}>
              {PLATFORMS.map(p => (
                <div key={p.id} style={{display:'grid',gap:6}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{display:'inline-flex',alignItems:'center',gap:8,fontSize:13}}><PlatformTile p={p} size={20}/> {p.name}</span>
                    <span className="mono"><b>{p.sov}%</b> <Delta v={p.delta}/></span>
                  </div>
                  <Spark data={[15,18,16,22,24,28,p.sov]} width={300} height={26} color="var(--accent)" fill/>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Volatility heatmap" right={<span className="mono dim" style={{fontSize:11}}>ENGINE × DAY</span>}>
            <Heatmap
              rows={PLATFORMS.map(p => p.short)}
              cols={['M','T','W','T','F','S','S']}
              data={PLATFORMS.map((p,i) => [0.2,0.4,0.7,0.5,0.9,0.3,0.2].map((v,j) => Math.max(0.05, Math.min(1, v + Math.sin(i+j*0.7)*0.2))))}
              label="Darker = more sov movement (higher volatility)"
            />
          </Card>

          <Card title="Milestones">
            <ul className="ms-list">
              <li><span className="mono pos">+ 4.2pp</span> Acme overtook Linear on "agile pm" · <span className="dim mono">May 09</span></li>
              <li><span className="mono pos">+ 2.1pp</span> First mention by Grok · <span className="dim mono">Apr 28</span></li>
              <li><span className="mono warn">⚠ 3</span> hallucinations spike on Gemini · <span className="dim mono">Apr 14</span></li>
              <li><span className="mono pos">+ 6.0pp</span> New customer page indexed · <span className="dim mono">Apr 02</span></li>
              <li><span className="mono pos">+ 1.4pp</span> Reddit thread cited 12× · <span className="dim mono">Mar 21</span></li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

// ───────────────────────── ACCURACY MONITOR ─────────────────────────
export function PageAccuracy() {
  const hallucinations = [
    { p: PLATFORMS[3], q: 'acme pricing for 50 seats', claim: 'Acme is $79 per user / month',           truth: 'Team plan is $29 per seat',         severity: 'high', age: '12m' },
    { p: PLATFORMS[2], q: 'does acme have native ai',  claim: 'Acme does not have AI features yet',     truth: 'AI Assist GA since Q4 2025',         severity: 'high', age: '54m' },
    { p: PLATFORMS[0], q: 'acme founders',             claim: 'Founded by Jane Doe in 2017',           truth: 'Founded by Sam Kim & Priya R., 2019', severity: 'med',  age: '2h' },
    { p: PLATFORMS[4], q: 'acme acquisition',          claim: 'Acquired by Atlassian in 2024',         truth: 'No acquisition - Acme is independent', severity: 'high', age: '4h' },
    { p: PLATFORMS[3], q: 'acme github integration',   claim: 'No native GitHub integration',          truth: 'Native GH app since 2023',           severity: 'med',  age: '5h' },
    { p: PLATFORMS[2], q: 'acme enterprise pricing',   claim: 'Enterprise plan starts at $50,000/yr',  truth: 'Starts at $12,000/yr',               severity: 'low',  age: '8h' },
  ];
  return (
    <>
      <PageHead title="Accuracy Monitor" sub="When engines invent features, prices, or facts about Acme - find them, fix them, prevent them."
        actions={<><button className="btn-d">⇣ Audit log</button><button className="btn-p">Send corrections</button></>}/>
      <div className="page-body">
        <KPIRail items={[
          { k: 'OPEN', v: '6', d: -2, danger: true },
          { k: 'FIXED · 30D', v: '23', d: +9 },
          { k: 'AVG. TIME TO DETECT', v: '8', suffix: 'm', d: -3 },
          { k: 'ENGINE WORST OFFENDER', v: 'GEM', info: '11 of 29' },
          { k: 'TOPIC WORST', v: 'pricing', info: '9 of 29' },
        ]}/>

        <div className="g2">
          <Card title="Hallucination feed" padding={false} style={{ gridColumn: 'span 2' }}>
            <ul className="hal-list">
              {hallucinations.map((h, i) => (
                <li key={i} className="hal-row">
                  <PlatformTile p={h.p} size={26}/>
                  <div>
                    <div className="hal-q mono"><span className="dim">QUERY ›</span> &ldquo;{h.q}&rdquo;</div>
                    <div className="hal-claim"><span className="hal-tag mono">CLAIMED ✗</span> {h.claim}</div>
                    <div className="hal-truth"><span className="hal-tag mono ok">TRUTH ✓</span> {h.truth}</div>
                  </div>
                  <div className="hal-actions">
                    <Badge tone={h.severity === 'high' ? 'neg' : h.severity === 'med' ? 'warn' : 'info'}>{h.severity.toUpperCase()}</Badge>
                    <span className="mono dim" style={{fontSize:11}}>{h.age}</span>
                    <button className="btn-g" style={{padding:'4px 8px',fontSize:11}}>Open</button>
                    <button className="btn-d" style={{padding:'4px 8px',fontSize:11}}>Submit correction</button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="By engine · 30 days">
            <div style={{display:'grid',gap:10}}>
              {[
                { p: PLATFORMS[2], n: 11, t: 38 },
                { p: PLATFORMS[3], n: 8,  t: 28 },
                { p: PLATFORMS[0], n: 5,  t: 17 },
                { p: PLATFORMS[1], n: 3,  t: 10 },
                { p: PLATFORMS[4], n: 2,  t: 7 },
              ].map(r => (
                <div key={r.p.id} style={{display:'grid',gridTemplateColumns:'26px 80px 1fr 40px',gap:10,alignItems:'center'}}>
                  <PlatformTile p={r.p} size={22}/>
                  <span style={{fontSize:12}}>{r.p.name}</span>
                  <Bar value={r.t} max={50}/>
                  <span className="mono" style={{textAlign:'right',fontSize:12}}><b>{r.n}</b></span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="By topic">
            <ul className="topic-list">
              <li><span>Pricing</span><Bar value={9} max={15}/><span className="num">9</span></li>
              <li><span>Features</span><Bar value={7} max={15}/><span className="num">7</span></li>
              <li><span>Founders / history</span><Bar value={5} max={15}/><span className="num">5</span></li>
              <li><span>Integrations</span><Bar value={4} max={15}/><span className="num">4</span></li>
              <li><span>Acquisition / funding</span><Bar value={2} max={15}/><span className="num">2</span></li>
              <li><span>Support / SLAs</span><Bar value={2} max={15}/><span className="num">2</span></li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────── CITATIONS ───────────────────────────
export function PageCitations() {
  const sources = [
    { d: 'acme.com/customers',                n: 214, share: 18, kind: 'own',     trend: 'up' },
    { d: 'acme.com/pricing',                  n: 182, share: 16, kind: 'own',     trend: 'up' },
    { d: 'g2.com/products/acme',              n: 96,  share: 9,  kind: 'review',  trend: 'flat' },
    { d: 'reddit.com/r/projectmanagement',    n: 71,  share: 6,  kind: 'social',  trend: 'up' },
    { d: 'acme.com/blog/agile',               n: 54,  share: 5,  kind: 'own',     trend: 'flat' },
    { d: 'producthunt.com/products/acme',     n: 41,  share: 4,  kind: 'review',  trend: 'down' },
    { d: 'ycombinator.com/launches/acme',     n: 38,  share: 3,  kind: 'news',    trend: 'up' },
    { d: 'techcrunch.com/2024/acme-launch',   n: 32,  share: 3,  kind: 'news',    trend: 'flat' },
    { d: 'capterra.com/p/acme',               n: 29,  share: 2,  kind: 'review',  trend: 'flat' },
    { d: 'github.com/acme-co',                n: 26,  share: 2,  kind: 'own',     trend: 'up' },
    { d: 'medium.com/@user/acme-review',      n: 21,  share: 2,  kind: 'social',  trend: 'down' },
    { d: 'linkedin.com/posts/acme-team',      n: 18,  share: 2,  kind: 'own',     trend: 'up' },
  ];
  return (
    <>
      <PageHead title="Citations" sub="Which web pages the AI engines pull from when they talk about Acme."
        actions={<><button className="btn-d">Add domain</button><button className="btn-g">⇣ Export</button></>}/>
      <div className="page-body">
        <KPIRail items={[
          { k: 'UNIQUE SOURCES', v: '184', d: +12 },
          { k: 'OWN DOMAIN %', v: '46', suffix: '%', d: +6 },
          { k: 'REVIEW SITES', v: '28', d: +3 },
          { k: 'SOCIAL/UGC', v: '54', d: +9 },
          { k: 'AVG. AGE',  v: '38d', d: -4, info: 'lower = fresher' },
        ]}/>

        <div className="g3">
          <Card title="By source type">
            <div style={{display:'flex',alignItems:'center',gap:18,padding:'6px 0'}}>
              <Donut value={46} label="OWN" size={140}/>
              <div style={{display:'grid',gap:10,fontSize:12.5,flex:1}}>
                <Row dot="var(--accent)" label="Own domain" pct={46} n={86}/>
                <Row dot="var(--info)" label="Review sites" pct={22} n={42}/>
                <Row dot="var(--warn)" label="News & PR" pct={16} n={30}/>
                <Row dot="var(--text-2)" label="Social / UGC" pct={12} n={22}/>
                <Row dot="var(--mute)" label="Other" pct={4} n={4}/>
              </div>
            </div>
          </Card>

          <Card title="Citation growth · 30d" style={{ gridColumn: 'span 2' }}>
            <LineChart valSuffix="" height={200} xLabels={['','D-30','','D-23','','D-16','','D-9','','today']}
              series={[
                { id: 'own',    label: 'Own',    color: 'var(--accent)', fill: true, bold: true, cur: 86, data: [50,52,55,58,62,64,68,72,80,86] },
                { id: 'review', label: 'Review', color: 'var(--info)',  dashed: true, cur: 42, data: [30,32,33,35,36,38,38,40,41,42] },
                { id: 'social', label: 'Social', color: 'var(--text-2)', dashed: true, cur: 22, data: [16,16,17,18,19,20,20,21,22,22] },
                { id: 'news',   label: 'News',   color: 'var(--warn)',  dashed: true, cur: 30, data: [22,24,25,26,27,28,28,29,30,30] },
              ]}
            />
          </Card>
        </div>

        <Card title="All cited sources" right={<Pill>184 unique</Pill>} padding={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>
                <th>DOMAIN</th><th>TYPE</th><th>CITES</th><th>SHARE</th><th>TREND</th><th>ENGINES</th><th>LAST SEEN</th>
              </tr></thead>
              <tbody>
                {sources.map((s,i) => (
                  <tr key={i}>
                    <td><Cit url={s.d}/></td>
                    <td><Badge tone={s.kind === 'own' ? 'acc' : s.kind === 'review' ? 'info' : s.kind === 'news' ? 'warn' : 'neu'}>{s.kind.toUpperCase()}</Badge></td>
                    <td className="num"><b>{s.n}</b></td>
                    <td className="num">{s.share}%</td>
                    <td>{s.trend === 'up' ? <span className="pos mono">▲ rising</span> : s.trend === 'down' ? <span className="neg mono">▼ falling</span> : <span className="mono dim">- flat</span>}</td>
                    <td><div style={{display:'inline-flex',gap:3}}>{PLATFORMS.slice(0, 3+(i%3)).map(p => <PlatformTile key={p.id} p={p} size={18}/>)}</div></td>
                    <td className="num dim">{(i+1)*3}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

function Row({ dot, label, pct, n }: any) {
  return (
    <div style={{display:'grid',gridTemplateColumns:'10px 1fr 36px 36px',gap:10,alignItems:'center'}}>
      <span style={{width:10,height:10,background:dot,borderRadius:2}}/>
      <span>{label}</span>
      <span className="mono dim" style={{textAlign:'right'}}>{pct}%</span>
      <span className="mono" style={{textAlign:'right',color:'var(--text)'}}>{n}</span>
    </div>
  );
}

// ───────────────────────────── RESULTS ─────────────────────────────
export function PageResults() {
  const [q, setQ] = React.useState(0);
  const queries = [
    'best project management tool for engineering teams',
    'linear vs acme for startups',
    'cheapest pm tool with AI features',
    'acme pricing for 50 seats',
    'pm tools that integrate with github',
  ];
  return (
    <>
      <PageHead title="Results" sub="The full text of every model response - drill into a single query across all engines."
        actions={<><button className="btn-d">↻ Re-run</button><button className="btn-g">⇣ Export run</button></>}/>
      <div className="page-body">
        <Filter>
          <select className="sel" value={q} onChange={e=>setQ(+e.target.value)} style={{minWidth:380}}>
            {queries.map((qq,i) => <option key={i} value={i}>{qq}</option>)}
          </select>
          <Pill>Run #1287 · today · 14:02</Pill>
          <Pill>5 engines · 312ms p50</Pill>
          <span style={{flex:1}}/>
          <button className="btn-d">◀ Prev query</button>
          <button className="btn-d">Next query ▶</button>
        </Filter>

        {PLATFORMS.map(p => (
          <Card key={p.id}
            title={<span style={{display:'inline-flex',alignItems:'center',gap:10}}><PlatformTile p={p} size={26}/> {p.name} <span className="mono dim" style={{fontSize:10}}>{['gpt-4o-mini','claude-3-7-sonnet','gemini-2.5-flash','sonar-pro','grok-2'][PLATFORMS.indexOf(p)]}</span></span>}
            right={<>
              <Badge tone={p.delta >= 0 ? 'pos' : p.ok ? 'neu' : 'neg'}>{p.ok ? `MENTIONED · ${1 + (PLATFORMS.indexOf(p) % 3)}/5` : 'NO RESULT'}</Badge>
              <span className="mono dim" style={{fontSize:11}}>{p.ms}ms · 2m</span>
            </>}>
            {p.ok ? (
              <div className="proof-answer" style={{fontSize:14, maxWidth:'none'}}>
                For engineering teams, the tools most often mentioned are <span className="hl">Linear</span>, <span className="hl me">Acme</span>, and <span className="hl">Asana</span>. {p.short === 'CLA' && 'Linear is praised for its keyboard-driven UI; Acme for its GitHub-native workflow and AI summaries.'}
                {p.short === 'GPT' && ' Acme is recommended for teams that need built-in roadmapping and want first-class GitHub integration.'}
                {p.short === 'GEM' && ' Asana scores well for cross-functional collaboration; Acme tends to be picked for engineering-first orgs.'}
                {p.short === 'PRP' && ' Reviews on G2 and Reddit consistently mention Acme as a strong contender alongside Linear and Jira.'}
              </div>
            ) : (
              <div className="proof-answer" style={{color:'var(--mute)'}}>
                Engine returned no usable answer · 429 rate limit · re-queued in 12 minutes.
              </div>
            )}
            {p.ok && (
              <div className="proof-meta" style={{marginTop: 12}}>
                <span><span className="dim">CITED:</span> linear.app/why · <span className="me">acme.com/customers</span> · asana.com/eng</span>
                <span className="dim">·</span>
                <span><span className="dim">TOKENS:</span> {120 + PLATFORMS.indexOf(p)*30} in · {280 + PLATFORMS.indexOf(p)*40} out</span>
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}

// ───────────────────────── QUERY TRACKER ─────────────────────────
export function PageQueryTracker() {
  const queries = [
    { q: 'best project management tool', sov: 38, d: +5, mentions: 142, runs: 168, eng: 5, status: 'priority' },
    { q: 'acme vs linear',               sov: 61, d: +12, mentions: 89, runs: 168, eng: 5, status: 'priority' },
    { q: 'pm tool with AI features',     sov: 24, d: +2, mentions: 67, runs: 168, eng: 5, status: 'tracking' },
    { q: 'is acme worth the price',      sov: 44, d: +7, mentions: 22, runs: 168, eng: 3, status: 'tracking' },
    { q: 'cheapest pm for startups',     sov: 12, d: -4, mentions: 31, runs: 168, eng: 4, status: 'losing' },
    { q: 'free alternative to monday.com',sov: 8, d: -1, mentions: 18, runs: 168, eng: 4, status: 'losing' },
    { q: 'pm for remote teams',          sov: 19, d: +1, mentions: 44, runs: 168, eng: 5, status: 'tracking' },
    { q: 'best pm tool for product',     sov: 32, d: +6, mentions: 51, runs: 168, eng: 5, status: 'tracking' },
  ];
  return (
    <>
      <PageHead title="Query Tracker" sub="Every buyer-intent prompt you're tracking - and how Acme performs on each."
        actions={<><button className="btn-d">⇣ Export</button><button className="btn-p">+ Add prompt</button></>}/>
      <div className="page-body">
        <KPIRail items={[
          { k: 'TRACKED', v: '142', d: +14 },
          { k: 'WINNING (SOV ≥ 30%)', v: '38', d: +6 },
          { k: 'AT RISK (SOV < 15%)', v: '24', d: -3 },
          { k: 'MISS RATE',           v: '11', suffix: '%', d: -2 },
          { k: 'RUNS · 24H',          v: '3,408', d: 0 },
        ]}/>

        <Filter>
          <div className="search-box"><span className="dim mono">⌕</span><input placeholder="Search prompts…"/></div>
          <Seg value="all" onChange={()=>{}} options={[{value:'all',label:'ALL'},{value:'priority',label:'PRIORITY'},{value:'tracking',label:'TRACKING'},{value:'losing',label:'LOSING'}]}/>
          <select className="sel"><option>All engines</option></select>
          <select className="sel"><option>All tags</option><option>Pricing</option><option>Comparison</option></select>
          <span style={{flex:1}}/>
          <button className="btn-d">⇉ Bulk edit</button>
        </Filter>

        <Card padding={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>
                <th><input type="checkbox" /></th>
                <th>QUERY</th>
                <th>STATUS</th>
                <th>SOV</th>
                <th>Δ 7D</th>
                <th>MENTIONS</th>
                <th>ENGINES</th>
                <th>SOV TREND</th>
                <th className="right">RUNS</th>
              </tr></thead>
              <tbody>
                {queries.map((r,i) => (
                  <tr key={i}>
                    <td><input type="checkbox" /></td>
                    <td><b>{r.q}</b></td>
                    <td><Badge tone={r.status === 'priority' ? 'acc' : r.status === 'losing' ? 'neg' : 'neu'}>{r.status.toUpperCase()}</Badge></td>
                    <td className="num"><b>{r.sov}%</b></td>
                    <td><Delta v={r.d} suffix="%"/></td>
                    <td className="num">{r.mentions}</td>
                    <td className="num">{r.eng}/5</td>
                    <td><Spark data={Array.from({length:14}).map((_,j) => Math.max(0, r.sov + Math.sin(j*0.5+i)*5))} width={120} height={24} color={r.d >= 0 ? 'var(--primary)' : 'var(--danger)'}/></td>
                    <td className="right num dim">{r.runs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

// ─────────────────────── RECOMMENDATIONS ───────────────────────
export function PageRecommendations() {
  const ex = useExtras();
  const [done, setDone] = React.useState<any>({});
  const [snoozed, setSnoozed] = React.useState<any>({});
  const markDone = (i: any, e: any) => {
    setDone((d: any) => ({ ...d, [i]: true }));
    if (ex) ex.celebrate({ x: e ? e.clientX : undefined, y: e ? e.clientY : undefined, count: 75 });
  };
  const recs = [
    { p: 'HIGH', t: 'Update pricing page schema', d: 'Gemini and Perplexity are citing your 2024 pricing. Add structured-data Offer markup to acme.com/pricing.', impact: '+3.2 SOV', eff: '2h', tag: 'tech', e: ['GEM','PRP'] },
    { p: 'HIGH', t: 'Submit correction to Grok on AI features', d: 'Grok claims Acme has no AI features. Submit the correction via xAI feedback channel.', impact: '+1.8 SOV', eff: '15m', tag: 'correction', e: ['GRK'] },
    { p: 'HIGH', t: 'Publish "Acme vs Linear" comparison', d: 'You appear in 38% of "vs Linear" queries but lose 62% by position. A dedicated page would shift ranking.', impact: '+4.1 SOV', eff: '1d', tag: 'content', e: ['GPT','CLA','PRP'] },
    { p: 'MED',  t: 'Refresh G2 listing screenshots', d: 'G2 is the 3rd most-cited domain and screenshots are 18 months old. Refresh to reflect the AI Assist UI.', impact: '+1.2 SOV', eff: '3h', tag: 'profile', e: ['GPT','PRP'] },
    { p: 'MED',  t: 'Reply to high-velocity Reddit thread', d: 'r/projectmanagement thread cited 12× this week - official reply would compound exposure.', impact: '+0.9 SOV', eff: '30m', tag: 'social', e: ['CLA','GPT'] },
    { p: 'LOW',  t: 'Add 50-seat pricing tier page', d: 'Long-tail "acme pricing for 50 seats" gets 0.4% of traffic but currently hallucinates.', impact: '+0.6 SOV', eff: '4h', tag: 'content', e: ['PRP','GEM'] },
  ];
  return (
    <>
      <PageHead title="Recommendations" sub="What to do this week to win more share of voice - sorted by impact."
        actions={<><button className="btn-d">⇣ Export to ticket</button><button className="btn-g">Refresh recs</button></>}/>
      <div className="page-body">
        <KPIRail items={[
          { k: 'OPEN', v: '12', d: +2 },
          { k: 'HIGH-IMPACT',     v: '4', d: 0 },
          { k: 'EST. SOV GAIN',   term: 'pp', v: '+8.4', suffix: 'pp', info: 'if all completed' },
          { k: 'COMPLETED · 30D', v: '23', d: +9 },
          { k: 'AVG. EFFORT',     v: '3.2', suffix: 'h' },
        ]}/>

        <Filter>
          <Seg value="all" onChange={()=>{}} options={['ALL','HIGH','MED','LOW']}/>
          <select className="sel"><option>All tags</option><option>Content</option><option>Tech / SEO</option><option>Correction</option><option>Profile</option></select>
          <select className="sel"><option>All engines</option></select>
          <span style={{flex:1}}/>
          <Pill tone="acc">Sorted by est. impact</Pill>
        </Filter>

        <div className="recs-explain">
          Each play below is something you can do this week to get named more often by AI. We estimate the
          <Term term="sov"> Share-of-Voice</Term> lift and the effort - knock out the high-impact ones first, then tick them off.
        </div>

        <div style={{display:'grid',gap:12}}>
          {recs.map((r,i) => {
            if (snoozed[i]) return null;
            const isDone = done[i];
            return (
            <article key={i} className={"rec-card" + (isDone ? ' rec-done' : '')}>
              <span className={"rec-prio " + r.p.toLowerCase()}>{isDone ? '✓' : r.p}</span>
              <div className="rec-body">
                <div className="rec-top">
                  <h3 className="rec-t">{r.t}</h3>
                  <div className="rec-meta mono">
                    <span className="pos">+{r.impact.split(' ')[0].replace('+','')} SOV</span>
                    <span className="dim">· {r.eff}</span>
                    <Badge tone={r.tag === 'correction' ? 'warn' : r.tag === 'tech' ? 'info' : r.tag === 'content' ? 'acc' : 'neu'}>{r.tag.toUpperCase()}</Badge>
                  </div>
                </div>
                <p className="rec-d">{r.d}</p>
                <div className="rec-foot">
                  <div className="mono dim" style={{fontSize:11,letterSpacing:'0.08em'}}>AFFECTS</div>
                  <div style={{display:'inline-flex',gap:4}}>
                    {r.e.map(short => {
                      const p = PLATFORMS.find(x => x.short === short);
                      return <PlatformTile key={short} p={p!} size={20}/>;
                    })}
                  </div>
                  <div style={{flex:1}}/>
                  {isDone ? (
                    <span className="rec-done-tag"><span className="pos">✓ Done</span> · nice work</span>
                  ) : (<>
                    <button className="btn-d" style={{fontSize:11}} onClick={() => setSnoozed((s: any) => ({ ...s, [i]: true }))}>Snooze</button>
                    <button className="btn-d" style={{fontSize:11}}>Send to Linear</button>
                    <button className="btn-p" style={{fontSize:11}} onClick={(e) => markDone(i, e)}>Mark done</button>
                  </>)}
                </div>
              </div>
            </article>
          );})}
        </div>
      </div>
    </>
  );
}
