import html, base64, os
F = "/home/claude/fonts/node_modules/@fontsource"
def ff(fam, path, w):
    b = base64.b64encode(open(path,"rb").read()).decode()
    return f"@font-face{{font-family:'{fam}';font-weight:{w};src:url(data:font/woff2;base64,{b}) format('woff2')}}"
fonts = "".join(ff("Bric",f"{F}/bricolage-grotesque/files/bricolage-grotesque-latin-{w}-normal.woff2",w) for w in (400,600,700,800))
fonts += "".join(ff("Inst",f"{F}/instrument-sans/files/instrument-sans-latin-{w}-normal.woff2",w) for w in (400,500,600,700))
e = html.escape

brand, site, loc, date = "Nestadu", "nestadu.com", "Mill Valley, CA", "22 November 2026"
sov, goal, named, total = 43, 70, 50, 117
pos, neg = 5, 6
engines = [("Google AI Overview",72,-3),("Google AI Mode",53,3),("Gemini",50,5),("Perplexity",45,45),
           ("ChatGPT",30,0),("Claude",10,-5),("Grok",0,0)]
eng_cols = ["ChatGPT","Claude","Gemini","Perplexity","Grok","Google AI Overview","Google AI Mode"]
colname = {"ChatGPT":"ChatGPT","Claude":"Claude","Gemini":"Gemini","Perplexity":"Perplexity","Grok":"Grok",
           "Google AI Overview":"AI Overview","Google AI Mode":"AI Mode"}
P,C,G,X,K,O,M = "Perplexity","Claude","Gemini","ChatGPT","Grok","Google AI Overview","Google AI Mode"
questions = [
 ("Nestadu reputation",[X,P,G,M,O],[]),("Nestadu pricing",[P,C,M,G,O],[]),("what is Nestadu",[P,X,G,M,O],[]),
 ("is Nestadu worth it",[X,G,M,O],[]),("compare Nestadu to others",[X,P,M,O],["Abodu","Villa Homes","Samara"]),
 ("does Nestadu offer good service",[P,G,M,O],[]),("Nestadu vs competitors",[P,C,G,M],["Abodu","Samara","Villa Homes"]),
 ("is Nestadu good",[X,M,G,O],[]),("ADU builder near Mill Valley CA",[G,M,O],[]),
 ("best prefab ADU builders in the Bay Area",[P,G,O],["Abodu","Villa Homes","Samara"]),
 ("Nestadu customer experience",[X,G,O],[]),("prefab ADU builders in San Diego",[P,O],[]),
 ("alternatives to Nestadu",[M,O],["Abodu","Samara","Villa Homes"]),("ADU builders in Sacramento",[P],[]),
 ("best prefab ADU companies in California",[O],["Abodu","Villa Homes","Samara"]),
 ("who builds 2 story ADUs in California",[],["Villa Homes"]),
 ("best modular ADU companies in Southern California",[],["Abodu","Villa Homes","Samara"]),
 ("how much does a prefab ADU cost in California",[],[]),
 ("best ADU builders in Los Angeles",[],["Abodu"]),("best ADU builder in California",[],["Abodu","Villa Homes","Samara"]),
]
groups = [("Winning","Named by 4 or more of the 7 engines","win",[q for q in questions if len(q[1])>=4]),
          ("Weak","Named by 1 to 3 engines","weak",[q for q in questions if 0<len(q[1])<4]),
          ("Missing","No engine named Nestadu","miss",[q for q in questions if not q[1]])]
comps = [("Nestadu",52,-13),("Abodu",23,1),("Villa Homes",14,5),("Samara",11,6)]
sources = [("nestadu.com",75,"own"),("google.com",32,""),("angi.com",13,"list"),("theprefablist.com",13,"list"),
           ("tinyhousetalk.com",11,"list"),("facebook.com",9,""),("buildzoom.com",9,"list"),
           ("dwellingindex.com",9,"list"),("aduwizard.com",8,"list"),("yelp.com",7,"list")]
cit_total, cit_own = 410, 75

def chg(d):
    if d>0: return f'<span class="chg up">+{d} pts</span>'
    if d<0: return f'<span class="chg dn">−{abs(d)} pts</span>'
    return '<span class="chg fl">no change</span>'

# cover dot field: 13 x 9 = 117
dots = "".join(f'<i class="{"f" if k<named else "o"}"></i>' for k in range(total))

# engines
eng_html = ""
for n,v,d in engines:
    segs = "".join(f'<b class="{"on" if (s+1)*5<=v or (s*5<v) else ""}"></b>' for s in range(20))
    tier = "hi" if v>=60 else "md" if v>=40 else "lo" if v>=20 else "vl"
    eng_html += f'''<div class="eng {tier}"><div class="en">{n}</div>
<div class="eseg">{segs}<span class="mark" style="left:{sov}%"></span></div>
<div class="ev">{v}<small>%</small></div><div class="ec">{chg(d)}</div></div>'''

# questions
qh = "".join(f'<th>{colname[c]}</th>' for c in eng_cols)
q_html = ""
for gname, gdesc, cls, qs in groups:
    q_html += f'<tr class="gh {cls}"><td colspan="9"><span class="gn">{gname}</span><span class="gc">{len(qs)}</span><span class="gd">{gdesc}</span></td></tr>'
    for q,es,rv in qs:
        cells = "".join(f'<td class="c"><i class="{"y" if c in es else "n"}"></i></td>' for c in eng_cols)
        rvs = f'<span class="rv">Rivals named: {e(", ".join(rv))}</span>' if (rv and cls!="win") else ""
        q_html += f'<tr class="{cls}"><td class="q">{e(q)}{rvs}</td>{cells}<td class="k">{len(es)}<span>/7</span></td></tr>'

# competitors stacked
cc = ["#3D2EF5","#8E88B8","#B9B6D3","#DCDAEA"]
cstack = "".join(f'<div style="width:{v}%;background:{cc[i]}"><span>{v}%</span></div>' for i,(n,v,d) in enumerate(comps))
clegend = "".join(f'<div class="cl"><i style="background:{cc[i]}"></i><b>{n}{" (you)" if i==0 else ""}</b>{chg(d)}</div>' for i,(n,v,d) in enumerate(comps))
mx = sources[0][1]
src_html = "".join(f'<div class="s {t}"><div class="sn">{n}</div><div class="sb"><div style="width:{v/mx*100:.0f}%"></div></div><div class="sv">{v}</div></div>' for n,v,t in sources)
list_total = sum(v for n,v,t in sources if t=="list")

steps = [
 ("Answer the 5 buying questions AI gives to rivals",
  "“best ADU builder in California”, Los Angeles, Southern California, 2 story ADUs and prefab ADU cost. No engine names Nestadu for any of them. Abodu, Villa Homes and Samara win these.",
  "Build one page per question. Put a direct answer, a price range and real project photos in the first screen."),
 ("Close the Claude and Grok gap",
  "Claude names Nestadu in 10% of answers and Grok in 0%, against 43% overall.",
  "Get listed on Yelp, BBB, Houzz and Angi with the same name, address and phone. These engines lean on such listings."),
 ("Get onto the lists AI reads",
  f"Five listing and review sites (Angi, The Prefab List, Tiny House Talk, BuildZoom, Dwelling Index) are cited {13+13+11+9+9} times.",
  "Pitch each one for a feature or a profile. Start with The Prefab List and BuildZoom."),
 ("Turn mentions into recommendations",
  f"Only {pos} of {total} answers speak positively about Nestadu. AI knows the name but rarely says why to choose it.",
  "Publish case studies and collect fresh Google reviews that mention ADU type and city."),
 ("Make AI link to nestadu.com",
  "15 answers name Nestadu without citing the website.",
  "Add LocalBusiness, FAQ and Product schema, and a clear pricing page AI can quote."),
]
steps_html = "".join(f'''<div class="st"><div class="sn2">{i}</div><div><h3>{e(t)}</h3>
<p class="why">{e(w)}</p><p class="do"><b>Do this:</b> {e(d)}</p></div></div>''' for i,(t,w,d) in enumerate(steps,1))

def foot(n, dark=False):
    return f'<div class="foot{" dk" if dark else ""}"><span class="lg">livesov</span><span>{brand} AI visibility report, {date}</span><span>{n} / 5</span></div>'
def head(title, sub):
    return f'<div class="ph"><span class="lg">livesov</span><span class="pt">{brand}</span></div><h2>{title}</h2><p class="lede">{sub}</p>'

doc = f'''<!doctype html><html><head><meta charset="utf-8"><style>{fonts}
@page{{size:A4;margin:0}}
*{{box-sizing:border-box;margin:0;padding:0}}
:root{{--iris:#3D2EF5;--ink:#161A33;--paper:#F6F7FB;--fog:#E3E5F0;--mute:#6B7091;--mint:#0FA97A;--coral:#E5484D;--amber:#D98A00}}
body{{font-family:Inst;color:var(--ink);font-size:11.5px;line-height:1.5;-webkit-print-color-adjust:exact}}
.page{{width:210mm;height:297mm;position:relative;overflow:hidden;page-break-after:always;padding:16mm 16mm 0;background:#fff}}
.lg{{font-family:Bric;font-weight:800;letter-spacing:-.4px;font-size:15px}}
.foot{{position:absolute;left:16mm;right:16mm;bottom:10mm;display:flex;justify-content:space-between;font-size:9px;color:var(--mute)}}
.foot .lg{{font-size:11px;color:var(--iris)}} .foot.dk,.foot.dk .lg{{color:rgba(255,255,255,.7)}}
/* cover */
.cover{{background:var(--iris);color:#fff;padding:18mm 18mm 0}}
.cover .top{{display:flex;justify-content:space-between;align-items:baseline}}
.cover .top .lg{{font-size:22px}} .cover .top span{{font-size:11px;opacity:.75}}
.cover h1{{font-family:Bric;font-weight:800;font-size:96px;letter-spacing:-4px;line-height:.9;margin-top:30mm}}
.cover .meta{{font-size:13px;opacity:.75;margin-top:6mm}}
.field{{display:grid;grid-template-columns:repeat(13,1fr);gap:7px;width:118mm;margin-top:20mm}}
.field i{{aspect-ratio:1;border-radius:50%;display:block}}
.field i.f{{background:#fff}} .field i.o{{border:1.5px solid rgba(255,255,255,.35)}}
.hero{{display:flex;gap:12mm;align-items:flex-end}}
.big{{font-family:Bric;font-weight:800;font-size:120px;letter-spacing:-6px;line-height:.8}}
.big small{{font-size:56px;letter-spacing:-2px}}
.hero p{{font-size:14px;line-height:1.45;max-width:52mm;margin-top:5mm;opacity:.9}}
.facts{{position:absolute;left:18mm;right:18mm;bottom:24mm;display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid rgba(255,255,255,.3)}}
.facts div{{padding:5mm 4mm 0 0}} .facts b{{font-family:Bric;font-size:30px;font-weight:700;letter-spacing:-1px;display:block;line-height:1.1}}
.facts span{{font-size:11px;opacity:.75}}
/* inner */
.ph{{display:flex;justify-content:space-between;align-items:baseline;color:var(--mute);padding-bottom:5mm;border-bottom:1px solid var(--fog)}}
.ph .lg{{color:var(--iris)}} .pt{{font-size:10px}}
h2{{font-family:Bric;font-weight:800;font-size:34px;letter-spacing:-1.3px;line-height:1.05;margin-top:9mm}}
.lede{{font-size:13px;color:var(--mute);max-width:140mm;margin-top:3mm}}
.chg{{font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;white-space:nowrap}}
.chg.up{{background:#E2F6EF;color:#087A58}} .chg.dn{{background:#FDE8E8;color:#B4262B}} .chg.fl{{background:var(--paper);color:var(--mute)}}
.engs{{margin-top:9mm}}
.eng{{display:grid;grid-template-columns:44mm 1fr 24mm 22mm;align-items:center;gap:6mm;padding:4.2mm 0;border-bottom:1px solid var(--fog)}}
.en{{font-weight:600;font-size:13px}}
.eseg{{display:grid;grid-template-columns:repeat(20,1fr);gap:2px;position:relative;height:16px}}
.eseg b{{background:var(--fog);border-radius:2px}}
.eng.hi .eseg b.on{{background:var(--mint)}} .eng.md .eseg b.on{{background:var(--iris)}}
.eng.lo .eseg b.on{{background:var(--amber)}} .eng.vl .eseg b.on{{background:var(--coral)}}
.mark{{position:absolute;top:-5px;bottom:-5px;width:2px;background:var(--ink)}}
.ev{{font-family:Bric;font-weight:800;font-size:30px;letter-spacing:-1px;text-align:right}} .ev small{{font-size:16px}}
.ec{{text-align:right}}
.key{{display:flex;gap:6mm;font-size:10px;color:var(--mute);margin-top:4mm;align-items:center}}
.key i{{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}}
.notes{{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm;margin-top:12mm}}
.notes div{{border-top:3px solid var(--ink);padding-top:3mm}}
.notes b{{font-family:Bric;font-size:16px;font-weight:700;display:block;line-height:1.2;margin-bottom:2mm;letter-spacing:-.3px}}
.notes p{{color:var(--mute);font-size:11px}}
/* questions */
table{{width:100%;border-collapse:collapse;margin-top:3mm}}
th{{font-size:9px;font-weight:600;color:var(--mute);padding:0 0 3mm;text-align:center;width:13.5mm}}
th:first-child{{text-align:left;width:auto}}
td{{padding:1.15mm 0;line-height:1.25;border-bottom:1px solid var(--fog)}}
td.q{{font-weight:600;font-size:11px}} .rv{{font-weight:400;font-size:9px;color:var(--mute);display:block}}
td.c{{text-align:center}} td.c i{{display:inline-block;width:11px;height:11px;vertical-align:middle;border-radius:50%}}
i.y{{background:var(--iris)}} i.n{{border:1.5px solid var(--fog)}}
tr.miss i.n{{border-color:#F5C7C8}} tr.miss td.q{{color:var(--coral)}}
td.k{{font-family:Bric;font-weight:800;font-size:14px;text-align:right;width:12mm}} td.k span{{font-size:10px;color:var(--mute);font-weight:400}}
tr.gh td{{border-bottom:2px solid var(--ink);padding-top:3.5mm;padding-bottom:1.5mm}}
.gn{{font-family:Bric;font-weight:800;font-size:17px;letter-spacing:-.4px}}
.gc{{font-family:Bric;font-weight:700;font-size:11px;margin-left:6px;padding:1px 7px;border-radius:20px;color:#fff;vertical-align:3px}}
tr.gh.win .gc{{background:var(--mint)}} tr.gh.weak .gc{{background:var(--amber)}} tr.gh.miss .gc{{background:var(--coral)}}
.gd{{color:var(--mute);font-size:10.5px;margin-left:8px}}
/* market */
.stack{{display:flex;height:22mm;border-radius:6px;overflow:hidden;margin-top:7mm}}
.stack div{{display:flex;align-items:flex-end;padding:0 0 3mm 3mm}}
.stack span{{font-family:Bric;font-weight:800;font-size:20px;letter-spacing:-.6px;color:#fff}}
.stack div:nth-child(n+3) span{{color:var(--ink)}}
.cls{{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;margin-top:4mm}}
.cl{{font-size:11px}} .cl i{{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px}} .cl b{{display:block;font-weight:600;margin-bottom:1mm}}
.cols{{display:grid;grid-template-columns:1fr 1fr;gap:12mm;margin-top:4mm}}
h4{{font-family:Bric;font-weight:700;font-size:19px;letter-spacing:-.5px;margin-top:10mm}}
.small{{color:var(--mute);font-size:11px;margin-top:1mm}}
.tone{{display:flex;height:12px;border-radius:6px;overflow:hidden;margin-top:5mm}}
.tl{{display:flex;justify-content:space-between;font-size:11px;margin-top:3mm}} .tl b{{font-family:Bric;font-size:20px;display:block;font-weight:800}}
.s{{display:grid;grid-template-columns:34mm 1fr 9mm;gap:3mm;align-items:center;padding:1.6mm 0;font-size:11px}}
.sb{{height:9px;background:var(--paper);border-radius:5px}} .sb div{{height:100%;border-radius:5px;background:#B9B6D3}}
.s.own .sb div{{background:var(--iris)}} .s.list .sb div{{background:var(--amber)}}
.s.own .sn{{font-weight:700;color:var(--iris)}} .sv{{text-align:right;font-weight:700}}
.callout{{background:var(--paper);border-radius:8px;padding:5mm;margin-top:5mm;font-size:11.5px}}
.callout b{{font-family:Bric;font-size:26px;font-weight:800;display:block;letter-spacing:-.8px;color:var(--amber);line-height:1.1}}
/* steps */
.st{{display:grid;grid-template-columns:16mm 1fr;gap:4mm;padding:6mm 0;border-bottom:1px solid var(--fog)}}
.sn2{{font-family:Bric;font-weight:800;font-size:40px;color:var(--iris);line-height:.9;letter-spacing:-2px}}
h3{{font-family:Bric;font-weight:700;font-size:18px;letter-spacing:-.4px;line-height:1.2}}
.why{{color:var(--mute);margin-top:1.5mm;max-width:150mm}} .do{{margin-top:1.5mm;max-width:150mm}}
.goal{{position:absolute;left:16mm;right:16mm;bottom:22mm;background:var(--ink);color:#fff;border-radius:10px;padding:6mm 7mm;display:flex;justify-content:space-between;align-items:center}}
.goal b{{font-family:Bric;font-size:22px;font-weight:700;letter-spacing:-.5px}}
.gbar{{width:70mm;height:10px;background:rgba(255,255,255,.15);border-radius:5px;position:relative}}
.gbar div{{height:100%;border-radius:5px;background:#fff;width:{sov}%}}
.gbar span{{position:absolute;left:{goal}%;top:-6px;bottom:-6px;width:2px;background:#9F98FF}}
.gl{{font-size:10px;opacity:.7;margin-top:2mm;display:flex;justify-content:space-between;width:70mm}}
</style></head><body>

<div class="page cover">
 <div class="top"><span class="lg">livesov</span><span>AI visibility report</span></div>
 <h1>{brand}</h1>
 <div class="meta">{site}, {loc}. Scan of {date}.</div>
 <div class="field">{dots}</div>
 <div class="hero" style="margin-top:10mm"><div class="big">{sov}<small>%</small></div>
  <p>Each dot is one AI answer. {named} of the {total} answers named {brand}.</p></div>
 <div class="facts">
  <div><b>{goal}%</b><span>Goal. {goal-sov} points to go.</span></div>
  <div><b>72%</b><span>Best engine: Google AI Overview</span></div>
  <div><b>0%</b><span>Biggest gap: Grok</span></div>
 </div>
 {foot(1, True)}
</div>

<div class="page">
 {head("Where AI names you", f"Share of answers that named {brand}, by AI engine. The black line marks your {sov}% average.")}
 <div class="engs">{eng_html}</div>
 <div class="key"><span><i style="background:var(--mint)"></i>Strong, 60% and up</span><span><i style="background:var(--iris)"></i>Good, 40 to 59%</span><span><i style="background:var(--amber)"></i>Weak, 20 to 39%</span><span><i style="background:var(--coral)"></i>Very low, under 20%</span></div>
 <div class="notes">
  <div><b>Google is your home ground</b><p>AI Overview names you in 72% of answers, AI Mode in 53%.</p></div>
  <div><b>Perplexity woke up</b><p>Up 45 points since the last scan, from 0% to 45%.</p></div>
  <div style="border-color:var(--coral)"><b>Claude and Grok are blind spots</b><p>10% and 0%. Fixing these two lifts the overall score fastest.</p></div>
 </div>
 {foot(2)}
</div>

<div class="page">
 {head("What buyers ask, and who AI names", f"The 20 questions we track. A filled dot means that engine named {brand} in its answer.")}
 <table><thead><tr><th>Question</th>{qh}<th style="text-align:right;width:12mm">Found</th></tr></thead><tbody>{q_html}</tbody></table>
 {foot(3)}
</div>

<div class="page">
 {head("You lead the category", f"Share of brand mentions across all AI answers in this scan. {brand} is named more than twice as often as Abodu.")}
 <div class="stack">{cstack}</div>
 <div class="cls">{clegend}</div>
 <div class="cols">
  <div>
   <h4>Sites AI cites</h4><p class="small">Top 10 of {cit_total} citations in this scan.</p>
   <div style="margin-top:4mm">{src_html}</div>
   <div class="key" style="margin-top:3mm"><span><i style="background:var(--iris)"></i>Your site</span><span><i style="background:var(--amber)"></i>Listing or review site</span></div>
  </div>
  <div>
   <h4>How AI talks about you</h4><p class="small">Tone of all {total} answers.</p>
   <div class="tone"><div style="width:{pos/total*100}%;background:var(--mint)"></div><div style="flex:1;background:var(--fog)"></div><div style="width:{neg/total*100}%;background:var(--coral)"></div></div>
   <div class="tl"><div><b style="color:var(--mint)">{pos}</b>positive</div><div><b>{total-pos-neg}</b>neutral</div><div style="text-align:right"><b style="color:var(--coral)">{neg}</b>negative</div></div>
   <div class="callout"><b>{list_total} citations</b>come from listing and review sites. Getting {brand} featured on them is the quickest way into more answers.</div>
   <div class="callout"><b style="color:var(--iris)">{cit_own} of {cit_total}</b>citations point to {site}. That is 18% of all sources AI used.</div>
  </div>
 </div>
 {foot(4)}
</div>

<div class="page">
 {head("Plan for next month", "Five moves, in order of impact on your share of voice.")}
 {steps_html}
 <div class="goal"><div><b>From {sov}% to {goal}%</b><div style="font-size:11px;opacity:.7;margin-top:1mm">Share of voice goal</div></div>
  <div><div class="gbar"><div></div><span></span></div><div class="gl"><span>Now {sov}%</span><span>Goal {goal}%</span></div></div></div>
 {foot(5)}
</div>
</body></html>'''
open("/home/claude/report2.html","w").write(doc)
