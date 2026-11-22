/**
 * Renders ReportData into the HTML template at src/reports/aiVisibilityReport.html.
 * The template holds the CSS and page shell; this file only writes the
 * data-driven markup. Fonts are inlined as base64 so Chrome never falls back.
 */

import fs from 'node:fs';
import path from 'node:path';
import { WINNING_RATE } from '@/lib/prompt-status';
import { SHORT_ENGINE, band, type ReportData, type QuestionRow } from './ai-visibility-data';

const e = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/* ─── files (cached per process) ─── */

function findFile(rel: string): string {
  const roots = [process.cwd(), path.join(process.cwd(), 'trackly-nextjs')];
  for (const r of roots) {
    const p = path.join(r, rel);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Report asset not found: ${rel}`);
}

let templateCache: string | null = null;
function template(): string {
  if (templateCache == null || process.env.NODE_ENV !== 'production') {
    templateCache = fs.readFileSync(findFile('src/reports/aiVisibilityReport.html'), 'utf8');
  }
  return templateCache;
}

let fontsCache: string | null = null;
export function fontFaces(): string {
  if (fontsCache) return fontsCache;
  const face = (fam: string, pkg: string, file: string, w: number) => {
    const b = fs.readFileSync(findFile(`node_modules/@fontsource/${pkg}/files/${file}-latin-${w}-normal.woff2`)).toString('base64');
    return `@font-face{font-family:'${fam}';font-weight:${w};src:url(data:font/woff2;base64,${b}) format('woff2')}`;
  };
  fontsCache = [400, 600, 700, 800].map(w => face('Bric', 'bricolage-grotesque', 'bricolage-grotesque', w)).join('')
    + [400, 500, 600, 700].map(w => face('Inst', 'instrument-sans', 'instrument-sans', w)).join('');
  return fontsCache;
}

/* ─── pieces ─── */

function chg(d: number | null, none = 'first scan'): string {
  if (d == null) return `<span class="chg fl">${e(none)}</span>`;
  if (d > 0) return `<span class="chg up">+${d} pts</span>`;
  if (d < 0) return `<span class="chg dn">−${Math.abs(d)} pts</span>`;
  return '<span class="chg fl">no change</span>';
}

function foot(d: ReportData, n: number, total: number, dark = false): string {
  return `<div class="foot${dark ? ' dk' : ''}"><span class="lg">livesov</span><span>${e(d.brand)} AI visibility report, ${e(d.scanDate)}</span><span>${n} / ${total}</span></div>`;
}

function head(d: ReportData, title: string, sub: string): string {
  return `<div class="ph"><span class="lg">livesov</span><span class="pt">${e(d.brand)}</span></div><h2>${e(title)}</h2><p class="lede">${e(sub)}</p>`;
}

/** Cover title size: 96px for short names, smaller for long ones so they fit the page. */
function titleSize(name: string): number {
  const longest = Math.max(...name.split(/\s+/).map(w => w.length), 1);
  const len = name.length;
  let size = 96;
  if (len > 11) size = Math.floor(96 * 11 / len);
  if (longest > 11) size = Math.min(size, Math.floor(96 * 11 / longest));
  // Two lines are fine for long names; don't shrink below 56px.
  if (len > 11 && longest <= 11) size = Math.max(size, len <= 22 ? 64 : 56);
  return Math.max(44, Math.min(96, size));
}

/* ─── pages ─── */

function cover(d: ReportData, total: number): string {
  const { perDot, filled, count } = d.dots;
  const rows = Math.ceil(count / 13);
  // 9 rows of dots fill the reference design; more rows get narrower dots so the field keeps the same height.
  const width = rows > 9 ? (118 * 9) / rows : 118;
  const dots = Array.from({ length: count }, (_, k) => `<i class="${k < filled ? 'f' : 'o'}"></i>`).join('');
  const meta = [d.site, d.location].filter(Boolean).join(', ');
  const dotText = perDot > 1
    ? `Each dot is ${perDot} AI answers. ${d.named} of the ${d.total} answers named ${e(d.brand)}.`
    : `Each dot is one AI answer. ${d.named} of the ${d.total} answers named ${e(d.brand)}.`;
  const S = (x: string) => x;
  const fact1 = d.goal
    ? `<div><b>${d.goal}%</b><span>Goal. ${d.goal > d.sov ? `${d.goal - d.sov} points to go.` : 'Reached.'}</span></div>`
    : `<div><b>${d.named}/${d.total}</b><span>Mentions in this scan</span></div>`;
  return `<div class="page cover">
 <div class="top"><span class="lg">livesov</span><span>AI visibility report</span></div>
 <h1 style="font-size:${titleSize(d.brand)}px">${e(d.brand)}</h1>
 <div class="meta">${e(meta)}${meta ? '. ' : ''}Scan of ${e(d.scanDate)}.</div>
 <div class="field" style="width:${width.toFixed(1)}mm">${dots}</div>
 <div class="hero" style="margin-top:10mm"><div class="big">${d.sov}<small>%</small></div>
  <p>${dotText}</p></div>
 <div class="facts">
  ${fact1}
  <div><b>${d.best ? d.best.sov : 0}%</b><span>Best engine: ${e(S(d.best?.engine || 'none'))}</span></div>
  <div><b>${d.gap ? d.gap.sov : 0}%</b><span>Biggest gap: ${e(S(d.gap?.engine || 'none'))}</span></div>
 </div>
 ${foot(d, 1, total, true)}
</div>`;
}

function enginesPage(d: ReportData, n: number, total: number): string {
  const rows = d.engines.map(x => {
    const on = Math.ceil(Math.max(0, Math.min(100, x.sov)) / 5);
    const segs = Array.from({ length: 20 }, (_, s) => `<b class="${s < on ? 'on' : ''}"></b>`).join('');
    const pill = x.answered === 0 ? '<span class="chg fl">no answers</span>' : chg(x.change);
    return `<div class="eng ${band(x.sov)}"><div class="en">${e(x.engine)}</div>
<div class="eseg">${segs}<span class="mark" style="left:${d.sov}%"></span></div>
<div class="ev">${x.sov}<small>%</small></div><div class="ec">${pill}</div></div>`;
  }).join('');
  const notes = d.engineNotes.map(t => `<div${t.alert ? ' style="border-color:var(--coral)"' : ''}><b>${e(t.title)}</b><p>${e(t.text)}</p></div>`).join('');
  return `<div class="page">
 ${head(d, 'Where AI names you', `Share of answers that named ${d.brand}, by AI engine. The black line marks your ${d.sov}% average.`)}
 <div class="engs">${rows}</div>
 <div class="key"><span><i style="background:var(--mint)"></i>Strong, 60% and up</span><span><i style="background:var(--iris)"></i>Good, 40 to 59%</span><span><i style="background:var(--amber)"></i>Weak, 20 to 39%</span><span><i style="background:var(--coral)"></i>Very low, under 20%</span></div>
 <div class="notes">${notes}</div>
 ${foot(d, n, total)}
</div>`;
}

const Q_PER_PAGE = 20;

/** Splits the question list into pages of at most 20 questions. */
export function questionPages(d: ReportData): QuestionRow[][] {
  const pages: QuestionRow[][] = [];
  for (let i = 0; i < d.questions.length; i += Q_PER_PAGE) pages.push(d.questions.slice(i, i + Q_PER_PAGE));
  return pages.length ? pages : [[]];
}

function groupHeader(d: ReportData, g: QuestionRow['group'], count: number, cont: boolean): string {
  const E = d.columns.length;
  // Same rule as the dashboard (lib/prompt-status): share of the engines that answered.
  const meta = {
    win: ['Winning', `Named by ${WINNING_RATE}% or more of the engines that answered`],
    weak: ['Weak', `Named, but by under ${WINNING_RATE}% of the engines`],
    miss: ['Missing', `No engine named ${d.brand}`],
  }[g];
  return `<tr class="gh ${g}"><td colspan="${E + 2}"><span class="gn">${meta[0]}${cont ? ' (continued)' : ''}</span><span class="gc">${count}</span><span class="gd">${e(meta[1])}</span></td></tr>`;
}

function questionsPage(d: ReportData, rows: QuestionRow[], first: boolean, n: number, total: number): string {
  const counts = { win: 0, weak: 0, miss: 0 };
  d.questions.forEach(q => { counts[q.group]++; });
  const th = d.columns.map(c => `<th>${e(SHORT_ENGINE[c] || c)}</th>`).join('');
  let body = '';
  let current: QuestionRow['group'] | null = null;
  rows.forEach((q, i) => {
    if (q.group !== current) {
      // A group that started on an earlier page is marked as continued.
      const cont = i === 0 && !first && d.questions.indexOf(q) > 0 && d.questions[d.questions.indexOf(q) - 1].group === q.group;
      body += groupHeader(d, q.group, counts[q.group], cont);
      current = q.group;
    }
    const cells = d.columns.map(c => `<td class="c"><i class="${q.named.includes(c) ? 'y' : 'n'}"></i></td>`).join('');
    const rv = q.rivals.length && q.group !== 'win' ? `<span class="rv">Rivals named: ${e(q.rivals.join(', '))}</span>` : '';
    body += `<tr class="${q.group}"><td class="q">${e(q.question)}${rv}</td>${cells}<td class="k">${q.named.length}<span>/${q.answered.length}</span></td></tr>`;
  });
  if (!rows.length) body = `<tr><td colspan="${d.columns.length + 2}" class="q">No tracked questions were answered in this scan.</td></tr>`;
  return `<div class="page">
 ${head(d, 'What buyers ask, and who AI names', `The ${d.questions.length} question${d.questions.length === 1 ? '' : 's'} we track. A filled dot means that engine named ${d.brand} in its answer.`)}
 <table><thead><tr><th>Question</th>${th}<th style="text-align:right;width:12mm">Found</th></tr></thead><tbody>${body}</tbody></table>
 ${foot(d, n, total)}
</div>`;
}

const GREYS = ['#8E88B8', '#B9B6D3', '#DCDAEA', '#E9E8F2', '#F0EFF6'];

function marketPage(d: ReportData, n: number, total: number): string {
  const mentionsTotal = d.competitors.reduce((s, c) => s + c.mentions, 0) || 1;
  const color = (i: number) => (i === 0 ? '#3D2EF5' : GREYS[Math.min(i - 1, GREYS.length - 1)]);
  const stack = d.competitors.map((c, i) => {
    const w = (c.mentions / mentionsTotal) * 100;
    return `<div class="${w < 7 ? 'tiny' : ''}" style="width:${w.toFixed(2)}%;background:${color(i)}"><span>${c.share}%</span></div>`;
  }).join('');
  const legend = d.competitors.map((c, i) =>
    `<div class="cl"><i style="background:${color(i)}"></i><b>${e(c.name)}${c.you ? ' (you)' : ''}</b>${c.other ? `<span class="chg fl">${c.share}%</span>` : chg(c.change, 'new')}</div>`).join('');
  const mx = d.sources[0]?.citations || 1;
  const src = d.sources.map(s =>
    `<div class="s ${s.type}"><div class="sn">${e(s.domain)}</div><div class="sb"><div style="width:${((s.citations / mx) * 100).toFixed(0)}%"></div></div><div class="sv">${s.citations}</div></div>`).join('')
    || '<p class="small">No citations in this scan.</p>';
  const t = d.tone;
  const tt = d.total || 1;
  const ownPct = d.citationsTotal ? Math.round((d.citationsOwn / d.citationsTotal) * 100) : 0;
  const listCallout = d.listingCitations > 0
    ? `<div class="callout"><b>${d.listingCitations} citations</b>come from listing and review sites. Getting ${e(d.brand)} featured on them is the quickest way into more answers.</div>`
    : `<div class="callout"><b>0 citations</b>come from listing and review sites in the top 10. AI leans on publishers and brand sites for these questions.</div>`;
  const ownCallout = d.site
    ? `<div class="callout"><b style="color:var(--iris)">${d.citationsOwn} of ${d.citationsTotal}</b>citations point to ${e(d.site)}. That is ${ownPct}% of all sources AI used.</div>`
    : '';
  const title = d.leader && d.rivals > 0 ? 'You lead the category' : 'Where you stand';
  return `<div class="page">
 ${head(d, title, d.leadText)}
 <div class="stack">${stack}</div>
 <div class="cls${d.competitors.length > 4 ? ' n5' : ''}">${legend}</div>
 <div class="cols">
  <div>
   <h4>Sites AI cites</h4><p class="small">Top ${Math.min(10, d.sources.length)} of ${d.citationsTotal} citations in this scan.</p>
   <div style="margin-top:4mm">${src}</div>
   <div class="key" style="margin-top:3mm"><span><i style="background:var(--iris)"></i>Your site</span><span><i style="background:var(--amber)"></i>Listing or review site</span></div>
  </div>
  <div>
   <h4>How AI talks about you</h4><p class="small">Tone of all ${d.total} answers.</p>
   <div class="tone"><div style="width:${((t.positive / tt) * 100).toFixed(2)}%;background:var(--mint)"></div><div style="flex:1;background:var(--fog)"></div><div style="width:${((t.negative / tt) * 100).toFixed(2)}%;background:var(--coral)"></div></div>
   <div class="tl"><div><b style="color:var(--mint)">${t.positive}</b>positive</div><div><b>${t.neutral}</b>neutral</div><div style="text-align:right"><b style="color:var(--coral)">${t.negative}</b>negative</div></div>
   ${listCallout}
   ${ownCallout}
  </div>
 </div>
 ${foot(d, n, total)}
</div>`;
}

function planPage(d: ReportData, n: number, total: number): string {
  const steps = d.steps.map((s, i) => `<div class="st"><div class="sn2">${i + 1}</div><div><h3>${e(s.title)}</h3>
<p class="why">${e(s.why)}</p><p class="do"><b>Do this:</b> ${e(s.todo)}</p></div></div>`).join('');
  const fill = Math.max(0, Math.min(100, d.sov));
  const mark = Math.max(0, Math.min(100, d.target));
  return `<div class="page">
 ${head(d, 'Plan for next month', `${d.steps.length === 1 ? 'One move' : `${d.steps.length === 5 ? 'Five' : d.steps.length} moves`}, in order of impact on your share of voice.`)}
 ${steps}
 <div class="goal"><div><b>From ${d.sov}% to ${d.target}%</b><div style="font-size:11px;opacity:.7;margin-top:1mm">${d.goal ? 'Share of voice goal' : 'Suggested next target'}</div></div>
  <div><div class="gbar"><div style="width:${fill}%"></div><span style="left:${mark}%"></span></div><div class="gl"><span>Now ${d.sov}%</span><span>${d.goal ? 'Goal' : 'Target'} ${d.target}%</span></div></div></div>
 ${foot(d, n, total)}
</div>`;
}

function emptyPage(d: ReportData): string {
  return `<div class="page cover">
 <div class="top"><span class="lg">livesov</span><span>AI visibility report</span></div>
 <h1 style="font-size:${titleSize(d.brand)}px">${e(d.brand)}</h1>
 <div class="meta">${e(d.site)}${d.site ? '. ' : ''}No scan yet.</div>
 <div class="hero" style="margin-top:30mm"><p style="max-width:120mm">Run the first scan in Livesov to fill this report with real AI visibility data.</p></div>
 ${foot(d, 1, 1, true)}
</div>`;
}

export function renderReportHtml(d: ReportData): string {
  let pages: string;
  if (!d.scanned) {
    pages = emptyPage(d);
  } else {
    const qp = questionPages(d);
    const total = 4 + qp.length;
    pages = [
      cover(d, total),
      enginesPage(d, 2, total),
      ...qp.map((rows, i) => questionsPage(d, rows, i === 0, 3 + i, total)),
      marketPage(d, 3 + qp.length, total),
      planPage(d, 4 + qp.length, total),
    ].join('\n');
  }
  return template()
    .replace('{{TITLE}}', () => e(`${d.brand} AI visibility report`))
    .replace('{{FONTS}}', () => fontFaces())
    .replace('{{PAGES}}', () => pages);
}
