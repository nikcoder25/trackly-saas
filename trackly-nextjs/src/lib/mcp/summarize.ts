/**
 * Turns a stored brand (as GET /api/brands/:id returns it) into the compact
 * summaries the MCP tools hand to an AI assistant. Pure and dependency-light
 * so it unit-tests with plain objects. Mirrors the dashboard's Overview maths:
 * SOV is the latest scan's mention rate, rival share is a share of the pool
 * of the brand's mentions plus each rival's mentions.
 */

import { cleanCitationCounts } from '@/lib/citation-hosts';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyObj = Record<string, any>;

export const ENGINES = ['ChatGPT', 'Claude', 'Gemini', 'Perplexity', 'Grok'] as const;

function runTime(r: AnyObj): number {
  const t = new Date(r?.time || r?.date || r?.created_at || 0).getTime();
  return isNaN(t) ? 0 : t;
}

/** Completed scans, oldest first, without watchdog/emergency placeholder rows. */
export function realRuns(brand: AnyObj): AnyObj[] {
  const runs: AnyObj[] = Array.isArray(brand?.runs) ? brand.runs : [];
  return runs
    .filter(r => r && !r.watchdogReap && !r.emergencySave && runTime(r) > 0)
    .sort((a, b) => runTime(a) - runTime(b));
}

function results(run: AnyObj | null | undefined): AnyObj[] {
  return Array.isArray(run?.allResults) ? run!.allResults : [];
}

/** Canonical engine name for a result's platform string, or null. */
export function engineName(raw: unknown): string | null {
  const s = String(raw || '').toLowerCase();
  if (!s) return null;
  if (s.includes('gpt') || s.includes('openai') || s.includes('chatgpt')) return 'ChatGPT';
  if (s.includes('claude') || s.includes('anthropic')) return 'Claude';
  if (s.includes('gemini') || s.includes('google')) return 'Gemini';
  if (s.includes('perplexity') || s.includes('sonar')) return 'Perplexity';
  if (s.includes('grok') || s.includes('xai')) return 'Grok';
  return null;
}

function platformSov(pd: unknown): number | null {
  if (typeof pd === 'number') return Math.round(pd);
  if (pd && typeof pd === 'object' && typeof (pd as AnyObj).sov === 'number') return Math.round((pd as AnyObj).sov);
  return null;
}

function sovOf(run: AnyObj): number {
  if (typeof run?.sov === 'number' || typeof run?.sov === 'string') return Math.round(Number(run.sov) || 0);
  const ok = results(run).filter(r => !r.error);
  return ok.length ? Math.round((ok.filter(r => r.mentioned).length / ok.length) * 100) : 0;
}

export function iso(t: number | null): string | null {
  return t ? new Date(t).toISOString() : null;
}

export interface BrandBrief {
  id: string;
  name: string;
  website: string | null;
  location: string | null;
  lastScanAt: string | null;
  sov: number | null;
  scans: number;
  shared: boolean;
  locked: boolean;
}

export function brandBrief(brand: AnyObj): BrandBrief {
  const runs = realRuns(brand);
  const last = runs[runs.length - 1];
  return {
    id: String(brand.id),
    name: String(brand.name || 'Untitled brand'),
    website: brand.website || null,
    location: brand.city || null,
    lastScanAt: last ? iso(runTime(last)) : null,
    sov: last ? sovOf(last) : null,
    scans: runs.length,
    shared: !!brand.shared,
    locked: !!brand.lockedByPlan,
  };
}

export function visibilitySummary(brand: AnyObj) {
  const runs = realRuns(brand);
  const last = runs[runs.length - 1] || null;
  const prev = runs.length > 1 ? runs[runs.length - 2] : null;
  const goal = Number(brand.goal) || null;
  if (!last) {
    return { brand: String(brand.name || ''), scanned: false as const, trackedQuestions: Array.isArray(brand.queries) ? brand.queries.length : 0, goal };
  }
  const res = results(last);
  const ok = res.filter(r => !r.error);
  const sov = sovOf(last);
  const engines = ENGINES.map(name => {
    const key = Object.keys(last.platforms || {}).find(k => engineName(k) === name);
    const prevKey = prev ? Object.keys(prev.platforms || {}).find(k => engineName(k) === name) : undefined;
    const now = key ? platformSov(last.platforms[key]) : null;
    const before = prevKey ? platformSov(prev!.platforms[prevKey]) : null;
    return { engine: name, sov: now, change: now != null && before != null ? now - before : null };
  }).filter(e => e.sov != null);
  const sentiments = ok.filter(r => ['positive', 'neutral', 'negative'].includes(r.sentiment));
  return {
    brand: String(brand.name || ''),
    scanned: true as const,
    lastScanAt: iso(runTime(last)),
    shareOfVoice: sov,
    changeSinceLastScan: prev ? sov - sovOf(prev) : null,
    answersNamingBrand: ok.filter(r => r.mentioned).length,
    answersTotal: ok.length,
    failedAnswers: res.length - ok.length,
    positiveTonePercent: sentiments.length ? Math.round((sentiments.filter(r => r.sentiment === 'positive').length / sentiments.length) * 100) : null,
    goal,
    pointsToGoal: goal ? Math.max(0, goal - sov) : null,
    engines,
    history: runs.slice(-12).map(r => ({ date: iso(runTime(r)), shareOfVoice: sovOf(r) })),
  };
}

export function competitorSummary(brand: AnyObj) {
  const runs = realRuns(brand);
  const last = runs[runs.length - 1] || null;
  const prev = runs.length > 1 ? runs[runs.length - 2] : null;
  if (!last) return { brand: String(brand.name || ''), scanned: false as const, rows: [] as AnyObj[] };
  const share = (map: AnyObj, mine: number) => {
    const entries = Object.entries(map || {}).map(([k, v]) => [k, Number(v) || 0] as [string, number]);
    const total = entries.reduce((s, [, v]) => s + v, 0) + mine;
    return { entries, pct: (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0) };
  };
  const myNow = Number(last.totalM) || results(last).filter(r => r.mentioned).length;
  const myPrev = prev ? Number(prev.totalM) || results(prev).filter(r => r.mentioned).length : 0;
  const now = share(last.competitors, myNow);
  const before = prev ? share(prev.competitors, myPrev) : null;
  const prevMap: AnyObj = prev?.competitors || {};
  const rows = [
    { name: String(brand.name || 'You'), you: true, mentions: myNow, share: now.pct(myNow), change: before ? now.pct(myNow) - before.pct(myPrev) : null },
    ...now.entries.map(([name, n]) => ({
      name, you: false, mentions: n, share: now.pct(n),
      change: before && name in prevMap ? now.pct(n) - before.pct(Number(prevMap[name]) || 0) : null,
    })),
  ].sort((a, b) => b.share - a.share).map((r, i) => ({ rank: i + 1, ...r }));
  const me = rows.find(r => r.you)!;
  const ahead = rows[me.rank - 2];
  return {
    brand: String(brand.name || ''),
    scanned: true as const,
    lastScanAt: iso(runTime(last)),
    rank: me.rank,
    of: rows.length,
    nextRivalToPass: ahead ? { name: ahead.name, pointsBehind: Math.max(1, ahead.share - me.share) } : null,
    rows,
  };
}

export function questionSummary(brand: AnyObj, filter: 'all' | 'winning' | 'losing' = 'all') {
  const runs = realRuns(brand);
  const last = runs[runs.length - 1] || null;
  if (!last) return { brand: String(brand.name || ''), scanned: false as const, questions: [] as AnyObj[] };
  const map = new Map<string, { named: Set<string>; missed: Set<string>; rivals: Map<string, number> }>();
  for (const r of results(last)) {
    if (!r?.query || r.error) continue;
    const eng = engineName(r.platform);
    if (!eng) continue;
    const q = map.get(r.query) || { named: new Set(), missed: new Set(), rivals: new Map() };
    (r.mentioned ? q.named : q.missed).add(eng);
    for (const c of Array.isArray(r.competitorMentions) ? r.competitorMentions : []) {
      if (typeof c === 'string' && c.trim()) q.rivals.set(c, (q.rivals.get(c) || 0) + 1);
    }
    map.set(r.query, q);
  }
  const all = [...map.entries()].map(([question, q]) => {
    q.missed.forEach(e => { if (q.named.has(e)) q.missed.delete(e); });
    const answered = q.named.size + q.missed.size;
    return {
      question,
      enginesNamingBrand: [...q.named],
      enginesNotNamingBrand: [...q.missed],
      winning: answered > 0 && q.named.size * 2 >= answered,
      rivalsNamedInstead: [...q.rivals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name),
    };
  });
  const questions = all
    .filter(q => (filter === 'winning' ? q.winning : filter === 'losing' ? !q.winning : true))
    .sort((a, b) => a.enginesNamingBrand.length - b.enginesNamingBrand.length);
  return {
    brand: String(brand.name || ''),
    scanned: true as const,
    lastScanAt: iso(runTime(last)),
    winningCount: all.filter(q => q.winning).length,
    losingCount: all.filter(q => !q.winning).length,
    questions,
  };
}

export function mentionList(brand: AnyObj, opts: { engine?: string; question?: string; named?: boolean; limit?: number }) {
  const runs = realRuns(brand);
  const last = runs[runs.length - 1] || null;
  if (!last) return { brand: String(brand.name || ''), scanned: false as const, total: 0, answers: [] as AnyObj[] };
  const wantEngine = opts.engine ? engineName(opts.engine) : null;
  const q = opts.question ? opts.question.toLowerCase() : '';
  const rows = results(last).filter(r => {
    if (r.error) return false;
    if (wantEngine && engineName(r.platform) !== wantEngine) return false;
    if (q && !String(r.query || '').toLowerCase().includes(q)) return false;
    if (typeof opts.named === 'boolean' && !!r.mentioned !== opts.named) return false;
    return true;
  });
  const limit = Math.max(1, Math.min(50, opts.limit || 10));
  return {
    brand: String(brand.name || ''),
    scanned: true as const,
    lastScanAt: iso(runTime(last)),
    total: rows.length,
    answers: rows.slice(0, limit).map(r => {
      const answer = String(r.answer || r.response || '');
      const sources = (Array.isArray(r.sources) ? r.sources : Array.isArray(r.citations) ? r.citations : []).slice(0, 5).map(String);
      return {
        engine: engineName(r.platform) || String(r.platform || ''),
        question: String(r.query || ''),
        namedBrand: !!r.mentioned,
        position: typeof r.position === 'number' ? r.position : null,
        sentiment: r.sentiment || null,
        rivalsNamed: Array.isArray(r.competitorMentions) ? r.competitorMentions.slice(0, 5) : [],
        excerpt: answer.length > 600 ? answer.slice(0, 600) + '…' : answer,
        sources,
      };
    }),
  };
}

function hostOf(raw: string): string {
  try { return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return ''; }
}

export function sourceSummary(brand: AnyObj, limit = 15) {
  const runs = realRuns(brand);
  const last = runs[runs.length - 1] || null;
  if (!last) return { brand: String(brand.name || ''), scanned: false as const, sources: [] as AnyObj[] };
  const counts = cleanCitationCounts(last.citations);
  const own = hostOf(String(brand.website || ''));
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  return {
    brand: String(brand.name || ''),
    scanned: true as const,
    lastScanAt: iso(runTime(last)),
    totalCitations: total,
    ownSiteCitations: own ? entries.filter(([d]) => d === own || d.endsWith('.' + own) || d.startsWith(own + '/')).reduce((s, [, n]) => s + n, 0) : 0,
    sources: entries.slice(0, Math.max(1, Math.min(50, limit))).map(([domain, citations]) => ({
      domain, citations, share: total ? Math.round((citations / total) * 100) : 0,
      isYourSite: !!own && (domain === own || domain.endsWith('.' + own) || domain.startsWith(own + '/')),
    })),
  };
}
