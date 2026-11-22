/**
 * Data for the AI Visibility PDF report.
 *
 * Every number here comes from the same summaries the dashboard and the MCP
 * tools use (lib/mcp/summarize.ts), so the report can never disagree with
 * the app. Pure: takes the stored brand object, returns plain data. The
 * renderer (ai-visibility-render.ts) only formats it.
 */

import {
  ENGINES, competitorSummary, engineName, questionSummary, realRuns, sourceSummary, visibilitySummary,
} from '@/lib/mcp/summarize';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyObj = Record<string, any>;

export type Band = 'hi' | 'md' | 'lo' | 'vl';

/** Score bands used everywhere in the report. */
export function band(v: number): Band {
  if (v >= 60) return 'hi';
  if (v >= 40) return 'md';
  if (v >= 20) return 'lo';
  return 'vl';
}

/** Short engine label for table columns and notes. */
export const SHORT_ENGINE: Record<string, string> = {
  ChatGPT: 'ChatGPT', Claude: 'Claude', Gemini: 'Gemini', Perplexity: 'Perplexity', Grok: 'Grok',
  'Google AI Overview': 'AI Overview', 'Google AI Mode': 'AI Mode',
};

// Directory, listing and review hosts. A cited host is a "listing or review
// site" when it matches one of these, or its name reads like a list/review
// publication (theprefablist, dwellingindex, aduwizard, ...).
const LISTING_HOSTS = [
  'yelp', 'angi', 'angieslist', 'bbb.org', 'houzz', 'thumbtack', 'homeadvisor', 'yellowpages', 'porch',
  'expertise.com', 'threebestrated', 'trustpilot', 'nextdoor', 'buildzoom', 'clutch.co', 'g2.com', 'capterra',
  'manta', 'superpages', 'birdeye', 'chamberofcommerce', 'mapquest', 'foursquare', 'tripadvisor', 'citysearch',
  'bark.com', 'checkatrade', 'trustatrader', 'mybuilder', 'ratedpeople', 'goodfirms', 'designrush', 'upcity',
  'sortlist', 'networx', 'fixr', 'homeguide', 'zillow', 'realtor.com', 'glassdoor', 'bestprosintown',
];
// Big platforms that are never a "listing site" even when the name matches.
const NOT_LISTING = ['google', 'facebook', 'youtube', 'reddit', 'linkedin', 'instagram', 'x', 'twitter', 'wikipedia', 'tiktok', 'pinterest', 'medium', 'quora'];
const LISTING_WORD = /(list|review|directory|index|rated|ranking|compare|wizard|talk|finder|guide|best|top\d*)/;

export function isListingHost(domain: string): boolean {
  const h = String(domain || '').toLowerCase().replace(/^www\./, '');
  if (!h) return false;
  const labels = h.split('.');
  const nonTld = labels.slice(0, -1);
  if (NOT_LISTING.some(n => nonTld.includes(n))) return false;
  if (LISTING_HOSTS.some(e => (e.includes('.') ? h === e || h.endsWith('.' + e) : nonTld.includes(e)))) return true;
  return LISTING_WORD.test(nonTld.join('.'));
}

function hostOf(raw: string): string {
  try { return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return ''; }
}

export function displaySite(website: unknown): string {
  return String(website || '').trim().replace(/^[a-z]+:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
}

export function fmtReportDate(t: string | number | Date): string {
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** "A", "A and B", "A, B and C". */
export function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const NUM_WORDS = ['zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

export interface EngineRow { engine: string; sov: number; change: number | null; answered: number; band: Band }
export interface QuestionRow {
  question: string;
  named: string[];       // engines that named the brand
  answered: string[];    // engines that gave an answer (named or not)
  rivals: string[];
  group: 'win' | 'weak' | 'miss';
}
export interface CompetitorRow { name: string; you: boolean; share: number; mentions: number; change: number | null; other?: boolean }
export interface SourceRow { domain: string; citations: number; type: 'own' | 'list' | '' }
export interface Note { title: string; text: string; alert?: boolean }
export interface Step { title: string; why: string; todo: string }

export interface ReportData {
  brand: string;
  site: string;
  location: string;
  scanDate: string;
  scanned: boolean;
  sov: number;
  named: number;
  total: number;
  goal: number | null;
  target: number;            // goal, or a suggested next target when no goal is set
  dots: { perDot: number; filled: number; count: number };
  best: EngineRow | null;
  gap: EngineRow | null;
  engines: EngineRow[];
  engineNotes: Note[];
  columns: string[];         // engines that are part of this scan, for the question table
  questions: QuestionRow[];  // grouped and sorted: win, weak, miss
  competitors: CompetitorRow[];
  rank: number;
  rivals: number;
  leadText: string;
  leader: boolean;
  sources: SourceRow[];
  citationsTotal: number;
  citationsOwn: number;
  listingCitations: number;
  tone: { positive: number; neutral: number; negative: number };
  steps: Step[];
}

export interface ReportOptions {
  /** Open recommendations from the recommendations table, used to fill the plan. */
  recommendations?: { title: string; description?: string | null }[];
}

function results(run: AnyObj | null | undefined): AnyObj[] {
  return Array.isArray(run?.allResults) ? run!.allResults : [];
}

/** Dot field: one dot per answer, scaled so it never passes 12 rows of 13. */
function dotField(named: number, total: number) {
  const MAX = 13 * 12;
  const perDot = total > MAX ? Math.ceil(total / MAX) : 1;
  const count = Math.ceil(total / perDot);
  const filled = Math.min(count, Math.round(named / perDot));
  return { perDot, filled, count };
}

export function buildReportData(brand: AnyObj, opts: ReportOptions = {}): ReportData {
  const name = String(brand?.name || 'Your brand');
  const site = displaySite(brand?.website);
  const location = String(brand?.city || '').trim();
  const runs = realRuns(brand);
  const last = runs[runs.length - 1] || null;
  const vis: AnyObj = visibilitySummary(brand);
  const goal = Number(brand?.goal) > 0 ? Math.round(Number(brand.goal)) : null;

  const empty: ReportData = {
    brand: name, site, location, scanDate: fmtReportDate(Date.now()), scanned: false,
    sov: 0, named: 0, total: 0, goal, target: goal || 20, dots: { perDot: 1, filled: 0, count: 0 },
    best: null, gap: null, engines: [], engineNotes: [], columns: [], questions: [],
    competitors: [], rank: 1, rivals: 0, leadText: '', leader: true, sources: [], citationsTotal: 0,
    citationsOwn: 0, listingCitations: 0, tone: { positive: 0, neutral: 0, negative: 0 }, steps: [],
  };
  if (!last || !vis.scanned) return empty;

  const ok = results(last).filter(r => !r.error);
  const sov: number = vis.shareOfVoice;
  const named: number = vis.answersNamingBrand;
  const total: number = vis.answersTotal;

  // ── engines (page 2): every engine in the scan, high to low ──
  const answeredBy = new Map<string, number>();
  for (const r of ok) { const e = engineName(r.platform); if (e) answeredBy.set(e, (answeredBy.get(e) || 0) + 1); }
  const engines: EngineRow[] = (vis.engines as AnyObj[]).map(e => ({
    engine: e.engine, sov: e.sov ?? 0, change: e.change, answered: answeredBy.get(e.engine) || 0, band: band(e.sov ?? 0),
  }));
  // Engines that answered but have no per-platform score stored still count.
  for (const [e, n] of answeredBy) {
    if (!engines.some(x => x.engine === e)) {
      const m = ok.filter(r => engineName(r.platform) === e && r.mentioned).length;
      const v = Math.round((m / n) * 100);
      engines.push({ engine: e, sov: v, change: null, answered: n, band: band(v) });
    }
  }
  engines.sort((a, b) => b.sov - a.sov || ENGINES.indexOf(a.engine as any) - ENGINES.indexOf(b.engine as any));
  const answering = engines.filter(e => e.answered > 0);
  const best = (answering[0] || engines[0]) ?? null;
  const gap = (answering[answering.length - 1] || engines[engines.length - 1]) ?? null;

  // ── questions (page 3) ──
  const qs: AnyObj = questionSummary(brand, 'all');
  const columns = ENGINES.filter(e => engines.some(x => x.engine === e));
  const order = new Map<string, number>();
  ok.forEach((r, i) => { if (r.query && !order.has(r.query)) order.set(r.query, i); });
  const questions: QuestionRow[] = (qs.questions as AnyObj[]).map(q => {
    const namedE: string[] = q.enginesNamingBrand;
    const answered = [...new Set([...namedE, ...q.enginesNotNamingBrand])];
    const group: QuestionRow['group'] = q.winning ? 'win' : namedE.length > 0 ? 'weak' : 'miss';
    return { question: q.question, named: namedE, answered, rivals: q.rivalsNamedInstead, group };
  });
  const gOrder = { win: 0, weak: 1, miss: 2 } as const;
  questions.sort((a, b) => gOrder[a.group] - gOrder[b.group] || b.named.length - a.named.length
    || (order.get(a.question) ?? 0) - (order.get(b.question) ?? 0));

  // ── competitors (page 4) ──
  const comp: AnyObj = competitorSummary(brand);
  const rowsAll: CompetitorRow[] = (comp.rows as AnyObj[]).map(r => ({ name: r.name, you: r.you, share: r.share, mentions: r.mentions, change: r.change }));
  const me = rowsAll.find(r => r.you)!;
  const others = rowsAll.filter(r => !r.you);
  const shown = others.slice(0, 4);
  const rest = others.slice(4);
  const competitors: CompetitorRow[] = [me, ...shown];
  if (rest.length) {
    competitors.push({ name: `${rest.length} other${rest.length > 1 ? 's' : ''}`, you: false, other: true,
      share: rest.reduce((s, r) => s + r.share, 0), mentions: rest.reduce((s, r) => s + r.mentions, 0), change: null });
  }
  const rank: number = comp.rank || 1;
  const leader = rank === 1;
  let leadText = 'Share of brand mentions across all AI answers in this scan. ';
  if (!others.length) leadText += `No rivals were named in this scan.`;
  else if (leader) {
    const next = others[0];
    const ratio = next.mentions > 0 ? me.mentions / next.mentions : Infinity;
    leadText += ratio >= 3 ? `${name} is named more than three times as often as ${next.name}.`
      : ratio >= 2 ? `${name} is named more than twice as often as ${next.name}.`
        : ratio > 1 ? `${name} is named more often than ${next.name}.`
          : `${name} and ${next.name} are named equally often.`;
  } else {
    const ahead = rowsAll[rank - 2];
    leadText += `${rowsAll[0].name} is named most. ${name} ranks #${rank} of ${rowsAll.length}, ${Math.max(1, ahead.share - me.share)} points behind ${ahead.name}.`;
  }

  // ── sources (page 4) ──
  const src: AnyObj = sourceSummary(brand, 50);
  const rivalHosts = new Set(others.map(r => hostOf(r.name)).filter(Boolean));
  const typed = (src.sources as AnyObj[]).map(s => ({
    domain: s.domain as string, citations: s.citations as number,
    type: (s.isYourSite ? 'own' : !rivalHosts.has(s.domain) && isListingHost(s.domain) ? 'list' : '') as SourceRow['type'],
  }));
  const sources = typed.slice(0, 10);
  const listingCitations = sources.filter(s => s.type === 'list').reduce((s, r) => s + r.citations, 0);

  // ── tone ──
  const positive = ok.filter(r => r.mentioned && r.sentiment === 'positive').length;
  const negative = ok.filter(r => r.mentioned && r.sentiment === 'negative').length;
  const tone = { positive, negative, neutral: Math.max(0, total - positive - negative) };

  const target = goal || Math.min(100, [20, 40, 60, 80, 100].find(t => t > sov) || 100);

  const data: ReportData = {
    brand: name, site, location, scanDate: fmtReportDate(vis.lastScanAt), scanned: true,
    sov, named, total, goal, target, dots: dotField(named, total), best, gap, engines,
    engineNotes: [], columns, questions,
    competitors, rank, rivals: others.length, leadText, leader, sources,
    citationsTotal: src.totalCitations, citationsOwn: src.ownSiteCitations, listingCitations, tone, steps: [],
  };
  data.engineNotes = engineNotes(data, runs.length > 1);
  data.steps = planSteps(data, ok, typed, brand, opts);
  return data;
}

/* ─── Page 2 takeaways ─── */

function engineNotes(d: ReportData, hasPrev: boolean): Note[] {
  const notes: Note[] = [];
  const S = (e: string) => SHORT_ENGINE[e] || e;
  const list = d.engines.filter(e => e.answered > 0).length ? d.engines.filter(e => e.answered > 0) : d.engines;
  const best = list[0];

  // 1. Best engine
  if (!best || best.sov === 0) {
    notes.push({ title: 'No engine names you yet', text: `Every engine left ${d.brand} out of its answers in this scan.` });
  } else {
    const isG = (e: string) => e === 'Google AI Overview' || e === 'Google AI Mode';
    const otherG = isG(best.engine) ? list.find(e => isG(e.engine) && e.engine !== best.engine) : undefined;
    if (otherG && otherG.sov >= 40) {
      notes.push({ title: 'Google is your home ground', text: `${S(best.engine)} names you in ${best.sov}% of answers, ${S(otherG.engine)} in ${otherG.sov}%.` });
    } else {
      notes.push({ title: `${S(best.engine)} is your strongest engine`, text: `It names you in ${best.sov}% of answers, against your ${d.sov}% average.` });
    }
  }

  // 2. Biggest move since the last scan
  const moved = d.engines.filter(e => typeof e.change === 'number');
  if (!hasPrev || !moved.length) {
    notes.push({ title: 'First scan', text: 'There is no earlier scan to compare with yet. The next scan will show what moved.' });
  } else {
    const up = [...moved].sort((a, b) => (b.change as number) - (a.change as number))[0];
    const down = [...moved].sort((a, b) => (a.change as number) - (b.change as number))[0];
    if ((up.change as number) > 0) {
      const from = up.sov - (up.change as number);
      notes.push({
        title: from === 0 ? `${S(up.engine)} woke up` : `${S(up.engine)} is climbing`,
        text: `Up ${up.change} points since the last scan, from ${from}% to ${up.sov}%.`,
      });
    } else if ((down.change as number) < 0) {
      notes.push({ title: 'No engine moved up', text: `The biggest drop was ${S(down.engine)}, down ${-(down.change as number)} points to ${down.sov}%.` });
    } else {
      notes.push({ title: 'Steady since last scan', text: 'No engine moved since the previous scan.' });
    }
  }

  // 3. Weakest engines
  const weak = list.filter(e => e.sov < 20);
  if (weak.length === 1 || weak.length === 2) {
    const names = weak.map(e => S(e.engine));
    notes.push({
      title: weak.length === 1 ? `${names[0]} is a blind spot` : `${joinAnd(names)} are blind spots`,
      text: `${joinAnd(weak.map(e => `${e.sov}%`))}. Fixing ${weak.length === 1 ? 'this one' : 'these two'} lifts the overall score fastest.`,
      alert: true,
    });
  } else if (weak.length > 2) {
    const names = weak.map(e => S(e.engine));
    notes.push({
      title: `${weak.length} engines are blind spots`,
      text: `${joinAnd(names)} name you in under 20% of answers. Start with the biggest audiences: ChatGPT and Google.`,
      alert: true,
    });
  } else if (list.length) {
    const low = list[list.length - 1];
    notes.push({ title: `${S(low.engine)} trails the rest`, text: `${low.sov}%, ${Math.max(0, d.sov - low.sov)} points below your average.` });
  }
  return notes;
}

/* ─── Page 5 plan ─── */

function planSteps(d: ReportData, ok: AnyObj[], allSources: SourceRow[], brand: AnyObj, opts: ReportOptions): Step[] {
  const steps: Step[] = [];
  const S = (e: string) => SHORT_ENGINE[e] || e;

  // 1. Questions where no engine names the brand.
  const miss = d.questions.filter(q => q.group === 'miss');
  if (miss.length) {
    const rivalCount = new Map<string, number>();
    miss.forEach(q => q.rivals.forEach(r => rivalCount.set(r, (rivalCount.get(r) || 0) + 1)));
    const rivals = [...rivalCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r]) => r);
    const quoted = miss.slice(0, 2).map(q => `“${q.question}”`);
    const more = miss.length > 2 ? ` and ${miss.length - 2} more` : '';
    const one = miss.length === 1;
    steps.push({
      title: `Answer the ${miss.length} buying question${one ? '' : 's'} AI ${rivals.length ? 'gives to rivals' : 'leaves you out of'}`,
      why: `${more ? quoted.join(', ') : joinAnd(quoted)}${more}. No engine names ${d.brand} for ${one ? 'it' : 'any of them'}.` +
        (rivals.length ? ` ${joinAnd(rivals)} win${rivals.length === 1 ? 's' : ''} ${one ? 'it' : 'these'}.` : ''),
      todo: `Build one page per question. Put a direct answer, a price range and real proof (photos, reviews, results) in the first screen.`,
    });
  }

  // 2. Engines under 20%.
  const weak = d.engines.filter(e => e.answered > 0 && e.sov < 20);
  if (weak.length) {
    // The three lowest engines, listed high to low.
    const w = [...weak].sort((a, b) => a.sov - b.sov).slice(0, 3).sort((a, b) => b.sov - a.sov);
    const parts = w.map((e, i) => (i === 0 ? `${S(e.engine)} names ${d.brand} in ${e.sov}% of answers` : `${S(e.engine)} in ${e.sov}%`));
    steps.push({
      title: `Close the ${joinAnd(w.map(e => S(e.engine)))} gap`,
      why: `${joinAnd(parts)}, against ${d.sov}% overall.`,
      todo: 'Get listed on Yelp, BBB and the main directories in your field with the same name, address and phone. These engines lean on such listings.',
    });
  }

  // 3. Listing and review sites AI reads.
  const lists = allSources.filter(s => s.type === 'list').slice(0, 5);
  if (lists.length) {
    const n = lists.reduce((s, r) => s + r.citations, 0);
    const word = NUM_WORDS[lists.length] || String(lists.length);
    steps.push({
      title: 'Get onto the lists AI reads',
      why: `${word} listing and review site${lists.length > 1 ? 's' : ''} (${joinAnd(lists.map(s => s.domain))}) ${lists.length > 1 ? 'are' : 'is'} cited ${n} times.`,
      todo: lists.length > 1
        ? `Pitch each one for a feature or a profile. Start with ${lists[0].domain} and ${lists[1].domain}.`
        : `Pitch ${lists[0].domain} for a feature or a profile.`,
    });
  }

  // 4. Mentions that do not recommend.
  if (d.named > 0 && d.tone.positive * 2 < d.named) {
    steps.push({
      title: 'Turn mentions into recommendations',
      why: `Only ${d.tone.positive} of ${d.total} answers speak positively about ${d.brand}. AI knows the name but rarely says why to choose it.`,
      todo: 'Publish case studies and collect fresh Google reviews that mention the service and the city.',
    });
  }

  // 5. Mentions without a link to the brand's site.
  const own = hostOf(String(brand?.website || ''));
  if (own) {
    const unlinked = ok.filter(r => r.mentioned).filter(r => {
      const cites: unknown[] = Array.isArray(r.citations) ? r.citations : Array.isArray(r.sources) ? r.sources : [];
      return !cites.some(u => { const h = hostOf(String(u)); return h === own || h.endsWith('.' + own); });
    }).length;
    if (unlinked > 0) {
      steps.push({
        title: `Make AI link to ${d.site}`,
        why: `${unlinked} answer${unlinked === 1 ? '' : 's'} name${unlinked === 1 ? 's' : ''} ${d.brand} without citing the website.`,
        todo: 'Add LocalBusiness, FAQ and Product schema, and a clear pricing page AI can quote.',
      });
    } else if (d.citationsOwn === 0 && d.named === 0) {
      steps.push({
        title: `Make ${d.site} a source AI can use`,
        why: `None of the ${d.citationsTotal} citations in this scan point to ${d.site}.`,
        todo: 'Add Organization, FAQ and Product schema, and pages that answer the tracked questions directly.',
      });
    }
  }

  // Fill from the stored recommendations, then a weak-question step.
  for (const r of opts.recommendations || []) {
    if (steps.length >= 5) break;
    const title = String(r.title || '').trim();
    if (!title || steps.some(s => s.title === title)) continue;
    steps.push({ title, why: String(r.description || '').trim() || 'Flagged by the Livesov fix list.', todo: 'Open the fix list in Livesov for the exact change.' });
  }
  const weakQ = d.questions.filter(q => q.group === 'weak');
  if (steps.length < 5 && weakQ.length) {
    steps.push({
      title: `Lift the ${weakQ.length} weak question${weakQ.length === 1 ? '' : 's'}`,
      why: `${weakQ.length} question${weakQ.length === 1 ? ' is' : 's are'} answered with ${d.brand} by only a few engines.`,
      todo: 'Add a short, direct answer to each question on the page that already ranks for it.',
    });
  }
  if (steps.length < 5) {
    steps.push({ title: 'Keep the scans running', why: `Share of voice is ${d.sov}% today.`, todo: 'Scan every week to see which change moved the score.' });
  }
  return steps.slice(0, 5);
}
