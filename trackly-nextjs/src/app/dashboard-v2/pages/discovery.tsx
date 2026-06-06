'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { Badge, Delta, Bar, Card, PageHead, Filter, Seg, Pill, KPIRail, Spark, LineChart, Heatmap, Cit } from '../ui';

// ────────────────────────── PROMPT DISCOVERY ──────────────────────────
export function PagePromptDiscovery() {
  const [intent, setIntent] = React.useState('all');
  const [drawer, setDrawer] = React.useState<any>(null);

  return (
    <>
      <PageHead title="Prompt Discovery"
        sub={<>How many people actually ask each question in ChatGPT / Claude / Gemini? <b style={{color:'var(--primary)'}}>Track demand</b>, not just rankings.</>}
        actions={<><button className="btn-g">⇣ Export CSV</button><button className="btn-p">+ Track selected</button></>}/>
      <div className="page-body">

        <div className="pd-hero">
          <div className="pd-hero-l">
            <div className="eyebrow" style={{color:'rgba(255,255,255,.78)'}}>PROMPT DEMAND INDEX</div>
            <div className="pd-hero-v"><span className="mono">8,420</span><i>queries / mo</i></div>
            <div className="pd-hero-d">your category · across 5 engines · <Delta v={+18} suffix="%"/> vs last month</div>
          </div>
          <div className="pd-hero-mini">
            {[
              { k: 'NEW PROMPTS · 30D', v: '124', d: +18 },
              { k: 'YOUR APPEARANCE',   v: '68%', d: +6 },
              { k: 'UNCONTESTED WINS',  v: '14', d: +3 },
              { k: 'LOSING PROMPTS',    v: '38', d: -4 },
            ].map((k,i)=>(
              <div key={i} className="pd-mini">
                <div className="eyebrow" style={{color:'rgba(255,255,255,.72)'}}>{k.k}</div>
                <div className="pd-mini-v"><span className="mono">{k.v}</span></div>
                <Delta v={k.d}/>
              </div>
            ))}
          </div>
        </div>

        <Filter>
          <div className="search-box"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="var(--mute)" strokeWidth="1.5"/><path d="M9.5 9.5L12 12" stroke="var(--mute)" strokeWidth="1.5"/></svg><input placeholder="Discover prompts - try 'project management', 'AI features'…"/></div>
          <Seg value={intent} onChange={setIntent} options={[
            { value: 'all', label: 'ALL' },
            { value: 'compare', label: 'COMPARE' },
            { value: 'price', label: 'PRICE' },
            { value: 'recommend', label: 'RECOMMEND' },
            { value: 'feature', label: 'FEATURE' },
            { value: 'brand', label: 'BRAND' },
          ]}/>
          <select className="sel"><option>Volume: any</option><option>1k+ / mo</option><option>500–1k</option><option>100–500</option></select>
          <select className="sel"><option>All engines</option></select>
          <span style={{flex:1}}/>
          <Pill tone="acc">AI-suggested · refreshed 12m ago</Pill>
        </Filter>

        <div className="g3">
          <Card title="Intent clusters" right={<span className="mono dim" style={{fontSize:11}}>30 DAYS</span>}>
            {[
              { label: 'Compare / vs',       v: 38, n: 2840, c: 'var(--primary)' },
              { label: 'Recommend / best',   v: 32, n: 2390, c: 'var(--info)' },
              { label: 'Pricing / cost',     v: 14, n: 1050, c: 'var(--warn)' },
              { label: 'Feature / can it',   v: 10, n: 740,  c: 'var(--success)' },
              { label: 'Brand / what is',    v: 6,  n: 400,  c: 'var(--text-2)' },
            ].map((row,i) => (
              <div key={i} className="ic-row">
                <span style={{display:'inline-flex',alignItems:'center',gap:8,minWidth:140,fontSize:13}}>
                  <span style={{width:8,height:8,background:row.c,borderRadius:2,display:'inline-block'}}/>
                  {row.label}
                </span>
                <Bar value={row.v} max={45}/>
                <span className="mono" style={{fontSize:12,minWidth:36,textAlign:'right'}}>{row.v}%</span>
                <span className="mono dim" style={{fontSize:11,minWidth:60,textAlign:'right'}}>{row.n.toLocaleString()}/mo</span>
              </div>
            ))}
          </Card>

          <Card title="Rising prompts · 7d" style={{ gridColumn: 'span 2' }} padding={false}>
            <table className="tbl">
              <thead><tr><th>PROMPT</th><th>INTENT</th><th>VOL / MO</th><th>Δ 7D</th><th>YOU?</th></tr></thead>
              <tbody>
                {[
                  ['can acme replace jira',                   'compare', 840,   +124, 'pos'],
                  ['acme github actions integration',         'feature', 620,   +96,  'pos'],
                  ['cheapest pm with ai',                     'price',   2100,  +180, 'neg'],
                  ['acme vs notion ai',                       'compare', 1280,  +88,  'neu'],
                  ['is acme worth it for a 10-person team',   'recommend',410,  +72,  'pos'],
                  ['pm tool that learns sprint patterns',     'feature', 290,   +64,  'neg'],
                ].map(([q,intent,vol,d,you],i) => (
                  <tr key={i}>
                    <td><b>{q}</b></td>
                    <td><Badge tone={intent==='compare'?'info':intent==='price'?'warn':intent==='feature'?'acc':'neu'}>{(intent as string).toUpperCase()}</Badge></td>
                    <td className="num"><b>{(vol as number).toLocaleString()}</b></td>
                    <td><Delta v={d as number}/></td>
                    <td>{you === 'pos' ? <Badge tone="pos">YES · 1st</Badge> : you === 'neg' ? <Badge tone="neg">MISSING</Badge> : <Badge tone="neu">MENTIONED</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <Card title="Prompt library" right={<span style={{display:'flex',gap:8}}><Pill>248 candidates</Pill><button className="btn-d">Refresh from AI</button></span>} padding={false}
          foot={<><span>Tip: select multiple rows to bulk-track them.</span><span>Volume estimates · indicative, calibrated by Livesov</span></>}>
          <table className="tbl">
            <thead><tr>
              <th><input type="checkbox"/></th>
              <th>PROMPT</th>
              <th>INTENT</th>
              <th>VOL / MO</th>
              <th>TREND</th>
              <th>DIFFICULTY</th>
              <th>YOU CURRENTLY</th>
              <th>OPPORTUNITY</th>
              <th className="right"></th>
            </tr></thead>
            <tbody>
              {[
                { q: 'best project management tool for engineering teams', intent:'recommend', v: 4200, t: 'up',   diff: 'high',   you: 'POS · 2/5', op: 'high' },
                { q: 'acme vs linear', intent:'compare', v: 2800, t: 'up',   diff: 'med',  you: 'POS · 1/3', op: 'med' },
                { q: 'cheapest pm tool with native AI',                    intent:'price',     v: 2100, t: 'up',   diff: 'med',    you: 'MISSING',   op: 'high' },
                { q: 'pm tool that integrates with github copilot',        intent:'feature',   v: 1640, t: 'up',   diff: 'low',    you: 'MISSING',   op: 'high' },
                { q: 'free alternative to monday.com',                     intent:'recommend', v: 1380, t: 'flat', diff: 'high',   you: 'POS · 4/5', op: 'low' },
                { q: 'pm for a 50-person startup',                         intent:'recommend', v: 1240, t: 'up',   diff: 'med',    you: 'POS · 3/5', op: 'med' },
                { q: 'acme pricing for nonprofits',                        intent:'price',     v: 760,  t: 'flat', diff: 'low',    you: 'NEG · stale', op: 'high' },
                { q: 'what does acme do better than jira',                 intent:'compare',   v: 690,  t: 'up',   diff: 'low',    you: 'POS · 1st', op: 'med' },
                { q: 'is acme good for product teams',                     intent:'recommend', v: 580,  t: 'up',   diff: 'med',    you: 'POS · 1st', op: 'low' },
                { q: 'acme api rate limits',                               intent:'feature',   v: 420,  t: 'flat', diff: 'low',    you: 'MISSING',   op: 'high' },
              ].map((r,i)=>(
                <tr key={i} onClick={()=>setDrawer(r)} style={{cursor:'pointer'}}>
                  <td><input type="checkbox" onClick={e=>e.stopPropagation()}/></td>
                  <td><b>{r.q}</b></td>
                  <td><Badge tone={r.intent==='compare'?'info':r.intent==='price'?'warn':r.intent==='feature'?'acc':'neu'}>{r.intent.toUpperCase()}</Badge></td>
                  <td className="num"><b>{r.v.toLocaleString()}</b></td>
                  <td><Spark data={[10,12,11,16,15,19,22,r.t==='up'?28:r.t==='flat'?22:18]} width={80} height={20} color={r.t==='up'?'var(--success)':r.t==='down'?'var(--danger)':'var(--mute)'} fill/></td>
                  <td><DiffDots level={r.diff}/></td>
                  <td>{r.you === 'MISSING' ? <Badge tone="neg">{r.you}</Badge> : r.you.startsWith('NEG') ? <Badge tone="warn">{r.you}</Badge> : <Badge tone="pos">{r.you}</Badge>}</td>
                  <td><OpScore level={r.op}/></td>
                  <td className="right"><button className="btn-d" style={{padding:'4px 8px',fontSize:11}} onClick={e=>e.stopPropagation()}>Track</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

      </div>

      {drawer && <PromptBrief item={drawer} onClose={()=>setDrawer(null)}/>}
    </>
  );
}

function DiffDots({ level }: any) {
  const n = level === 'high' ? 3 : level === 'med' ? 2 : 1;
  return (
    <span style={{display:'inline-flex',gap:3,alignItems:'center'}}>
      {[1,2,3].map(i => (
        <span key={i} style={{width:6,height:6,borderRadius:'50%',background: i<=n ? (level==='high'?'var(--danger)':level==='med'?'var(--warn)':'var(--success)') : 'var(--surface-3)'}}/>
      ))}
      <span className="mono" style={{fontSize:10,color:'var(--text-3)',marginLeft:4,letterSpacing:'0.06em'}}>{level.toUpperCase()}</span>
    </span>
  );
}
function OpScore({ level }: any) {
  const tone = level === 'high' ? 'pos' : level === 'med' ? 'info' : 'neu';
  return <Badge tone={tone}>{level === 'high' ? '★★★ HIGH' : level === 'med' ? '★★ MED' : '★ LOW'}</Badge>;
}

// Brief generator drawer
function PromptBrief({ item, onClose }: any) {
  return (
    <>
      <div className="drawer-bg" onClick={onClose}/>
      <aside className="drawer">
        <header className="drawer-h">
          <div>
            <div style={{fontWeight:600,fontSize:14}}>Brief generator</div>
            <div className="mono dim" style={{fontSize:11,marginTop:2}}>AI-optimized content brief · {item.intent} intent</div>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </header>
        <div className="drawer-b">
          <div className="eyebrow">PROMPT</div>
          <div style={{padding:'10px 12px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:6,margin:'8px 0 18px',fontFamily:'var(--mono)',fontSize:13.5,color:'var(--text)'}}>&ldquo;{item.q}&rdquo;</div>

          <div className="bg-stat-grid">
            <div className="bg-stat"><div className="eyebrow">VOLUME · MO</div><div className="bg-stat-v mono">{item.v.toLocaleString()}</div></div>
            <div className="bg-stat"><div className="eyebrow">DIFFICULTY</div><div className="bg-stat-v"><DiffDots level={item.diff}/></div></div>
            <div className="bg-stat"><div className="eyebrow">OPPORTUNITY</div><div className="bg-stat-v"><OpScore level={item.op}/></div></div>
          </div>

          <div className="eyebrow" style={{marginTop:18}}>WHO'S WINNING THIS PROMPT</div>
          <div style={{display:'grid',gap:8,margin:'10px 0 18px'}}>
            {[
              { b: 'Linear', sov: 42, eng: 5, c: 'var(--info)' },
              { b: 'Acme',   sov: 28, eng: 4, c: 'var(--primary)', me: true },
              { b: 'Asana',  sov: 14, eng: 3, c: 'var(--text-2)' },
              { b: 'Notion', sov: 9,  eng: 2, c: 'var(--mute)' },
            ].map((r,i) => (
              <div key={i} style={{display:'grid',gridTemplateColumns:'100px 1fr 40px 50px',gap:10,alignItems:'center',fontSize:12.5}}>
                <span style={{color: r.me?'var(--primary)':'var(--text)',fontWeight:r.me?600:500}}>{r.b}{r.me && ' (you)'}</span>
                <Bar value={r.sov} max={50}/>
                <span className="mono">{r.sov}%</span>
                <span className="mono dim">{r.eng}/5</span>
              </div>
            ))}
          </div>

          <div className="eyebrow">RECOMMENDED CONTENT BRIEF</div>
          <div className="brief">
            <div className="brief-item"><span className="brief-n mono">01</span><div><b>Create a comparison page:</b> "{item.q} - {item.intent === 'compare' ? 'honest review from a customer' : 'who actually wins'}"</div></div>
            <div className="brief-item"><span className="brief-n mono">02</span><div><b>Target word count:</b> 1,400–1,800 (median for cited PM-tool answers in this engine)</div></div>
            <div className="brief-item"><span className="brief-n mono">03</span><div><b>Required entities:</b> "agile", "GitHub", "AI summaries", "engineering teams", "pricing per seat"</div></div>
            <div className="brief-item"><span className="brief-n mono">04</span><div><b>Sources to cite back:</b> g2.com/products/acme, reddit.com/r/projectmanagement (Perplexity weights Reddit at 47%)</div></div>
            <div className="brief-item"><span className="brief-n mono">05</span><div><b>Schema:</b> add <code className="mono">SoftwareApplication</code> + <code className="mono">Offer</code> markup with current price</div></div>
            <div className="brief-item"><span className="brief-n mono">06</span><div><b>Est. impact:</b> <Delta v={+3.2} suffix=" pp SOV"/> within 30 days of publishing</div></div>
          </div>

          <div style={{display:'flex',gap:8,marginTop:18}}>
            <button className="btn-g">↗ Send to Linear</button>
            <button className="btn-g">⇣ Download brief</button>
            <button className="btn-p">Add to tracking</button>
          </div>
        </div>
      </aside>
    </>
  );
}

// ────────────────────────── AGENT ANALYTICS ──────────────────────────
export function PageAgentAnalytics() {
  const AGENTS = [
    { id: 'gptbot',     name: 'GPTBot',          owner: 'OpenAI',     ua: 'GPTBot/1.0',          c: 'var(--success)', visits: 4280, pages: 320 },
    { id: 'claudebot',  name: 'ClaudeBot',       owner: 'Anthropic',  ua: 'ClaudeBot/1.0',       c: '#C97B5E',        visits: 3120, pages: 280 },
    { id: 'gpt-user',   name: 'ChatGPT-User',    owner: 'OpenAI',     ua: 'ChatGPT-User/1.0',    c: '#10A37F',        visits: 2840, pages: 240 },
    { id: 'gemini',     name: 'Google-Extended', owner: 'Google',     ua: 'Google-Extended',     c: 'var(--info)',    visits: 1980, pages: 184 },
    { id: 'perplexity', name: 'PerplexityBot',   owner: 'Perplexity', ua: 'PerplexityBot/1.0',   c: '#20808D',        visits: 1640, pages: 156 },
    { id: 'oai-search', name: 'OAI-SearchBot',   owner: 'OpenAI',     ua: 'OAI-SearchBot/1.0',   c: 'var(--primary)', visits: 920,  pages: 88  },
    { id: 'cclaude',    name: 'Claude-Web',      owner: 'Anthropic',  ua: 'Claude-Web/1.0',      c: '#A75A40',        visits: 540,  pages: 64  },
    { id: 'bingbot',    name: 'Bingbot-AI',      owner: 'Microsoft',  ua: 'bingbot/2.0 +ai',     c: '#0078D4',        visits: 320,  pages: 48  },
  ];
  return (
    <>
      <PageHead title="Agent Analytics"
        sub="Every AI crawler that fetched a page on acme.com - what they read, when, and how often."
        actions={<><button className="btn-g">⇣ CSV</button><button className="btn-d">⚙ Crawler rules</button><button className="btn-p">Verify install</button></>}/>
      <div className="page-body">
        <KPIRail items={[
          { k: 'AGENT HITS · 7D',    v: '15,640', d: +18, info: '8 distinct bots' },
          { k: 'UNIQUE PAGES READ',  v: '486',    d: +42 },
          { k: 'TOP CRAWLER',        v: 'GPTBot', info: '27% of hits' },
          { k: 'ATTRIBUTED REFERRAL',v: '$12.4k', suffix: '', d: +24, info: 'est. AI-search revenue' },
          { k: 'BLOCKED HITS',       v: '14',     d: -3,  info: 'robots.txt' },
        ]}/>

        <Card title="Crawl volume · last 30 days" right={<><Pill>Hourly granularity</Pill><Seg value="visits" onChange={()=>{}} options={[{value:'visits',label:'VISITS'},{value:'pages',label:'UNIQUE PAGES'}]}/></>}>
          <LineChart height={240} xLabels={['','D-30','','D-23','','D-16','','D-9','','today']} valSuffix=""
            series={[
              { id: 'gptbot',    label: 'GPTBot',       color: 'var(--success)', cur: 4280, data: [180,210,280,260,310,340,380,420,460,500] },
              { id: 'claudebot', label: 'ClaudeBot',    color: '#C97B5E', cur: 3120, data: [120,140,180,200,220,250,280,310,340,370] },
              { id: 'gpt-user',  label: 'ChatGPT-User', color: '#10A37F', cur: 2840, data: [80,110,140,170,200,230,260,290,310,340] },
              { id: 'gemini',    label: 'Google-Ext',   color: 'var(--info)', cur: 1980, data: [60,80,100,120,140,160,180,200,220,240] },
              { id: 'perplexity',label: 'PerplexityBot',color: '#20808D', cur: 1640, fill: true, data: [40,60,80,100,120,140,160,180,200,220] },
            ]}/>
        </Card>

        <div className="g2">
          <Card title="Agents seen" padding={false}
            foot={<><span>{AGENTS.length} unique bots · 7 days</span><span>WHOIS verified</span></>}>
            <table className="tbl">
              <thead><tr><th>AGENT</th><th>OWNER</th><th>VISITS · 7D</th><th>PAGES</th><th className="right">TREND</th></tr></thead>
              <tbody>
                {AGENTS.map(a => (
                  <tr key={a.id}>
                    <td><span style={{display:'inline-flex',alignItems:'center',gap:10}}>
                      <span style={{width:24,height:24,borderRadius:5,background:a.c,display:'inline-flex',alignItems:'center',justifyContent:'center',color:'#fff',fontFamily:'var(--mono)',fontSize:9,fontWeight:700}}>{a.name.slice(0,3).toUpperCase()}</span>
                      <div><b>{a.name}</b><div className="mono dim" style={{fontSize:10}}>{a.ua}</div></div>
                    </span></td>
                    <td>{a.owner}</td>
                    <td className="num"><b>{a.visits.toLocaleString()}</b></td>
                    <td className="num">{a.pages}</td>
                    <td className="right"><Spark data={Array.from({length:10}).map((_,i)=> a.visits/12 + Math.sin(i*0.7)*30)} width={80} height={20} color={a.c}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="Top pages crawled" padding={false}
            right={<Pill tone="acc">+18% vs last week</Pill>}>
            <table className="tbl">
              <thead><tr><th>URL</th><th>READS</th><th>TOP AGENTS</th><th>LAST</th></tr></thead>
              <tbody>
                {[
                  ['/customers',           1240, ['GPTBot','ClaudeBot','PerplexityBot'], '2m'],
                  ['/pricing',             1080, ['GPTBot','ChatGPT-User','PerplexityBot'], '4m'],
                  ['/integrations/github', 740,  ['ClaudeBot','GPTBot','Google-Ext'],     '11m'],
                  ['/ai-assist',           620,  ['ChatGPT-User','GPTBot','ClaudeBot'],   '14m'],
                  ['/blog/agile',          410,  ['GPTBot','PerplexityBot','Google-Ext'], '22m'],
                  ['/changelog',           280,  ['ClaudeBot','OAI-SearchBot'],           '38m'],
                ].map(([u,r,bots,t],i) => (
                  <tr key={i}>
                    <td><Cit url={'acme.com' + u}/></td>
                    <td className="num"><b>{(r as number).toLocaleString()}</b></td>
                    <td>{(bots as string[]).slice(0,3).map((b,j) => <span key={j} className="mono" style={{fontSize:10,padding:'2px 6px',borderRadius:3,background:'var(--surface-2)',color:'var(--text-2)',border:'1px solid var(--line)',marginRight:4}}>{b}</span>)}</td>
                    <td className="mono dim">{t}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="Hour × Agent heatmap" right={<span className="mono dim" style={{fontSize:11}}>UTC · LAST 7 DAYS</span>}>
            <Heatmap
              rows={AGENTS.slice(0,6).map(a => a.name)}
              cols={['0','3','6','9','12','15','18','21']}
              data={AGENTS.slice(0,6).map((_,i) => [0.2,0.3,0.5,0.7,0.9,0.6,0.4,0.3].map((v,j) => Math.max(0.05, Math.min(1, v + Math.sin(i+j*0.5)*0.2))))}
              label="Darker = higher crawl frequency. Use this to time content publishes."
            />
          </Card>

          <Card title="AI search attribution" right={<Pill tone="acc">Beta</Pill>}>
            <div className="quiet" style={{fontSize:13,margin:'0 0 14px',lineHeight:1.5}}>When a visitor lands on acme.com after an AI-search session - we attribute it back to the bot that read the page first.</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <KPIInline k="ATTRIBUTED SESSIONS" v="2,840" d={+24}/>
              <KPIInline k="ATTRIBUTED REVENUE" v="$12,420" d={+18}/>
              <KPIInline k="CONV. RATE" v="4.2%" d={+0.4}/>
              <KPIInline k="AVG. ORDER" v="$4.37" d={+0.12}/>
            </div>
            <button className="btn-g" style={{marginTop:14,width:'100%',justifyContent:'center'}}>Configure GA4 / Segment</button>
          </Card>
        </div>

        <Card title="robots.txt & crawler controls" right={<Pill>Currently allow-listing 5 bots</Pill>}>
          <div className="rb-grid">
            {AGENTS.map(a => (
              <div key={a.id} className="rb-row">
                <span style={{width:22,height:22,borderRadius:4,background:a.c,display:'inline-flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:9,fontFamily:'var(--mono)',fontWeight:700}}>{a.name.slice(0,3).toUpperCase()}</span>
                <span style={{flex:1,fontSize:12.5,fontWeight:500}}>{a.name}</span>
                <span className="mono dim" style={{fontSize:11}}>{a.owner}</span>
                <Seg value={['gptbot','claudebot','gpt-user','gemini','perplexity'].includes(a.id) ? 'allow' : 'block'} onChange={()=>{}} options={[{value:'allow',label:'ALLOW'},{value:'block',label:'BLOCK'}]}/>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function KPIInline({ k, v, d }: any) {
  return (
    <div style={{padding:'12px 14px',border:'1px solid var(--line)',borderRadius:6,background:'var(--surface-2)'}}>
      <div className="eyebrow">{k}</div>
      <div className="mono" style={{fontSize:20,fontWeight:600,marginTop:4,letterSpacing:'-0.02em'}}>{v}</div>
      {d != null && <div style={{marginTop:4}}><Delta v={d}/></div>}
    </div>
  );
}
