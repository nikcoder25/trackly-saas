'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { PLATFORMS, PlatformTile, Badge, Delta, Bar, Card, PageHead, Filter, Seg, Pill, KPIRail, Donut } from '../ui';

// ────────────────────────── GEO AUDIT ──────────────────────────
export function PageGeoAudit() {
  return (
    <>
      <PageHead title="GEO Audit" sub="On-demand snapshot of how Acme performs across all 5 engines. Use it for board decks or weekly stand-ups."
        actions={<><button className="btn-d">Audit history</button><button className="btn-p">▶ Run new audit</button></>}/>
      <div className="page-body">
        <Card title="New audit" right={<Pill>Free on Team plan · 4/10 used this month</Pill>}>
          <div className="audit-form">
            <div className="aud-field">
              <label className="eyebrow">DOMAIN</label>
              <div style={{display:'flex',gap:0,alignItems:'stretch'}}>
                <span className="mono" style={{padding:'10px 12px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRight:'0',borderTopLeftRadius:5,borderBottomLeftRadius:5,color:'var(--mute)',fontSize:13}}>https://</span>
                <input className="aud-input" defaultValue="acme.com" style={{borderTopLeftRadius:0,borderBottomLeftRadius:0}}/>
              </div>
            </div>
            <div className="aud-field">
              <label className="eyebrow">QUERIES</label>
              <Seg value="seeded" onChange={()=>{}} options={[{value:'seeded',label:'50 SEEDED'},{value:'tracked',label:'YOUR 142 PROMPTS'},{value:'custom',label:'CUSTOM LIST'}]}/>
            </div>
            <div className="aud-field">
              <label className="eyebrow">ENGINES</label>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {PLATFORMS.map(p => (
                  <label key={p.id} className="aud-eng"><input type="checkbox" defaultChecked/><PlatformTile p={p} size={20}/>{p.name}</label>
                ))}
              </div>
            </div>
            <div className="aud-field">
              <label className="eyebrow">REGION</label>
              <select className="sel" style={{width:'100%'}}><option>Global (US English)</option><option>UK</option><option>Germany</option><option>Brazil</option><option>India</option></select>
            </div>
            <div className="aud-cta">
              <span className="mono dim" style={{fontSize:11}}>≈ 90 SECONDS · 50 QUERIES × 5 ENGINES = 250 RUNS</span>
              <button className="btn-p" style={{padding:'10px 18px'}}>▶ Start audit</button>
            </div>
          </div>
        </Card>

        <Card title="Latest audit · ran 4h ago" right={<><Badge tone="acc">SOV 27.4%</Badge><Pill>50 queries · 5 engines · 1m 32s</Pill></>}>
          <div className="aud-summary">
            <div className="aud-num">
              <Donut value={27.4} size={140} label="OVERALL SOV"/>
              <div style={{marginTop:14,fontSize:11,color:'var(--mute)',textAlign:'center',fontFamily:'var(--mono)'}}>vs Top 3 competitors</div>
            </div>
            <div style={{display:'grid',gap:14,flex:1}}>
              <div className="audit-finds">
                <Find ok>Acme appears in <b>38 of 50</b> queries (76% coverage)</Find>
                <Find ok>Wins position 1–3 in <b>22 of 38</b> appearances</Find>
                <Find warn>Hallucinated pricing detected in <b>2 of 50</b> answers</Find>
                <Find bad>Missed entirely on <b>12 of 50</b> queries (mostly long-tail)</Find>
              </div>
              <div className="audit-by-engine">
                {PLATFORMS.map(p => (
                  <div key={p.id} style={{display:'grid',gap:6}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{display:'inline-flex',alignItems:'center',gap:8,fontSize:12}}><PlatformTile p={p} size={20}/>{p.name}</span>
                      <span className="mono"><b>{p.sov}%</b></span>
                    </div>
                    <Bar value={p.sov} max={45}/>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

function Find({ ok, warn, bad, children }: any) {
  const tone = ok ? 'pos' : bad ? 'neg' : 'warn';
  const sym = ok ? '✓' : bad ? '✗' : '⚠';
  return (
    <div className="find">
      <span className={"find-sym " + tone}>{sym}</span>
      <span>{children}</span>
    </div>
  );
}

// ─────────────────────────── REGIONAL ───────────────────────────
export function PageRegional() {
  const regions = [
    { c: 'US', flag: '★', name: 'United States · EN', sov: 27.4, d: +4.2, ok: true },
    { c: 'GB', flag: '✦', name: 'United Kingdom · EN', sov: 24.1, d: +2.1, ok: true },
    { c: 'CA', flag: '✦', name: 'Canada · EN/FR',       sov: 22.8, d: +1.4, ok: true },
    { c: 'AU', flag: '✦', name: 'Australia · EN',       sov: 19.2, d: +0.6, ok: true },
    { c: 'DE', flag: '◆', name: 'Germany · DE',         sov: 14.6, d: -0.8, ok: true },
    { c: 'FR', flag: '◆', name: 'France · FR',          sov: 11.2, d: -1.4, ok: true },
    { c: 'BR', flag: '◆', name: 'Brazil · PT-BR',       sov: 8.4,  d: +0.3, ok: true },
    { c: 'IN', flag: '◆', name: 'India · EN',           sov: 18.3, d: +3.1, ok: true },
    { c: 'JP', flag: '◇', name: 'Japan · JA',           sov: 4.2,  d: -0.4, ok: false },
    { c: 'KR', flag: '◇', name: 'South Korea · KO',     sov: 6.8,  d: +0.2, ok: false },
  ];
  return (
    <>
      <PageHead title="Regional Audits" sub="How Acme performs by country and language — find where you're under-served."
        actions={<><button className="btn-d">+ Add region</button><button className="btn-p">Run all regions</button></>}/>
      <div className="page-body">
        <KPIRail items={[
          { k: 'REGIONS TRACKED', v: '10', d: +2 },
          { k: 'STRONGEST', v: 'US · 27.4%', info: 'EN-speaking' },
          { k: 'WEAKEST', v: 'JP · 4.2%', info: 'opportunity' },
          { k: 'AVG. SOV',  v: '15.7%', d: +1.2 },
          { k: 'LANGUAGES', v: '6' },
        ]}/>

        <Card title="Regions" padding={false}>
          <div className="reg-grid">
            {regions.map(r => (
              <div key={r.c} className="reg-card">
                <div className="reg-h">
                  <span className="reg-flag mono">{r.c}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:13}}>{r.name.split('·')[0]}</div>
                    <div className="mono dim" style={{fontSize:10}}>{r.name.split('·')[1]}</div>
                  </div>
                  {!r.ok && <Badge tone="warn">PRO</Badge>}
                </div>
                <div className="reg-v mono">{r.sov}<i>%</i></div>
                <Bar value={r.sov} max={30}/>
                <div style={{display:'flex',justifyContent:'space-between',marginTop:6,fontSize:11}}>
                  <Delta v={r.d} suffix="%"/>
                  <span className="mono dim">{r.ok ? '50 queries · 4h ago' : 'upgrade to scan'}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

// ────────────────────────── ONBOARDING WIZARD ──────────────────────────
export function PageOnboarding() {
  const [step, setStep] = React.useState(0);
  const steps = ['Domain', 'Brand', 'Competitors', 'Prompts', 'Review & launch'];
  return (
    <>
      <div className="page-head" style={{paddingTop:24}}>
        <div>
          <div className="eyebrow" style={{color:'var(--primary)'}}>FIRST-RUN · 2 OF 5 MINUTES</div>
          <h1 className="page-t" style={{marginTop:6}}>Let's get Livesov watching your brand.</h1>
          <p className="page-s">Drop your domain — we'll detect your competitors, draft 50 buyer-intent prompts, and start tracking before you finish your coffee.</p>
        </div>
        <a href="#overview" className="btn-d">Skip · setup later</a>
      </div>

      <div className="page-body">
        <div className="ob-steps">
          {steps.map((s,i) => (
            <div key={i} className={"ob-step " + (i < step ? 'done' : i === step ? 'on' : '')}>
              <span className="ob-n mono">{i+1}</span>
              <span className="ob-l">{s}</span>
              {i < steps.length - 1 && <span className="ob-line"/>}
            </div>
          ))}
        </div>

        {step === 0 && (
          <Card title="What's your domain?">
            <div style={{display:'grid',gap:18}}>
              <div className="fld">
                <label className="eyebrow">PRIMARY DOMAIN</label>
                <div style={{display:'flex',alignItems:'stretch'}}>
                  <span className="mono" style={{padding:'12px 14px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRight:0,borderTopLeftRadius:6,borderBottomLeftRadius:6,color:'var(--text-3)',fontSize:13}}>https://</span>
                  <input className="fld-in" style={{borderTopLeftRadius:0,borderBottomLeftRadius:0,fontFamily:'var(--mono)',padding:'12px 14px',fontSize:14}} defaultValue="acme.com"/>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                <div className="fld"><label className="eyebrow">CATEGORY</label><input className="fld-in" defaultValue="Project management software"/></div>
                <div className="fld"><label className="eyebrow">PRIMARY REGION</label><select className="fld-in"><option>Global · US English</option><option>UK</option><option>Germany</option></select></div>
              </div>
              <div className="ob-tip">
                <span className="ob-tip-i">✨</span>
                <div>We'll automatically pull your meta description, look at your category, and seed prompts based on what buyers actually ask AI engines about your space.</div>
              </div>
            </div>
            <div className="ob-cta"><div/><button className="btn-p" onClick={()=>setStep(1)}>Continue → <span className="mono" style={{fontSize:10,opacity:0.7,marginLeft:6}}>ENTER</span></button></div>
          </Card>
        )}

        {step === 1 && (
          <Card title="Confirm your brand details" right={<Badge tone="acc">DETECTED FROM acme.com</Badge>}>
            <div className="g2" style={{gridTemplateColumns:'1fr 1fr'}}>
              <div className="fld"><label className="eyebrow">BRAND NAME</label><input className="fld-in" defaultValue="Acme PM"/></div>
              <div className="fld"><label className="eyebrow">FOUNDED</label><input className="fld-in mono" defaultValue="2019"/></div>
              <div className="fld" style={{gridColumn:'span 2'}}><label className="eyebrow">ONE-LINER</label><input className="fld-in" defaultValue="Project management for engineering teams that doesn't suck."/></div>
              <div className="fld" style={{gridColumn:'span 2'}}>
                <label className="eyebrow">ALIASES & MISSPELLINGS</label>
                <div className="tag-grid">
                  {['Acme', 'Acme PM', 'AcmePM', 'Acmee', 'AcmeProject'].map(t => (
                    <span key={t} className="ttag mono">{t} <span className="x">×</span></span>
                  ))}
                  <span className="ttag mono add">+ Add</span>
                </div>
              </div>
            </div>
            <div className="ob-cta"><button className="btn-g" onClick={()=>setStep(0)}>← Back</button><button className="btn-p" onClick={()=>setStep(2)}>Continue →</button></div>
          </Card>
        )}

        {step === 2 && (
          <Card title="We found 7 competitors. Confirm or adjust." right={<button className="btn-d">+ Add manually</button>}>
            <div style={{display:'grid',gap:8}}>
              {[
                { n: 'Linear', d: 'linear.app', ok: true, why: 'co-cited in 84% of "pm" answers' },
                { n: 'Asana',  d: 'asana.com',  ok: true, why: 'category leader · 76% co-citation' },
                { n: 'Monday.com', d: 'monday.com', ok: true, why: 'frequently compared on Reddit' },
                { n: 'Notion', d: 'notion.so', ok: true, why: 'cross-cited in AI/feature queries' },
                { n: 'Jira',   d: 'atlassian.com/jira', ok: true, why: 'enterprise comparisons' },
                { n: 'ClickUp',d: 'clickup.com', ok: false, why: 'low co-citation · skip?' },
                { n: 'Trello', d: 'trello.com', ok: false, why: 'low co-citation · skip?' },
              ].map((c,i) => (
                <label key={i} className="cmp-pick">
                  <input type="checkbox" defaultChecked={c.ok}/>
                  <span style={{display:'inline-flex',alignItems:'center',gap:10,minWidth:200}}>
                    <span className="ptile ptile-chatgpt mono" style={{width:26,height:26,fontSize:9,background:'linear-gradient(135deg, #94A3B8, #475569)'}}>{c.n.slice(0,2).toUpperCase()}</span>
                    <div><b>{c.n}</b><div className="mono dim" style={{fontSize:10.5}}>{c.d}</div></div>
                  </span>
                  <span className="quiet" style={{fontSize:12,flex:1}}>{c.why}</span>
                  <Badge tone={c.ok?'pos':'neu'}>{c.ok ? 'INCLUDE' : 'SKIP'}</Badge>
                </label>
              ))}
            </div>
            <div className="ob-cta"><button className="btn-g" onClick={()=>setStep(1)}>← Back</button><button className="btn-p" onClick={()=>setStep(3)}>Continue · track 5 competitors →</button></div>
          </Card>
        )}

        {step === 3 && (
          <Card title="We drafted 50 prompts buyers ask AI engines about you." right={<Pill>Refresh from AI</Pill>}>
            <div className="quiet" style={{margin:'0 0 14px',fontSize:13}}>Edit, remove, or add your own. You can always change these later from Tracked Prompts.</div>
            <div style={{display:'grid',gap:8,maxHeight:340,overflowY:'auto',padding:'4px 2px',border:'1px solid var(--line)',borderRadius:6}}>
              {[
                'best project management tool for engineering teams','acme vs linear','acme vs notion','acme vs jira',
                'cheapest pm tool with AI features','pm tools that integrate with github','is acme good for product teams',
                'best pm for remote teams','pm for a 50-person startup','acme pricing for nonprofits',
                'free alternative to monday.com','what pm tool does intuit use','agile pm tool',
                'pm tool with native sprint planning','can acme replace jira',
              ].map((q,i) => (
                <div key={i} style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:10,padding:'10px 14px',borderBottom:'1px solid var(--line)',alignItems:'center'}}>
                  <span style={{fontSize:13}}><b>{q}</b></span>
                  <Badge tone={i % 4 === 0 ? 'info' : i % 4 === 1 ? 'warn' : i % 4 === 2 ? 'acc' : 'neu'}>{['COMPARE','PRICE','FEATURE','RECOMMEND'][i%4]}</Badge>
                  <button className="btn-d" style={{padding:'3px 7px',fontSize:11}}>×</button>
                </div>
              ))}
              <div className="quiet" style={{fontSize:12,padding:'10px 14px',color:'var(--mute)'}}>+ 35 more · scroll to see all</div>
            </div>
            <div style={{display:'flex',gap:8,marginTop:10}}>
              <input className="fld-in" placeholder="Add your own prompt…" style={{flex:1}}/>
              <button className="btn-g">+ Add</button>
            </div>
            <div className="ob-cta"><button className="btn-g" onClick={()=>setStep(2)}>← Back</button><button className="btn-p" onClick={()=>setStep(4)}>Continue with 50 prompts →</button></div>
          </Card>
        )}

        {step === 4 && (
          <Card title="Ready to launch" right={<Badge tone="acc">ALL SET</Badge>}>
            <div className="ob-review">
              <div className="rev-card"><div className="eyebrow">DOMAIN</div><div className="rev-v mono">acme.com</div></div>
              <div className="rev-card"><div className="eyebrow">BRAND</div><div className="rev-v">Acme PM</div></div>
              <div className="rev-card"><div className="eyebrow">COMPETITORS</div><div className="rev-v">5 brands</div></div>
              <div className="rev-card"><div className="eyebrow">PROMPTS</div><div className="rev-v">50 seeded</div></div>
              <div className="rev-card"><div className="eyebrow">ENGINES</div><div className="rev-v">5 / 5</div></div>
              <div className="rev-card"><div className="eyebrow">SCHEDULE</div><div className="rev-v">Hourly</div></div>
            </div>

            <div className="ob-final">
              <div>
                <h3 style={{margin:'0 0 6px',fontSize:18,fontWeight:600}}>First run starts in <span style={{color:'var(--primary)'}}>~90 seconds</span></h3>
                <p className="quiet" style={{margin:0,fontSize:13.5,lineHeight:1.5,maxWidth:'56ch'}}>We'll query ChatGPT, Claude, Gemini, Perplexity, and Grok with your 50 prompts. Your dashboard fills in as results stream back.</p>
              </div>
              <button className="btn-p" style={{padding:'12px 18px',fontSize:13}} onClick={()=>{ window.location.hash = 'overview'; }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 2L10 6L3 10Z" fill="currentColor"/></svg>
                Start first run
              </button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
