/**
 * Brand fixtures for the AI Visibility PDF (scripts/render-report.ts and tests).
 * nestadu: rebuilt from design-reference/build_reference.py so the PDF can be
 *   compared with design-reference/report-reference.html.
 * lowSov: a 2% share-of-voice brand with 85 questions and 424 answers
 *   (dot-field scaling and multi-page question table).
 * fewQuestions: 3 questions, no goal, first scan, long brand name.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const ENG = ['ChatGPT', 'Claude', 'Gemini', 'Perplexity', 'Grok', 'Google AI Overview', 'Google AI Mode'];
const P = 'Perplexity', C = 'Claude', G = 'Gemini', X = 'ChatGPT', O = 'Google AI Overview', M = 'Google AI Mode';

function citeMap(top: [string, number][], total: number) {
  const m: Record<string, number> = Object.fromEntries(top);
  let left = total - top.reduce((s, [, n]) => s + n, 0);
  let i = 0;
  while (left > 0) { const n = Math.min(left, 3); m[`source${i++}.example.org`] = n; left -= n; }
  return m;
}

export function nestadu(): any {
  const qs: [string, string[], string[]][] = [
    ['Nestadu reputation', [X, P, G, M, O], []], ['Nestadu pricing', [P, C, M, G, O], []], ['what is Nestadu', [P, X, G, M, O], []],
    ['is Nestadu worth it', [X, G, M, O], []], ['compare Nestadu to others', [X, P, M, O], ['Abodu', 'Villa Homes', 'Samara']],
    ['does Nestadu offer good service', [P, G, M, O], []], ['Nestadu vs competitors', [P, C, G, M], ['Abodu', 'Samara', 'Villa Homes']],
    ['is Nestadu good', [X, M, G, O], []], ['ADU builder near Mill Valley CA', [G, M, O], []],
    ['best prefab ADU builders in the Bay Area', [P, G, O], ['Abodu', 'Villa Homes', 'Samara']],
    ['Nestadu customer experience', [X, G, O], []], ['prefab ADU builders in San Diego', [P, O], []],
    ['alternatives to Nestadu', [M, O], ['Abodu', 'Samara', 'Villa Homes']], ['ADU builders in Sacramento', [P], []],
    ['best prefab ADU companies in California', [O], ['Abodu', 'Villa Homes', 'Samara']],
    ['who builds 2 story ADUs in California', [], ['Villa Homes']],
    ['best modular ADU companies in Southern California', [], ['Abodu', 'Villa Homes', 'Samara']],
    ['how much does a prefab ADU cost in California', [], []],
    ['best ADU builders in Los Angeles', [], ['Abodu']], ['best ADU builder in California', [], ['Abodu', 'Villa Homes', 'Samara']],
  ];
  const all: any[] = [];
  let errLeft = 23, mi = 0;
  qs.forEach(([q, named, rivals], qi) => {
    ENG.forEach((e, ei) => {
      const isNamed = named.includes(e);
      if (!isNamed && e !== 'Grok' && errLeft > 0 && (qi + ei) % 3 === 0) { errLeft--; all.push({ query: q, platform: e, error: 'timeout' }); return; }
      const r: any = { query: q, platform: e, mentioned: isNamed, competitorMentions: isNamed ? [] : rivals, citations: [] };
      if (isNamed) {
        r.sentiment = mi < 5 ? 'positive' : mi < 11 ? 'negative' : 'neutral';
        r.citations = mi % 10 < 7 ? ['https://nestadu.com/pricing'] : ['https://angi.com/x'];
        mi++;
      }
      all.push(r);
    });
  });
  const sources: [string, number][] = [['nestadu.com', 75], ['google.com', 32], ['angi.com', 13], ['theprefablist.com', 13], ['tinyhousetalk.com', 11],
    ['facebook.com', 9], ['buildzoom.com', 9], ['dwellingindex.com', 9], ['aduwizard.com', 8], ['yelp.com', 7]];
  const platforms = { ChatGPT: { sov: 30 }, Claude: { sov: 10 }, Gemini: { sov: 50 }, Perplexity: { sov: 45 }, Grok: { sov: 0 }, 'Google AI Overview': { sov: 72 }, 'Google AI Mode': { sov: 53 } };
  const prevPlatforms = { ChatGPT: { sov: 30 }, Claude: { sov: 15 }, Gemini: { sov: 45 }, Perplexity: { sov: 0 }, Grok: { sov: 0 }, 'Google AI Overview': { sov: 75 }, 'Google AI Mode': { sov: 50 } };
  const ok = all.filter(r => !r.error);
  return {
    id: 'fx_nestadu', name: 'Nestadu', website: 'nestadu.com', city: 'Mill Valley, CA', goal: 70,
    runs: [
      { time: '2026-11-22T04:25:12.576Z', sov: 43, platforms: prevPlatforms, totalM: 65, competitors: { Abodu: 22, 'Villa Homes': 9, Samara: 4 }, allResults: [] },
      { time: '2026-11-22T04:39:15.010Z', sov: 43, platforms, totalM: ok.filter(r => r.mentioned).length,
        competitors: { Abodu: 22, 'Villa Homes': 13, Samara: 11 }, citations: citeMap(sources, 410), allResults: all },
    ],
  };
}

type Q = { question: string; enginesNamingBrand: string[]; enginesNotNamingBrand: string[]; rivalsNamedInstead: string[] };

/** 85 questions shaped like a real low-visibility scan: 82 missed, 1 weak, 2 won, 5 engines answering. */
function lowSovQuestions(): Q[] {
  const five = [X, C, G, O, M];
  const topics = ['ai consulting', 'nlp consulting', 'machine learning consulting', 'llm development', 'ai agent development', 'data science consulting', 'generative ai consulting'];
  const places = ['', ' london', ' bristol', ' edinburgh', ' cardiff', ' manchester', ' leeds', ' austin', ' new york', ' washington dc', ' for small business', ' services'];
  const rivalSets = [[], ['leewayhertz.com'], ['neurons-lab.com', 'leewayhertz.com'], [], ['addepto.com'], ['kanerika.com'], []];
  const out: Q[] = [];
  for (let i = 0; out.length < 82; i++) {
    const t = topics[i % topics.length], pl = places[Math.floor(i / topics.length) % places.length];
    const q = `${t}${pl}${i >= topics.length * places.length ? ' company' : ''}`;
    out.push({ question: q, enginesNamingBrand: [], enginesNotNamingBrand: i === 40 ? [X, C, G, O] : five, rivalsNamedInstead: rivalSets[i % rivalSets.length] });
  }
  out.push({ question: 'ai consulting glasgow', enginesNamingBrand: [G], enginesNotNamingBrand: [X, C, O, M], rivalsNamedInstead: [] });
  out.push({ question: 'miniml', enginesNamingBrand: [O, M, G], enginesNotNamingBrand: [C, X], rivalsNamedInstead: [] });
  out.push({ question: 'is Miniml worth it', enginesNamingBrand: [C, O, M, G], enginesNotNamingBrand: [X], rivalsNamedInstead: [] });
  return out;
}

export function lowSov(questions: Q[] = lowSovQuestions()): any {
  const all: any[] = [];
  for (const q of questions) {
    for (const e of q.enginesNamingBrand) all.push({ query: q.question, platform: e, mentioned: true, sentiment: 'neutral', competitorMentions: [] });
    for (const e of q.enginesNotNamingBrand) all.push({ query: q.question, platform: e, mentioned: false, competitorMentions: q.rivalsNamedInstead });
    all.push({ query: q.question, platform: 'Perplexity', error: 'quota' }, { query: q.question, platform: 'Grok', error: 'quota' });
  }
  const platforms = { ChatGPT: { sov: 0 }, Claude: { sov: 1 }, Gemini: { sov: 4 }, Perplexity: { sov: 0 }, Grok: { sov: 0 }, 'Google AI Overview': { sov: 2 }, 'Google AI Mode': { sov: 2 } };
  const prev = { ...platforms, Gemini: { sov: 2 } };
  const sources: [string, number][] = [['youtube.com', 197], ['reddit.com', 48], ['ibm.com', 44], ['linkedin.com', 26], ['google.com', 24], ['bcg.com', 20],
    ['n-ix.com', 17], ['clutch.co', 14], ['databricks.com', 12], ['mckinsey.com', 11], ['neurons-lab.com', 11], ['gartner.com', 10]];
  return {
    id: 'fx_low', name: 'Miniml', website: 'miniml.ai', city: 'Uk', goal: 70,
    runs: [
      { time: '2026-11-20T16:15:14.187Z', sov: 2, platforms: prev, totalM: 8, competitors: { 'leewayhertz.com': 26, 'neurons-lab.com': 10, 'addepto.com': 1, 'kanerika.com': 3 }, allResults: [] },
      { time: '2026-11-21T17:16:02.848Z', sov: 2, platforms, totalM: 8, competitors: { 'leewayhertz.com': 25, 'neurons-lab.com': 11, 'addepto.com': 4, 'kanerika.com': 3 }, citations: citeMap(sources, 1264), allResults: all },
    ],
  };
}

export function fewQuestions(): any {
  const qs: [string, string[]][] = [['best airport limo service in Detroit', [X, G, O, M]], ['Detroit party bus rental', [O]], ['wedding limousine Detroit price', []]];
  const all: any[] = [];
  for (const [q, named] of qs) for (const e of [X, C, G, P, O, M]) {
    const n = named.includes(e);
    all.push({ query: q, platform: e, mentioned: n, sentiment: n ? 'positive' : undefined, competitorMentions: n ? [] : ['Detroit Limo Co'], citations: n ? ['https://legendoztransportation.com/'] : [] });
  }
  const sv = (e: string) => Math.round(all.filter(r => r.platform === e && r.mentioned).length / 3 * 100);
  return {
    id: 'fx_few', name: 'Legend OZ Transportation', website: 'https://legendoztransportation.com/', city: 'Detroit, Michigan',
    runs: [{ time: '2026-11-22T06:05:19.726Z', platforms: Object.fromEntries([X, C, G, P, O, M].map(e => [e, { sov: sv(e) }])), totalM: 5,
      competitors: { 'Detroit Limo Co': 9, 'Motor City Rides': 3 }, citations: citeMap([['legendoztransportation.com', 5], ['yelp.com', 4], ['google.com', 3]], 30), allResults: all }],
  };
}
