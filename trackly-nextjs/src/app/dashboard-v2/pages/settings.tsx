'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { PLATFORMS, PlatformTile, Badge, Bar, Card, PageHead, Filter, Seg, Pill, KPIRail, Donut, Cit, Info } from '../ui';

export function PageSetup() {
  const [tab, setTab] = React.useState('brand');
  return (
    <>
      <PageHead title="Brand Setup" sub="Acme PM · everything Livesov knows about your brand. Keep this current."
        actions={<><button className="btn-d">⇣ Export config</button><button className="btn-p">Save changes</button></>}/>
      <div className="page-body">
        <Seg value={tab} onChange={setTab} options={[
          {value:'brand',label:'BRAND'},
          {value:'comps',label:'COMPETITORS'},
          {value:'aliases',label:'ALIASES'},
          {value:'pages',label:'KEY PAGES'},
          {value:'webhooks',label:'WEBHOOKS'},
        ]}/>

        {tab === 'brand' && (
          <div className="g2">
            <Card title="Identity">
              <Field label="BRAND NAME" v="Acme PM" />
              <Field label="DOMAIN" v="acme.com" mono/>
              <Field label="CATEGORY" v="Project management software" />
              <Field label="ONE-LINER" v="Project management for engineering teams that doesn't suck." />
              <Field label="FOUNDED" v="2019" mono/>
              <Field label="HQ" v="San Francisco, CA" />
            </Card>
            <Card title="What buyers ask">
              <p className="quiet" style={{fontSize:13,margin:'0 0 12px',lineHeight:1.5}}>Tags help us seed prompts and detect intent in answers. Keep them tight.</p>
              <div className="tag-grid">
                {['project management','agile','scrum','kanban','engineering teams','AI summaries','GitHub integration','sprints','roadmapping','startup tools'].map(t => (
                  <span key={t} className="ttag mono">{t} <span className="x">×</span></span>
                ))}
                <span className="ttag mono add">+ Add tag</span>
              </div>
            </Card>
            <Card title="Brand voice" right={<Badge tone="info">AI-tuned</Badge>}>
              <div className="voice-grid">
                <Voice k="TONE" v="direct, technical, dry-witty"/>
                <Voice k="AVOID" v="hype, vague metaphors, 'revolutionize'"/>
                <Voice k="POV"  v="we / your"/>
                <Voice k="EMOJI" v="never"/>
              </div>
            </Card>
            <Card title="Auto-run">
              <Field label="SCHEDULE" v="Hourly · 24×/day"/>
              <Field label="REGION" v="Global (US EN)"/>
              <Field label="ENGINES" v="5 / 5 enabled"/>
              <Field label="LAST RUN" v="2 minutes ago" mono/>
              <div style={{display:'flex',gap:8,marginTop:8}}>
                <button className="btn-d">Pause auto-run</button>
                <button className="btn-g">Change schedule</button>
              </div>
            </Card>
          </div>
        )}

        {tab === 'comps' && (
          <Card title="Competitors" right={<button className="btn-d">+ Add</button>} padding={false}>
            <table className="tbl">
              <thead><tr><th>BRAND</th><th>DOMAIN</th><th>CATEGORY</th><th>TRACKING</th><th>ALIASES</th><th></th></tr></thead>
              <tbody>
                {['Linear','Asana','Monday.com','Notion','Jira','ClickUp','Trello'].map(n => (
                  <tr key={n}><td><b>{n}</b></td><td className="mono dim">{n.toLowerCase().replace('.com','')}.com</td><td>PM software</td><td><Badge tone="pos">ACTIVE</Badge></td><td className="num dim">3</td><td className="right"><button className="btn-d" style={{padding:'4px 8px',fontSize:11}}>Edit</button></td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {tab === 'aliases' && (
          <Card title="Brand aliases & misspellings">
            <p className="quiet" style={{margin:'0 0 16px',fontSize:13}}>If an engine says "Acmee" or "Acme Project", we count it. Add anything buyers might write.</p>
            <div className="tag-grid">
              {['Acme', 'Acme PM', 'AcmePM', 'Acmee', 'acme.com', 'AcmeProject', 'Acme app'].map(t => (
                <span key={t} className="ttag mono">{t} <span className="x">×</span></span>
              ))}
              <span className="ttag mono add">+ Add alias</span>
            </div>
          </Card>
        )}

        {tab === 'pages' && (
          <Card title="Key pages Livesov should reward when cited" padding={false}>
            <table className="tbl">
              <thead><tr><th>URL</th><th>PURPOSE</th><th>CITED · 7D</th><th></th></tr></thead>
              <tbody>
                {[
                  ['acme.com/customers','Logos & case studies', 214],
                  ['acme.com/pricing','Pricing detail', 182],
                  ['acme.com/blog/agile','Thought leadership', 54],
                  ['acme.com/integrations/github','GitHub integration page', 18],
                  ['acme.com/ai-assist','AI features page', 26],
                ].map(([u,p,n]) => (
                  <tr key={String(u)}><td><Cit url={String(u)}/></td><td>{p}</td><td className="num"><b>{n}</b></td><td className="right"><button className="btn-d" style={{padding:'4px 8px',fontSize:11}}>Remove</button></td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {tab === 'webhooks' && (
          <Card title="Webhooks">
            <p className="quiet" style={{margin:'0 0 16px',fontSize:13}}>Forward every run, mention, and hallucination to your stack.</p>
            <Field label="URL" v="https://hooks.acme.dev/livesov" mono/>
            <Field label="SECRET" v="lvs_••••••••••••" mono/>
            <Field label="EVENTS" v="run.complete, mention.new, halluc.detected"/>
            <Field label="LAST DELIVERY" v="200 OK · 12 min ago" mono/>
            <div style={{display:'flex',gap:8}}>
              <button className="btn-d">Test delivery</button>
              <button className="btn-d btn-danger">Rotate secret</button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

function Field({ label, v, mono }: any) {
  return (
    <div className="fld">
      <div className="eyebrow">{label}</div>
      <input className={"fld-in" + (mono ? ' mono' : '')} defaultValue={v}/>
    </div>
  );
}
function Voice({ k, v }: any) {
  return <div className="voice"><div className="eyebrow">{k}</div><div style={{fontSize:13,color:'var(--text)',marginTop:4}}>{v}</div></div>;
}

// ───────────────────────── TRACKED PROMPTS ─────────────────────────
export function PagePrompts() {
  return (
    <>
      <PageHead title="Tracked Prompts" sub="142 of 250 in your plan. Buyer-intent questions Livesov runs against the 5 engines, every hour."
        actions={<><button className="btn-d">⇣ Import CSV</button><button className="btn-g">↻ Re-seed from category</button><button className="btn-p">+ Add prompt</button></>}/>
      <div className="page-body">
        <KPIRail items={[
          { k: 'TRACKED', v: '142', info: 'of 250' },
          { k: 'PRIORITY', v: '24', info: '★ pinned' },
          { k: 'BY INTENT · COMPARE', v: '38', info: 'vs queries' },
          { k: 'BY INTENT · PRICE', v: '21' },
          { k: 'AVG SOV', v: '24.6', suffix: '%' },
        ]}/>

        <Filter>
          <div className="search-box"><span className="dim mono">⌕</span><input placeholder="Find a prompt…" defaultValue=""/></div>
          <Seg value="all" onChange={()=>{}} options={[{value:'all',label:'ALL'},{value:'priority',label:'★ PRIORITY'},{value:'paused',label:'PAUSED'}]}/>
          <select className="sel"><option>All intents</option><option>Comparison</option><option>Pricing</option><option>Recommendation</option><option>Feature</option><option>Brand</option></select>
          <select className="sel"><option>All tags</option></select>
          <span style={{flex:1}}/>
          <Pill>250 plan limit · 108 left</Pill>
        </Filter>

        <Card padding={false}>
          <table className="tbl">
            <thead><tr>
              <th><input type="checkbox"/></th>
              <th>PROMPT</th>
              <th>INTENT</th>
              <th>TAGS</th>
              <th>SCHEDULE</th>
              <th>SOV</th>
              <th>STATUS</th>
              <th className="right"></th>
            </tr></thead>
            <tbody>
              {[
                ['best project management tool for engineering teams','compare','agile, eng', 'hourly', 38, 'priority'],
                ['acme vs linear','compare','head-to-head', 'hourly', 61, 'priority'],
                ['acme vs notion','compare','head-to-head', 'hourly', 44, 'priority'],
                ['pm tools with native AI features','feature','ai', 'hourly', 24, 'tracking'],
                ['cheapest project management for startups','price','startup', 'daily', 12, 'losing'],
                ['acme pricing for 50 seats','price','enterprise', 'daily', 18, 'tracking'],
                ['is acme worth the price','recommend','perception', 'daily', 44, 'tracking'],
                ['pm tool with github integration','feature','dev', 'hourly', 32, 'tracking'],
                ['free alternative to monday.com','recommend','free', 'daily', 8, 'losing'],
                ['best pm for product teams','recommend','product', 'hourly', 32, 'tracking'],
              ].map(([q,intent,tags,sched,sov,status],i) => (
                <tr key={i}>
                  <td><input type="checkbox"/></td>
                  <td><span style={{display:'inline-flex',alignItems:'center',gap:6}}>{(status === 'priority') && <span style={{color:'var(--accent)'}}>★</span>}<b>{q}</b></span></td>
                  <td><Badge tone={intent === 'compare' ? 'info' : intent === 'price' ? 'warn' : intent === 'feature' ? 'acc' : 'neu'}>{String(intent).toUpperCase()}</Badge></td>
                  <td className="mono dim" style={{fontSize:11}}>{tags}</td>
                  <td className="mono">{sched}</td>
                  <td className="num"><b>{sov}%</b></td>
                  <td><Badge tone={status === 'priority' ? 'acc' : status === 'losing' ? 'neg' : 'neu'}>{String(status).toUpperCase()}</Badge></td>
                  <td className="right"><span style={{display:'inline-flex',gap:4}}><button className="btn-d" style={{padding:'3px 7px',fontSize:11}}>Edit</button><button className="btn-d" style={{padding:'3px 7px',fontSize:11}}>Pause</button></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

// ─────────────────────────── ACCOUNT ───────────────────────────
export function PageAccount() {
  return (
    <>
      <PageHead title="Account & Plan" sub="Nikhil S. · Team plan · seats, integrations, API keys, security."
        actions={<button className="btn-p">Manage plan</button>}/>
      <div className="page-body">
        <div className="g3">
          <Card title="Current plan" right={<Badge tone="acc">TEAM</Badge>}>
            <div className="kpi-v mono" style={{fontSize:32}}>$29<i>/mo</i></div>
            <div className="quiet" style={{fontSize:13,margin:'6px 0 14px'}}>Renews May 19, 2026 · annual save 20%</div>
            <ul className="plan-feat">
              <li><b>2,000</b> queries / day</li>
              <li>All <b>5</b> engines</li>
              <li><b>10</b> competitors per brand</li>
              <li>Hallucination detection</li>
              <li><b>3</b> seats · 1 used</li>
              <li>Webhook + API</li>
            </ul>
            <div style={{display:'flex',gap:8,marginTop:14}}>
              <button className="btn-d">Downgrade</button>
              <button className="btn-p">Upgrade to Scale</button>
            </div>
          </Card>

          <Card title="Usage this period" right={<span className="mono dim" style={{fontSize:11}}>RESETS IN 13D</span>}>
            <UseRow k="Queries / day" cur={1284} max={2000}/>
            <UseRow k="Brands tracked" cur={3} max={5}/>
            <UseRow k="Tracked prompts" cur={142} max={250}/>
            <UseRow k="Competitors" cur={8} max={10}/>
            <UseRow k="Seats" cur={1} max={3}/>
          </Card>

          <Card title="Seats" right={<button className="btn-d">+ Invite</button>} padding={false}>
            <ul className="seat-list">
              <li><span className="av">N</span><div><b>Nikhil S.</b><div className="mono dim" style={{fontSize:11}}>nikhil@acme.com</div></div><Badge tone="acc">OWNER</Badge></li>
              <li className="empty">+ Open seat</li>
              <li className="empty">+ Open seat</li>
            </ul>
          </Card>
        </div>

        <Card title="API keys" right={<button className="btn-d">+ New key</button>} padding={false}>
          <table className="tbl">
            <thead><tr><th>NAME</th><th>KEY</th><th>CREATED</th><th>LAST USED</th><th>SCOPES</th><th></th></tr></thead>
            <tbody>
              <tr><td><b>Production</b></td><td className="mono">lvs_prod_••••••••••••3F8a</td><td className="num">Mar 12, 2026</td><td className="num">12 min ago</td><td><Badge tone="acc">READ</Badge> <Badge tone="info">WRITE</Badge></td><td className="right"><button className="btn-d btn-danger" style={{padding:'4px 8px',fontSize:11}}>Revoke</button></td></tr>
              <tr><td><b>Staging</b></td><td className="mono">lvs_stage_••••••••••••a01b</td><td className="num">Apr 02, 2026</td><td className="num">4h ago</td><td><Badge tone="acc">READ</Badge></td><td className="right"><button className="btn-d btn-danger" style={{padding:'4px 8px',fontSize:11}}>Revoke</button></td></tr>
            </tbody>
          </table>
        </Card>

        <div className="g2">
          <Card title="Integrations" padding={false}>
            <ul className="int-list">
              {[
                { n: 'Slack',   d: 'Post alerts to #brand', on: true },
                { n: 'Linear',  d: 'Send recommendations as issues', on: true },
                { n: 'Webhook', d: 'POST every run', on: true },
                { n: 'Resend',  d: 'Weekly digest email', on: false },
                { n: 'Zapier',  d: 'Trigger zaps on hallucination', on: false },
              ].map(it => (
                <li key={it.n}>
                  <div className="int-mark mono">{it.n[0]}</div>
                  <div><b>{it.n}</b><div className="quiet" style={{fontSize:11.5,marginTop:2}}>{it.d}</div></div>
                  <Badge tone={it.on ? 'pos' : 'neu'}>{it.on ? 'CONNECTED' : 'CONNECT'}</Badge>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Security">
            <Field label="EMAIL" v="nikhil@acme.com"/>
            <Field label="PASSWORD" v="••••••••••" mono/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:12}}>
              <div>
                <div className="eyebrow">2FA</div>
                <div style={{fontSize:13,marginTop:4}}>Authenticator app · <span className="pos">enabled</span></div>
              </div>
              <div>
                <div className="eyebrow">SSO</div>
                <div style={{fontSize:13,marginTop:4}}>Available on Scale plan</div>
              </div>
            </div>
            <div style={{display:'flex',gap:8,marginTop:14}}>
              <button className="btn-d">Sign out everywhere</button>
              <button className="btn-d btn-danger">Delete account</button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function UseRow({ k, cur, max }: any) {
  const pct = (cur / max) * 100;
  return (
    <div style={{display:'grid',gap:6,padding:'8px 0'}}>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:12.5}}>
        <span style={{color:'var(--text-2)'}}>{k}</span>
        <span className="mono"><b>{cur.toLocaleString()}</b> <span className="dim">/ {max.toLocaleString()}</span></span>
      </div>
      <Bar value={pct}/>
    </div>
  );
}

// ─────────────────────────── BILLING ───────────────────────────
function UsageMeter({ label, used, limit, unit = '', sub, info }: any) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const tone = pct >= 90 ? 'danger' : pct >= 75 ? 'warn' : 'ok';
  return (
    <div className="umeter">
      <div className="um-top">
        <span className="um-label">{label}{info && <Info>{info}</Info>}</span>
        <span className="um-val mono"><b>{used.toLocaleString()}</b><span className="dim"> / {limit.toLocaleString()}{unit}</span></span>
      </div>
      <div className={"um-track um-" + tone}><i style={{ width: pct + '%' }}/></div>
      <div className="um-sub">{sub || `${pct}% used`}{pct >= 90 && <span className="um-warn"> · approaching limit</span>}</div>
    </div>
  );
}

export function PageBilling() {
  const engineRuns = PLATFORMS.map((p, i) => ({ p, runs: 20 - i * 2.4 }));
  const maxRuns = Math.max(...engineRuns.map(e => e.runs));
  const invoices = [
    ['LVS-0023','May 19, 2026','May 19 – Jun 19','Team',  '$29.00'],
    ['LVS-0022','Apr 19, 2026','Apr 19 – May 19','Team',  '$29.00'],
    ['LVS-0021','Mar 19, 2026','Mar 19 – Apr 19','Team',  '$29.00'],
    ['LVS-0020','Feb 19, 2026','Feb 19 – Mar 19','Solo',  '$9.00'],
    ['LVS-0019','Jan 19, 2026','Jan 19 – Feb 19','Solo',  '$9.00'],
  ];
  return (
    <>
      <PageHead title="Billing & Usage" sub="Your plan, what you've used this cycle, and every invoice - all in one place."
        actions={<><button className="btn-d">Manage plan</button><button className="btn-g">⇣ Download all invoices</button></>}/>
      <div className="page-body">

        {/* Plan + spend header */}
        <section className="bill-head">
          <div className="bh-plan">
            <div className="eyebrow">CURRENT PLAN</div>
            <div className="bh-name">Team <Badge tone="pos">ACTIVE</Badge></div>
            <div className="bh-price"><span className="mono">$29</span><i>/ month</i></div>
            <div className="bh-renew">Billed monthly · renews <b>Jun 19, 2026</b></div>
            <div className="bh-actions">
              <button className="btn-p">Change plan</button>
              <button className="btn-g">Cancel plan</button>
            </div>
            <ul className="bh-feats">
              <li>2,000 queries / day</li>
              <li>5 AI engines</li>
              <li>10 competitors</li>
              <li>3 team seats</li>
              <li>Hallucination alerts</li>
              <li>Webhook + API</li>
            </ul>
          </div>

          <div className="bh-spend">
            <div className="eyebrow" style={{padding:'2px 0 2px'}}>SPEND</div>
            <div className="bhs-row">
              <span className="bhs-label">This billing period</span>
              <span className="bhs-v mono">$29.00</span>
            </div>
            <div className="bhs-meta mono">May 19 – Jun 19, 2026</div>
            <div className="bhs-row">
              <span className="bhs-label">Year to date</span>
              <span className="bhs-v mono">$145.00</span>
            </div>
            <div className="bhs-meta mono">5 invoices · 2026</div>
            <div className="bhs-row">
              <span className="bhs-label">Next invoice</span>
              <span className="bhs-v mono">$29.00</span>
            </div>
            <div className="bhs-meta mono">due Jun 19, 2026</div>
            <div className="bhs-pay">
              <span className="bhs-card mono">•••• 4242</span>
              <span className="dim mono" style={{fontSize:11}}>Visa · exp 11/29</span>
            </div>
          </div>
        </section>

        {/* Usage this period */}
        <Card title="Usage this period"
          lede="How much of your Team plan you've used since the cycle began. Everything resets at renewal."
          right={<Pill tone="acc"><span className="pulse"/> resets in 21 days</Pill>}>
          <div className="bill-usage">
            <div className="bu-ring">
              <Donut value={64} size={150} label="OF DAILY LIMIT" color="var(--accent)"/>
              <div className="bu-ring-sub">
                <div className="mono"><b>1,284</b> of 2,000 queries today</div>
                <div className="dim mono" style={{fontSize:11,marginTop:3}}>≈ 1,310 / day projected · within plan</div>
              </div>
            </div>
            <div className="bu-meters">
              <UsageMeter label="Daily queries" used={1284} limit={2000} sub="64% of today's allowance" info="Each question we send to an AI engine counts as one query. Your plan allows 2,000 per day."/>
              <UsageMeter label="Competitors tracked" used={8} limit={10}/>
              <UsageMeter label="Team seats" used={2} limit={3}/>
              <UsageMeter label="Tracked prompts" used={142} limit={200}/>
            </div>
          </div>
        </Card>

        {/* Queries by engine */}
        <Card title="Queries by engine · this period" info="engine"
          lede="Where your query budget went - totals run against each AI engine this cycle."
          right={<span className="mono dim" style={{fontSize:11}}>76.0k TOTAL RUNS</span>}>
          <div className="bill-engines">
            {engineRuns.map(({ p, runs }) => (
              <div key={p.id} style={{display:'grid',gap:8}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{display:'inline-flex',alignItems:'center',gap:8,fontSize:13}}><PlatformTile p={p} size={22}/> {p.name}</span>
                  <span className="mono" style={{fontSize:12.5}}><b>{runs.toFixed(1)}k</b> <span className="dim">runs</span></span>
                </div>
                <Bar value={runs} max={maxRuns}/>
              </div>
            ))}
          </div>
        </Card>

        {/* Invoices */}
        <Card title="Invoice history" info="audit"
          lede="Every charge so far. Download any invoice as a PDF for your records."
          padding={false}>
          <table className="tbl">
            <thead><tr><th>INVOICE</th><th>DATE</th><th>PERIOD</th><th>PLAN</th><th className="right">AMOUNT</th><th>STATUS</th><th className="right"></th></tr></thead>
            <tbody>
              {invoices.map(([id,date,period,plan,amt],i) => (
                <tr key={i}>
                  <td className="mono"><b>{id}</b></td>
                  <td className="num">{date}</td>
                  <td className="mono dim">{period}</td>
                  <td>{plan}</td>
                  <td className="right num"><b>{amt}</b></td>
                  <td><Badge tone="pos">PAID</Badge></td>
                  <td className="right"><button className="btn-d" style={{padding:'4px 9px',fontSize:11}}>⇣ PDF</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* Payment method */}
        <Card title="Payment method" lede="The card we charge each billing cycle.">
          <div className="bill-pay">
            <div className="card-chip">
              <div className="cc-band"/>
              <div className="mono cc-no">•••• •••• •••• 4242</div>
              <div className="mono cc-meta"><span>VISA</span><span>11/29</span></div>
            </div>
            <div className="bill-pay-info">
              <div style={{fontSize:13,color:'var(--text)',fontWeight:500}}>Nikhil S.</div>
              <div className="quiet" style={{fontSize:12.5,marginTop:2}}>billing@acme.com</div>
              <div className="mono dim" style={{fontSize:11,marginTop:6}}>Added Mar 12, 2026 · default card</div>
              <div style={{display:'flex',gap:8,marginTop:14}}>
                <button className="btn-g">Update card</button>
                <button className="btn-d">Add backup card</button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

// ──────────────────────────── ALERTS ────────────────────────────
export function PageAlerts() {
  const rules = [
    { t: 'SOV drop > 5pp on any engine', ch: 'Slack #brand · Email', s: true,  hist: 2 },
    { t: 'Hallucination detected',        ch: 'Slack #brand · Linear ticket', s: true, hist: 6 },
    { t: 'Competitor overtakes Acme on priority query', ch: 'Email · Webhook', s: true,  hist: 1 },
    { t: 'New engine cites our domain',   ch: 'Email weekly digest', s: false, hist: 0 },
    { t: 'Run failure',                   ch: 'Webhook',          s: true, hist: 0 },
    { t: 'Auto-run skipped (rate limit)', ch: 'Email',            s: false, hist: 4 },
  ];
  return (
    <>
      <PageHead title="Alerts" sub="When something changes in your brand's AI visibility, we tell you. Set thresholds and channels."
        actions={<><button className="btn-d">Test alert</button><button className="btn-p">+ New rule</button></>}/>
      <div className="page-body">
        <KPIRail items={[
          { k: 'RULES ACTIVE', v: '4', info: 'of 6' },
          { k: 'FIRED · 7D', v: '13', d: +5 },
          { k: 'AVG. TIME TO FIRE', v: '14m', d: -3 },
          { k: 'CHANNELS', v: '3', info: 'Slack · Email · Webhook' },
          { k: 'QUIET HOURS', v: '22 – 7', info: 'PT' },
        ]}/>

        <div className="g2">
          <Card title="Alert rules" right={<button className="btn-d" style={{fontSize:11}}>+ Add</button>} padding={false} style={{ gridColumn: 'span 2' }}>
            <table className="tbl">
              <thead><tr><th>WHEN</th><th>CHANNELS</th><th>FIRED · 7D</th><th>STATUS</th><th className="right"></th></tr></thead>
              <tbody>
                {rules.map((r,i) => (
                  <tr key={i}>
                    <td><b>{r.t}</b></td>
                    <td className="mono dim">{r.ch}</td>
                    <td className="num"><b>{r.hist}</b></td>
                    <td><Badge tone={r.s ? 'pos' : 'neu'}>{r.s ? 'ON' : 'OFF'}</Badge></td>
                    <td className="right">
                      <button className="btn-d" style={{padding:'3px 7px',fontSize:11,marginRight:4}}>Edit</button>
                      <button className="btn-d" style={{padding:'3px 7px',fontSize:11}}>{r.s ? 'Pause' : 'Resume'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="Recent activity" padding={false}>
            <ul className="alert-feed">
              {[
                { t: 'SOV drop 6.4pp on Gemini', meta: 'Triggered → Slack', tone: 'neg', when: '12m' },
                { t: 'Hallucination · acme pricing', meta: 'Triggered → Linear ticket #2841', tone: 'warn', when: '54m' },
                { t: 'Linear overtook Acme on "acme alternatives"', meta: 'Triggered → Email', tone: 'warn', when: '2h' },
                { t: 'Hallucination · "no AI features"', meta: 'Triggered → Slack', tone: 'warn', when: '4h' },
                { t: 'Run failure · Grok 429', meta: 'Auto-retried, succeeded 11m later', tone: 'neu', when: '5h' },
              ].map((a,i) => (
                <li key={i}><span className={"dot " + a.tone}/><div><div style={{fontSize:13,color:'var(--text)'}}>{a.t}</div><div className="mono dim" style={{fontSize:11,marginTop:2}}>{a.meta}</div></div><span className="mono dim" style={{fontSize:11}}>{a.when}</span></li>
              ))}
            </ul>
          </Card>

          <Card title="Channels">
            <div className="chan">
              <div className="chan-row">
                <div className="chan-l">
                  <span className="chan-i" style={{background:'#5865F2'}}>S</span>
                  <div><b>Slack</b><div className="quiet" style={{fontSize:11}}>#brand-livesov · acme.slack.com</div></div>
                </div>
                <Badge tone="pos">CONNECTED</Badge>
              </div>
              <div className="chan-row">
                <div className="chan-l">
                  <span className="chan-i" style={{background:'#1F8A5B'}}>L</span>
                  <div><b>Linear</b><div className="quiet" style={{fontSize:11}}>Project · GEO recommendations</div></div>
                </div>
                <Badge tone="pos">CONNECTED</Badge>
              </div>
              <div className="chan-row">
                <div className="chan-l">
                  <span className="chan-i" style={{background:'var(--mute-2)'}}>@</span>
                  <div><b>Email</b><div className="quiet" style={{fontSize:11}}>nikhil@acme.com · weekly digest on</div></div>
                </div>
                <Badge tone="pos">ON</Badge>
              </div>
              <div className="chan-row">
                <div className="chan-l">
                  <span className="chan-i" style={{background:'var(--surface-3)'}}>↗</span>
                  <div><b>Webhook</b><div className="quiet mono" style={{fontSize:11}}>hooks.acme.dev/livesov</div></div>
                </div>
                <Badge tone="pos">CONNECTED</Badge>
              </div>
              <button className="btn-d" style={{justifySelf:'flex-start',marginTop:4}}>+ Add channel</button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
