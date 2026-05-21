'use client';

import { useState, useRef, useEffect } from 'react';

const STORAGE_KEY = 'trackly.backlink-tool.v2';
const MAX_LINK_COUNT = 5;
type PersistedState = {
  provider: 'claude' | 'openai';
  model: string;
  concurrency: number;
  moneySite: string;
  niche: string;
  location: string;
  authorInfo: string;
  linkPairs: LinkPair[];
  distributionMode: DistributionMode;
  count: number;
  wordCount: string;
  tone: string;
  placement: string;
  extras: string;
  externalLinkCount: number;
  serviceLinkCount: number;
  blogLinkCount: number;
  includeTable: boolean;
  includeImages: boolean;
  articles: Article[];
};

function clampCount(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(MAX_LINK_COUNT, Math.floor(n)));
}

type LinkPair = { id: number; keyword: string; link: string; weight: number };
type ArticleStatus = 'pending' | 'generating' | 'done' | 'error';
type Article = {
  index: number;
  status: ArticleStatus;
  title: string;
  content: string;
  error: string | null;
  pair: LinkPair;
};
type DistributionMode = 'rotate' | 'random' | 'weighted';
type GenStatus = { msg: string; type: 'loading' | 'success' | 'error' | 'warn' };

export default function BacklinkToolPage() {
  const [provider, setProvider] = useState<'claude' | 'openai'>('claude');
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [concurrency, setConcurrency] = useState(3);

  const [moneySite, setMoneySite] = useState('');
  const [niche, setNiche] = useState('');
  const [location, setLocation] = useState('');
  const [authorInfo, setAuthorInfo] = useState('');

  const [linkPairs, setLinkPairs] = useState<LinkPair[]>([
    { id: Date.now(), keyword: '', link: '', weight: 1 },
  ]);
  const [distributionMode, setDistributionMode] = useState<DistributionMode>('rotate');

  const [count, setCount] = useState(10);
  const [wordCount, setWordCount] = useState('600');
  const [tone, setTone] = useState('conversational');
  const [placement, setPlacement] = useState('natural');
  const [extras, setExtras] = useState('');
  const [externalLinkCount, setExternalLinkCount] = useState(3);
  const [serviceLinkCount, setServiceLinkCount] = useState(2);
  const [blogLinkCount, setBlogLinkCount] = useState(2);
  const [includeTable, setIncludeTable] = useState(false);
  const [includeImages, setIncludeImages] = useState(false);

  const [articles, setArticles] = useState<Article[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const shouldStopRef = useRef(false);
  const [genStatus, setGenStatus] = useState<GenStatus | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  // Load persisted state on first mount. Runs once - the `hydrated` flag
  // gates the save effect below so we don't overwrite saved data with
  // initial state before the load completes.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as Partial<PersistedState>;
        if (s.provider === 'claude' || s.provider === 'openai') setProvider(s.provider);
        if (typeof s.model === 'string') setModel(s.model);
        if (typeof s.concurrency === 'number') setConcurrency(s.concurrency);
        if (typeof s.moneySite === 'string') setMoneySite(s.moneySite);
        if (typeof s.niche === 'string') setNiche(s.niche);
        if (typeof s.location === 'string') setLocation(s.location);
        if (typeof s.authorInfo === 'string') setAuthorInfo(s.authorInfo);
        if (Array.isArray(s.linkPairs) && s.linkPairs.length > 0) setLinkPairs(s.linkPairs);
        if (s.distributionMode === 'rotate' || s.distributionMode === 'random' || s.distributionMode === 'weighted') {
          setDistributionMode(s.distributionMode);
        }
        if (typeof s.count === 'number') setCount(s.count);
        if (typeof s.wordCount === 'string') setWordCount(s.wordCount);
        if (typeof s.tone === 'string') setTone(s.tone);
        if (typeof s.placement === 'string') setPlacement(s.placement);
        if (typeof s.extras === 'string') setExtras(s.extras);
        const ec = clampCount(s.externalLinkCount);
        if (ec !== null) setExternalLinkCount(ec);
        const sc = clampCount(s.serviceLinkCount);
        if (sc !== null) setServiceLinkCount(sc);
        const bc = clampCount(s.blogLinkCount);
        if (bc !== null) setBlogLinkCount(bc);
        if (typeof s.includeTable === 'boolean') setIncludeTable(s.includeTable);
        if (typeof s.includeImages === 'boolean') setIncludeImages(s.includeImages);
        if (Array.isArray(s.articles)) {
          // Rehydrate any in-flight articles as errored so the UI doesn't
          // look stuck in 'generating' forever after a reload.
          const fixed = s.articles.map((a) =>
            a.status === 'generating' || a.status === 'pending'
              ? { ...a, status: 'error' as ArticleStatus, error: a.error || 'Interrupted (page reloaded)' }
              : a,
          );
          setArticles(fixed);
        }
      }
    } catch {
      /* corrupt storage - ignore */
    }
    setHydrated(true);
  }, []);

  // Persist on any relevant change. Skipped until the initial load runs.
  useEffect(() => {
    if (!hydrated) return;
    try {
      const snapshot: PersistedState = {
        provider, model, concurrency, moneySite, niche, location, authorInfo,
        linkPairs, distributionMode, count, wordCount, tone, placement, extras,
        externalLinkCount, serviceLinkCount, blogLinkCount,
        includeTable, includeImages, articles,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      /* quota exceeded - silently drop; user can clear manually */
    }
  }, [
    hydrated, provider, model, concurrency, moneySite, niche, location, authorInfo,
    linkPairs, distributionMode, count, wordCount, tone, placement, extras,
    externalLinkCount, serviceLinkCount, blogLinkCount,
    includeTable, includeImages, articles,
  ]);

  function handleProviderChange(p: 'claude' | 'openai') {
    setProvider(p);
    setModel(p === 'claude' ? 'claude-sonnet-4-6' : 'gpt-4o-mini');
  }

  const modelOptions =
    provider === 'claude'
      ? [
          { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (recommended)' },
          { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (faster/cheaper)' },
          { value: 'claude-opus-4-7', label: 'Claude Opus 4.7 (best quality)' },
        ]
      : [
          { value: 'gpt-4o-mini', label: 'GPT-4o Mini (recommended/cheap)' },
          { value: 'gpt-4o', label: 'GPT-4o (high quality)' },
          { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
        ];

  function addLinkPair() {
    setLinkPairs([...linkPairs, { id: Date.now() + Math.random(), keyword: '', link: '', weight: 1 }]);
  }
  function removeLinkPair(id: number) {
    if (linkPairs.length === 1) {
      alert('You must have at least one keyword/link pair');
      return;
    }
    setLinkPairs(linkPairs.filter((p) => p.id !== id));
  }
  function updateLinkPair(id: number, field: keyof LinkPair, value: string | number) {
    setLinkPairs(linkPairs.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  }

  const validPairs = linkPairs.filter((p) => p.keyword.trim() && p.link.trim());

  function getDistributionPreview(): string {
    if (validPairs.length === 0) return 'Add at least one keyword + link pair';
    if (distributionMode === 'rotate') {
      const per = Math.floor(count / validPairs.length);
      const extra = count % validPairs.length;
      return validPairs
        .map((p, i) => `${p.keyword || '(empty)'}: ~${per + (i < extra ? 1 : 0)}`)
        .join(' • ');
    } else if (distributionMode === 'random') {
      return `Each article randomly picks from ${validPairs.length} pair(s)`;
    } else {
      const tw = validPairs.reduce((s, p) => s + (p.weight || 1), 0);
      return validPairs
        .map((p) => `${p.keyword || '(empty)'}: ${(((p.weight || 1) / tw) * 100).toFixed(0)}%`)
        .join(' • ');
    }
  }

  function getPairForArticle(index: number): LinkPair {
    if (distributionMode === 'rotate') return validPairs[index % validPairs.length];
    if (distributionMode === 'random') return validPairs[Math.floor(Math.random() * validPairs.length)];
    const tw = validPairs.reduce((s, p) => s + (p.weight || 1), 0);
    let r = Math.random() * tw;
    for (const p of validPairs) {
      r -= p.weight || 1;
      if (r <= 0) return p;
    }
    return validPairs[0];
  }

  type PromptParams = {
    moneySite: string;
    niche: string;
    location: string;
    authorInfo: string;
    wordCount: string;
    tone: string;
    placement: string;
    extras: string;
    externalLinkCount: number;
    serviceLinkCount: number;
    blogLinkCount: number;
    includeTable: boolean;
    includeImages: boolean;
  };

  function buildPrompt(params: PromptParams, index: number, pair: LinkPair): string {
    const angles = [
      'ultimate beginner guide', 'common mistakes and how to avoid them',
      'expert tips and best practices', 'comparison and decision guide',
      'step-by-step how-to tutorial', 'industry trends and insights',
      'myths vs facts breakdown', 'cost and value analysis',
      'DIY vs professional approach', 'checklist style guide',
      'seasonal considerations', 'before and after scenarios',
      "buyer's decision framework", 'troubleshooting common issues',
      'small business perspective', "homeowner's guide",
      'frequently asked questions deep-dive', 'case study style narrative',
      'year-end review and predictions', 'regional/local considerations',
    ];
    const angle = angles[index % angles.length];

    let pl = params.placement;
    if (pl === 'random') pl = ['natural', 'early', 'conclusion'][Math.floor(Math.random() * 3)];
    let placementInstruction = 'Place the anchor link naturally somewhere in the middle of the article (around 40-60%).';
    if (pl === 'early') placementInstruction = 'Place the anchor link naturally within the first or second paragraph.';
    if (pl === 'conclusion') placementInstruction = 'Place the anchor link naturally in the conclusion section.';

    const cleanDomain = params.moneySite.replace(/\/$/, '');
    const updateDate = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const linkingRules: string[] = [
      `- ONE money-site backlink: <a href="${pair.link}">${pair.keyword}</a> placed naturally (no anchor variations, exact match only).`,
    ];
    if (params.serviceLinkCount > 0) {
      linkingRules.push(
        `- EXACTLY ${params.serviceLinkCount} internal link${params.serviceLinkCount > 1 ? 's' : ''} to RELATED SERVICE/COMMERCIAL pages on the same money site domain. Use natural anchor text. Format: <a href="${cleanDomain}/services">related service page</a>. Vary the path across links (e.g., /services, /about, /pricing, /contact, /resources). DO NOT reuse the exact money-site link from the rule above.`,
      );
    }
    if (params.blogLinkCount > 0) {
      linkingRules.push(
        `- EXACTLY ${params.blogLinkCount} internal link${params.blogLinkCount > 1 ? 's' : ''} to RELATED BLOGS on the same money site (e.g., <a href="${cleanDomain}/blog/related-topic">descriptive anchor</a>). Use realistic blog slug paths.`,
      );
    }
    if (params.externalLinkCount > 0) {
      linkingRules.push(
        `- EXACTLY ${params.externalLinkCount} EXTERNAL AUTHORITY link${params.externalLinkCount > 1 ? 's' : ''} to .gov, .edu, Wikipedia, EPA, DOE, industry associations, or major news outlets. Natural anchor text.`,
      );
    } else {
      linkingRules.push('- DO NOT include any external links to other websites or domains. Only the single money-site backlink above is permitted.');
    }
    const totalLinks = 1 + params.serviceLinkCount + params.blogLinkCount + params.externalLinkCount;
    linkingRules.push(`- Total link count target: EXACTLY ${totalLinks} link${totalLinks > 1 ? 's' : ''} per article (no more, no fewer).`);

    const mediaRules: string[] = [];
    if (params.includeTable) {
      mediaRules.push(
        'Include ONE relevant HTML <table> somewhere in the middle of the article. Use it for a comparison, pricing breakdown, pros/cons, statistics summary, or specs - whichever fits the angle. Use <thead> with <th> for the header row and <tbody>/<tr>/<td> for rows. Aim for 3-5 rows and 2-4 columns. The table must add real informational value, not just restate the prose.',
      );
    }
    if (params.includeImages) {
      mediaRules.push(
        'Include 1-2 <figure> blocks placed in different sections of the article. Each <figure> must contain an <img> with src="https://picsum.photos/seed/<unique-slug>/1200/630" (replace <unique-slug> with a short keyword-relevant slug, kebab-case, different for each image), descriptive alt text matching the article content, and a <figcaption> with a one-line caption. Example: <figure><img src="https://picsum.photos/seed/hvac-repair-tools/1200/630" alt="Technician inspecting an HVAC unit" /><figcaption>Routine inspection helps catch problems early.</figcaption></figure>',
      );
    }

    return `You are an expert SEO content writer creating a GEO-optimized article for off-page backlink purposes. The article must follow strict GEO (Generative Engine Optimization) and E-E-A-T standards to maximize AI citations and search visibility.

ARTICLE BRIEF:
- Niche: ${params.niche}
- Target Keyword (anchor text for money link): ${pair.keyword}
- Money-site anchor URL: ${pair.link}
- Money-site brand: ${params.moneySite}
- Article angle: ${angle}
- Article ID: ${index + 1}
- Tone: ${params.tone}
- Word count: approximately ${params.wordCount} words
- ${placementInstruction}
${params.location ? '- Local SEO location: ' + params.location : ''}
${params.extras ? '- Extra instructions: ' + params.extras : ''}

================================================================
CONTENT QUALITY RULES (FOLLOW EVERY SINGLE ONE)
================================================================

1. ANSWER CAPSULE TECHNIQUE
- The FIRST paragraph (right after H1) must be 40-60 words and directly answer the article's main question. No fluff intros, no "In today's world..." openings.
- Answer first, then provide context/explanation in following paragraphs.

2. SEMANTIC COMPLETENESS
- Every H2 section must stand alone. A reader landing on any section should understand it without reading the rest.
- Never use vague references like "as mentioned above" or "see below". Define terms where you use them.

3. CONTENT STRUCTURE
- Proper hierarchy: ONE <h1>, then <h2> for main sections, <h3> for sub-sections. Never skip levels.
- Paragraphs MUST be under 120 words (ideally 40-80 words). Break long ideas into multiple short paragraphs.
- Use <ol><li> NUMBERED lists for step-by-step processes.
- Use <ul><li> BULLET lists for key facts, features, or comparisons.

4. FACT DENSITY & STATISTICS
- Include at least one statistic, percentage, number, or concrete data point every 150-200 words.
- Use realistic, specific figures (e.g., "around 73% of homeowners", "average cost $3,500 to $7,000", "EPA reports show...", "according to a 2024 industry survey").
- Where possible, attribute the stat to a source (e.g., "according to the U.S. Department of Energy" or "per the EPA's 2023 report").

5. E-E-A-T SIGNALS (Experience, Expertise, Authority, Trust)
- End the article with an AUTHOR BIO section using this exact structure:
  <h2>About the Author</h2>
  <p>${params.authorInfo ? params.authorInfo + '. ' : "[Generate a realistic author name with credentials matching the niche - e.g., 'Sarah Mitchell is a certified HVAC technician with 12 years of industry experience and has written for trade publications']. "}The author specializes in [topic area relevant to the article].</p>
- Include a "Last Updated" line in italics just below the H1 title: <p><em>Last Updated: ${updateDate}</em></p>

6. LINKING STRATEGY (CRITICAL)
${linkingRules.join('\n')}

7. KEYWORD PLACEMENT
- Primary keyword "${pair.keyword}" MUST appear in the H1 title (naturally, not stuffed).
- Primary keyword MUST appear in the first 100 words of the article body.
- Use the keyword 2-4 more times throughout (avoid stuffing).
${params.location ? `- Mention "${params.location}" naturally at least once for local SEO relevance.` : ''}

8. CTA (Call to Action)
- End the article with a clear CTA paragraph before the author bio, pointing readers to take action (contact, get a quote, learn more, etc.) with a link to a service/contact page on ${params.moneySite}.

================================================================
HTML OUTPUT FORMAT
================================================================
Use ONLY these tags:
- <h1> for the title (exactly one)
- <h2> for main section headings
- <h3> for sub-sections
- <p> for paragraphs
- <ul><li> for bullet lists
- <ol><li> for numbered/process lists
- <strong> for bold emphasis
- <em> for italic (used for "Last Updated" line)
- <a href="..."> for links
- <table>, <thead>, <tbody>, <tr>, <th>, <td> for tabular data (ONLY if instructed in the MEDIA RULES section below)
- <figure>, <img>, <figcaption> for images (ONLY if instructed in the MEDIA RULES section below)
- NEVER use # ## ### markdown. NEVER use - or * for bullets. Real HTML tags only.
${mediaRules.length > 0 ? `
================================================================
MEDIA RULES
================================================================
${mediaRules.map((r) => '- ' + r).join('\n')}
` : ''}
================================================================
WRITING RULES
================================================================
- Write a 100% UNIQUE article. Topic angle: ${angle}.
- Topic must be informational and helpful related to the niche, NOT a direct sales pitch for the brand.
- NEVER use the em dash (the "—" character). Use commas, periods, or parentheses instead.
- BANNED WORDS (do not use any): unleash, leverage, optimize, elevate, transform, delve, dive into, navigate, robust, seamless, cutting-edge, game-changer.
- Conclusion heading must be specific and contextual (NOT "Conclusion", "Final Thoughts", "Wrapping Up", "Final Word", "In Closing"). Example: "What This Means for Your Home" or "Making Your Next Move".

================================================================
OUTPUT
================================================================
Return ONLY the article as clean HTML. No preamble, no explanation, no code fences. Start directly with <h1>. End with the author bio H2 section.`;
  }

  function cleanToHtml(content: string): string {
    let html = content.trim();
    html = html.replace(/^```(?:html|markdown)?\s*\n?/i, '').replace(/\n?```\s*$/, '');
    if (/^#+\s/m.test(html) && !/<h[1-6]/i.test(html)) {
      html = markdownToHtml(html);
    }
    return html.trim();
  }

  function markdownToHtml(md: string): string {
    let html = md;
    html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    const lines = html.split('\n');
    const out: string[] = [];
    let inList = false;
    for (const line of lines) {
      const m = line.match(/^[-*]\s+(.+)$/);
      if (m) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push('  <li>' + m[1] + '</li>');
      } else {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push(line);
      }
    }
    if (inList) out.push('</ul>');
    return out.join('\n').split(/\n\n+/).map((b) => {
      const t = b.trim();
      if (!t) return '';
      if (/^<(h[1-6]|ul|ol|li|p|div|blockquote)/i.test(t)) return t;
      return '<p>' + t.replace(/\n/g, ' ') + '</p>';
    }).filter(Boolean).join('\n\n');
  }

  function extractTitle(content: string): string | null {
    const h1 = content.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (h1) return h1[1].replace(/<[^>]+>/g, '').trim();
    const md = content.match(/^#\s+(.+)$/m);
    return md ? md[1].trim().replace(/[#*]/g, '') : null;
  }

  async function callGenerate(prompt: string): Promise<string> {
    const res = await fetch('/api/admin/backlink-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ provider, model, prompt, maxTokens: 4000 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data.content;
  }

  async function startGeneration() {
    if (validPairs.length === 0) {
      setGenStatus({ msg: 'Add at least one keyword + link pair', type: 'error' });
      return;
    }
    if (!moneySite.trim() || !niche.trim()) {
      setGenStatus({ msg: 'Fill money site URL and niche', type: 'error' });
      return;
    }
    if (count < 1 || count > 500) {
      setGenStatus({ msg: 'Count must be between 1 and 500', type: 'error' });
      return;
    }

    const params: PromptParams = {
      moneySite, niche, location, authorInfo, wordCount, tone, placement, extras,
      externalLinkCount, serviceLinkCount, blogLinkCount, includeTable, includeImages,
    };

    const assigned: LinkPair[] = [];
    if (distributionMode === 'rotate') {
      for (let i = 0; i < count; i++) assigned.push(validPairs[i % validPairs.length]);
    } else {
      for (let i = 0; i < count; i++) assigned.push(getPairForArticle(i));
    }

    const initial: Article[] = [];
    for (let i = 0; i < count; i++) {
      initial.push({ index: i, status: 'pending', title: `Article #${i + 1}`, content: '', error: null, pair: assigned[i] });
    }
    setArticles(initial);
    setIsRunning(true);
    shouldStopRef.current = false;
    setGenStatus({ msg: `Generating ${count} articles with ${concurrency} parallel workers...`, type: 'loading' });

    const queue = Array.from({ length: count }, (_, i) => i);
    const workersList: Promise<void>[] = [];

    const updateArticle = (idx: number, changes: Partial<Article>) => {
      setArticles((prev) => prev.map((a) => (a.index === idx ? { ...a, ...changes } : a)));
    };

    for (let w = 0; w < concurrency; w++) {
      workersList.push((async () => {
        while (queue.length > 0 && !shouldStopRef.current) {
          const idx = queue.shift();
          if (idx === undefined) break;
          updateArticle(idx, { status: 'generating' });
          try {
            const prompt = buildPrompt(params, idx, assigned[idx]);
            const raw = await callGenerate(prompt);
            const content = cleanToHtml(raw);
            const title = extractTitle(content) || `Article ${idx + 1}`;
            updateArticle(idx, { status: 'done', title, content });
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            updateArticle(idx, { status: 'error', error: msg });
          }
          await new Promise((r) => setTimeout(r, 200));
        }
      })());
    }

    await Promise.all(workersList);
    setIsRunning(false);

    setArticles((prev) => {
      const done = prev.filter((a) => a.status === 'done').length;
      const failed = prev.filter((a) => a.status === 'error').length;
      if (failed > 0) setGenStatus({ msg: `Finished. ${done} succeeded, ${failed} failed. Click Retry Failed to retry.`, type: 'warn' });
      else if (shouldStopRef.current) setGenStatus({ msg: `Stopped. ${done} of ${count} completed.`, type: 'warn' });
      else setGenStatus({ msg: `✓ All ${done} articles generated!`, type: 'success' });
      return prev;
    });
  }

  async function retryFailed() {
    const failedIdx = articles.filter((a) => a.status === 'error').map((a) => a.index);
    if (failedIdx.length === 0) return;
    setArticles((prev) => prev.map((a) => (a.status === 'error' ? { ...a, status: 'pending', error: null } : a)));
    setIsRunning(true);
    shouldStopRef.current = false;
    setGenStatus({ msg: 'Retrying failed articles...', type: 'loading' });

    const params: PromptParams = {
      moneySite, niche, location, authorInfo, wordCount, tone, placement, extras,
      externalLinkCount, serviceLinkCount, blogLinkCount, includeTable, includeImages,
    };
    const queue = [...failedIdx];

    const updateArticle = (idx: number, changes: Partial<Article>) => {
      setArticles((prev) => prev.map((a) => (a.index === idx ? { ...a, ...changes } : a)));
    };

    const workersList: Promise<void>[] = [];
    for (let w = 0; w < concurrency; w++) {
      workersList.push((async () => {
        while (queue.length > 0 && !shouldStopRef.current) {
          const idx = queue.shift();
          if (idx === undefined) break;
          const art = articles.find((a) => a.index === idx);
          if (!art) continue;
          updateArticle(idx, { status: 'generating' });
          try {
            const prompt = buildPrompt(params, idx, art.pair);
            const raw = await callGenerate(prompt);
            const content = cleanToHtml(raw);
            const title = extractTitle(content) || `Article ${idx + 1}`;
            updateArticle(idx, { status: 'done', title, content });
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            updateArticle(idx, { status: 'error', error: msg });
          }
          await new Promise((r) => setTimeout(r, 200));
        }
      })());
    }
    await Promise.all(workersList);
    setIsRunning(false);

    setArticles((prev) => {
      const failed = prev.filter((a) => a.status === 'error').length;
      if (failed > 0) setGenStatus({ msg: `${failed} still failed.`, type: 'warn' });
      else setGenStatus({ msg: '✓ All articles now complete!', type: 'success' });
      return prev;
    });
  }

  function stopGeneration() {
    shouldStopRef.current = true;
    setGenStatus({ msg: 'Stopping after current batch...', type: 'warn' });
  }

  function toggleExpand(idx: number) {
    const next = new Set(expanded);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setExpanded(next);
  }

  async function copyArticle(idx: number) {
    const a = articles.find((x) => x.index === idx);
    if (!a) return;
    const plain = a.content.replace(/<[^>]+>/g, '').replace(/\n\n+/g, '\n\n').trim();
    try {
      const w = window as unknown as { ClipboardItem?: typeof ClipboardItem };
      if (navigator.clipboard && w.ClipboardItem) {
        await navigator.clipboard.write([
          new w.ClipboardItem({
            'text/html': new Blob([a.content], { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
          }),
        ]);
        setGenStatus({ msg: '✓ Copied (rich format - paste anywhere)', type: 'success' });
      } else {
        await navigator.clipboard.writeText(a.content);
        setGenStatus({ msg: '✓ Copied as HTML source', type: 'success' });
      }
    } catch {
      await navigator.clipboard.writeText(a.content);
      setGenStatus({ msg: '✓ Copied', type: 'success' });
    }
    setTimeout(() => setGenStatus(null), 1800);
  }

  async function copyHtmlSource(idx: number) {
    const a = articles.find((x) => x.index === idx);
    if (!a) return;
    await navigator.clipboard.writeText(a.content);
    setGenStatus({ msg: '✓ HTML source copied', type: 'success' });
    setTimeout(() => setGenStatus(null), 2000);
  }

  async function copyAllArticles() {
    const done = articles.filter((a) => a.status === 'done');
    if (done.length === 0) {
      setGenStatus({ msg: 'No completed articles to copy', type: 'warn' });
      return;
    }
    const html = done
      .map(
        (a) =>
          `<!-- Article #${a.index + 1}: ${a.title} | Keyword: ${a.pair?.keyword || ''} | Link: ${a.pair?.link || ''} -->\n${a.content}`,
      )
      .join('\n\n<hr />\n\n');
    const plain = done
      .map((a) => {
        const body = a.content.replace(/<[^>]+>/g, '').replace(/\n\n+/g, '\n\n').trim();
        return `=== Article #${a.index + 1}: ${a.title} ===\nKeyword: ${a.pair?.keyword || ''}\nLink: ${a.pair?.link || ''}\n\n${body}`;
      })
      .join('\n\n----------------------------------------\n\n');
    try {
      const w = window as unknown as { ClipboardItem?: typeof ClipboardItem };
      if (navigator.clipboard && w.ClipboardItem) {
        await navigator.clipboard.write([
          new w.ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(html);
      }
      setGenStatus({ msg: `✓ Copied all ${done.length} articles to clipboard`, type: 'success' });
    } catch {
      try {
        await navigator.clipboard.writeText(html);
        setGenStatus({ msg: `✓ Copied all ${done.length} articles (HTML source)`, type: 'success' });
      } catch {
        setGenStatus({ msg: 'Copy failed - browser blocked clipboard access', type: 'error' });
      }
    }
    setTimeout(() => setGenStatus(null), 2500);
  }

  function slugify(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  }

  function downloadBlob(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadArticle(idx: number) {
    const a = articles.find((x) => x.index === idx);
    if (!a) return;
    const filename = `${(idx + 1).toString().padStart(3, '0')}-${slugify(a.title)}.html`;
    const full = `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<title>${a.title}</title>\n</head>\n<body>\n${a.content}\n</body>\n</html>`;
    downloadBlob(full, filename, 'text/html');
  }

  async function downloadAllZip() {
    const done = articles.filter((a) => a.status === 'done');
    if (done.length === 0) {
      setGenStatus({ msg: 'No articles to download yet', type: 'warn' });
      return;
    }
    let zip: import('jszip');
    try {
      const mod = await import('jszip');
      // jszip uses `export = JSZip` (CommonJS), so the runtime module
      // is either the constructor itself or wrapped in `.default`
      // depending on the bundler's interop. Try both.
      const Ctor = (mod as unknown as { default?: new () => import('jszip') }).default
        || (mod as unknown as new () => import('jszip'));
      zip = new Ctor();
    } catch {
      setGenStatus({ msg: 'Failed to load ZIP library', type: 'error' });
      return;
    }
    const byKw: Record<string, Article[]> = {};
    done.forEach((a) => {
      const k = a.pair ? slugify(a.pair.keyword) : 'general';
      if (!byKw[k]) byKw[k] = [];
      byKw[k].push(a);
    });
    Object.entries(byKw).forEach(([kw, arts]) => {
      arts.forEach((a) => {
        const filename = `${kw}/${(a.index + 1).toString().padStart(3, '0')}-${slugify(a.title)}.html`;
        const full = `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<title>${a.title}</title>\n</head>\n<body>\n${a.content}\n</body>\n</html>`;
        zip.file(filename, full);
      });
    });
    const indexContent = done.map((a) => `${a.index + 1}\t${a.title}\t${a.pair?.keyword || ''}\t${a.pair?.link || ''}`).join('\n');
    zip.file('INDEX.tsv', 'Article#\tTitle\tKeyword\tLink\n' + indexContent);
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `articles-${Date.now()}.zip`;
    link.click();
    URL.revokeObjectURL(url);
    setGenStatus({ msg: `✓ Downloaded ${done.length} articles as ZIP`, type: 'success' });
  }

  function exportCsv() {
    const done = articles.filter((a) => a.status === 'done');
    if (done.length === 0) return;
    const rows: (string | number)[][] = [['#', 'Title', 'Keyword', 'Anchor Link', 'Word Count', 'Content']];
    done.forEach((a) => {
      const wc = a.content.split(/\s+/).length;
      rows.push([a.index + 1, a.title, a.pair?.keyword || '', a.pair?.link || '', wc, a.content]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadBlob(csv, `articles-${Date.now()}.csv`, 'text/csv');
  }

  function clearResults() {
    if (!confirm('Clear all articles?')) return;
    setArticles([]);
    setGenStatus(null);
  }

  const totalDone = articles.filter((a) => a.status === 'done').length;
  const totalFailed = articles.filter((a) => a.status === 'error').length;
  const totalPending = articles.filter((a) => a.status === 'pending' || a.status === 'generating').length;
  const progressPct = articles.length > 0 ? (totalDone / articles.length) * 100 : 0;

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', color: 'var(--text)' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={styles.title}>Backlink Content Generate</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.95rem' }}>
          Admin tool — GEO-optimized articles for off-page SEO. API keys stay server-side.
        </p>
      </div>

      {/* AI CONFIG */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>AI Configuration</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            onClick={() => handleProviderChange('claude')}
            style={{ ...styles.providerTab, ...(provider === 'claude' ? styles.providerTabActive : {}) }}
          >
            Claude (Anthropic)
          </button>
          <button
            onClick={() => handleProviderChange('openai')}
            style={{ ...styles.providerTab, ...(provider === 'openai' ? styles.providerTabActive : {}) }}
          >
            OpenAI (ChatGPT)
          </button>
        </div>
        <div style={styles.formGrid}>
          <div>
            <label style={styles.label}>Model</label>
            <select value={model} onChange={(e) => setModel(e.target.value)} style={styles.input}>
              {modelOptions.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={styles.label}>Parallel Requests</label>
            <select value={concurrency} onChange={(e) => setConcurrency(parseInt(e.target.value))} style={styles.input}>
              <option value={1}>1 (slowest, safest)</option>
              <option value={3}>3 (balanced)</option>
              <option value={5}>5 (fast)</option>
              <option value={10}>10 (max speed)</option>
            </select>
          </div>
        </div>
        <div style={{ ...styles.help, marginTop: 8, color: 'var(--green)' }}>
          ✓ API key is stored securely on the server (env variable)
        </div>
      </div>

      {/* MONEY SITE */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>Money Site Info</div>
        <div style={styles.formGrid}>
          <div>
            <label style={styles.label}>Money Site URL</label>
            <input value={moneySite} onChange={(e) => setMoneySite(e.target.value)} placeholder="https://example.com" style={styles.input} />
          </div>
          <div>
            <label style={styles.label}>Niche / Industry</label>
            <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="HVAC, Paving, Moving etc" style={styles.input} />
          </div>
          <div>
            <label style={styles.label}>Local Service Area (optional)</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Detroit MI, Bulverde TX" style={styles.input} />
          </div>
          <div>
            <label style={styles.label}>Author Name & Credentials (optional)</label>
            <input value={authorInfo} onChange={(e) => setAuthorInfo(e.target.value)} placeholder="e.g. John Smith, certified HVAC tech 15+ years" style={styles.input} />
          </div>
        </div>
      </div>

      {/* LINK PAIRS */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>Anchor Text + Link Pairs</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {(['rotate', 'random', 'weighted'] as DistributionMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setDistributionMode(m)}
              style={{
                ...styles.modeBtn,
                ...(distributionMode === m ? styles.modeBtnActive : {}),
                flex: 1,
              }}
            >
              {m === 'rotate' ? 'Rotate Evenly' : m === 'random' ? 'Random' : 'Weighted'}
            </button>
          ))}
        </div>

        {linkPairs.map((pair, idx) => (
          <div key={pair.id} style={styles.linkPair}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600 }}>
                Pair #{idx + 1}
              </span>
              {linkPairs.length > 1 && (
                <button onClick={() => removeLinkPair(pair.id)} style={styles.removeBtn}>
                  Remove
                </button>
              )}
            </div>
            <div style={styles.formGrid}>
              <div>
                <label style={styles.label}>Target Keyword</label>
                <input value={pair.keyword} onChange={(e) => updateLinkPair(pair.id, 'keyword', e.target.value)} placeholder="hvac repair near me" style={styles.input} />
              </div>
              <div>
                <label style={styles.label}>Anchor Link URL</label>
                <input value={pair.link} onChange={(e) => updateLinkPair(pair.id, 'link', e.target.value)} placeholder="https://example.com/services/repair" style={styles.input} />
              </div>
              {distributionMode === 'weighted' && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={styles.label}>Weight (%) — higher = used more often</label>
                  <input type="number" min={0.1} step={0.1} value={pair.weight} onChange={(e) => updateLinkPair(pair.id, 'weight', parseFloat(e.target.value) || 1)} style={styles.input} />
                </div>
              )}
            </div>
          </div>
        ))}

        <button onClick={addLinkPair} style={styles.btnAdd}>+ Add Another Pair</button>

        <div style={styles.distInfo}>{getDistributionPreview()}</div>
      </div>

      {/* ARTICLE SETTINGS */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>Article Settings</div>
        <div style={styles.formGrid}>
          <div>
            <label style={styles.label}>Number of Articles</label>
            <input type="number" min={1} max={500} value={count} onChange={(e) => setCount(parseInt(e.target.value) || 1)} style={styles.input} />
            <div style={styles.help}>1 to 500 articles</div>
          </div>
          <div>
            <label style={styles.label}>Word Count</label>
            <select value={wordCount} onChange={(e) => setWordCount(e.target.value)} style={styles.input}>
              <option value="400">400 words</option>
              <option value="600">600 words</option>
              <option value="800">800 words</option>
              <option value="1000">1000 words</option>
              <option value="1500">1500 words</option>
            </select>
          </div>
          <div>
            <label style={styles.label}>Tone</label>
            <select value={tone} onChange={(e) => setTone(e.target.value)} style={styles.input}>
              <option value="informational">Informational</option>
              <option value="conversational">Conversational</option>
              <option value="professional">Professional</option>
              <option value="storytelling">Storytelling</option>
              <option value="listicle">Listicle</option>
            </select>
          </div>
          <div>
            <label style={styles.label}>Link Placement</label>
            <select value={placement} onChange={(e) => setPlacement(e.target.value)} style={styles.input}>
              <option value="natural">Natural (middle)</option>
              <option value="early">Early (1st-2nd para)</option>
              <option value="conclusion">Conclusion section</option>
              <option value="random">Random per article</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={styles.label}>Extra Instructions (optional)</label>
            <textarea value={extras} onChange={(e) => setExtras(e.target.value)} placeholder="e.g. Focus on Detroit area, mention luxury chauffeur service..." style={{ ...styles.input, minHeight: 60 }} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={styles.label}>Link Counts</label>
            <div style={styles.help}>The money-site backlink (your target keyword) is always included. Set any count to 0 to skip that type entirely.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 8 }}>
              <div>
                <label style={styles.label}>Outbound Authority Links</label>
                <input
                  type="number"
                  min={0}
                  max={MAX_LINK_COUNT}
                  value={externalLinkCount}
                  onChange={(e) => setExternalLinkCount(clampCount(parseInt(e.target.value, 10)) ?? 0)}
                  style={styles.input}
                />
                <div style={styles.help}>0-{MAX_LINK_COUNT}. Links to .gov, .edu, Wikipedia, etc.</div>
              </div>
              <div>
                <label style={styles.label}>Internal Service Links</label>
                <input
                  type="number"
                  min={0}
                  max={MAX_LINK_COUNT}
                  value={serviceLinkCount}
                  onChange={(e) => setServiceLinkCount(clampCount(parseInt(e.target.value, 10)) ?? 0)}
                  style={styles.input}
                />
                <div style={styles.help}>0-{MAX_LINK_COUNT}. /services, /pricing, /about etc.</div>
              </div>
              <div>
                <label style={styles.label}>Internal Blog Links</label>
                <input
                  type="number"
                  min={0}
                  max={MAX_LINK_COUNT}
                  value={blogLinkCount}
                  onChange={(e) => setBlogLinkCount(clampCount(parseInt(e.target.value, 10)) ?? 0)}
                  style={styles.input}
                />
                <div style={styles.help}>0-{MAX_LINK_COUNT}. /blog/... posts on the money site.</div>
              </div>
            </div>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={styles.label}>Rich Content</label>
            <div style={styles.help}>Optional extras to include in the article body.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <label style={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={includeTable}
                  onChange={(e) => setIncludeTable(e.target.checked)}
                  style={styles.checkbox}
                />
                <span>
                  <strong>Include a Table</strong>
                  <span style={styles.toggleHint}> — model adds one comparison/stats/pricing table where it fits.</span>
                </span>
              </label>
              <label style={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={includeImages}
                  onChange={(e) => setIncludeImages(e.target.checked)}
                  style={styles.checkbox}
                />
                <span>
                  <strong>Include Placeholder Images</strong>
                  <span style={styles.toggleHint}> — adds 1-2 &lt;figure&gt; blocks using picsum.photos placeholders. Replace src with your own images later.</span>
                </span>
              </label>
            </div>
          </div>
        </div>
        <button onClick={startGeneration} disabled={isRunning} style={{ ...styles.btn, width: '100%', marginTop: 12, opacity: isRunning ? 0.5 : 1, cursor: isRunning ? 'not-allowed' : 'pointer' }}>
          {isRunning ? 'Generating...' : 'Generate Articles'}
        </button>
      </div>

      {/* PROGRESS */}
      {articles.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>Progress</div>
          <div style={styles.statsGrid}>
            <div style={styles.statBox}>
              <div style={{ ...styles.statValue, color: 'var(--primary)' }}>{articles.length}</div>
              <div style={styles.statLabel}>Total</div>
            </div>
            <div style={styles.statBox}>
              <div style={{ ...styles.statValue, color: 'var(--green)' }}>{totalDone}</div>
              <div style={styles.statLabel}>Completed</div>
            </div>
            <div style={styles.statBox}>
              <div style={{ ...styles.statValue, color: 'var(--red)' }}>{totalFailed}</div>
              <div style={styles.statLabel}>Failed</div>
            </div>
            <div style={styles.statBox}>
              <div style={{ ...styles.statValue, color: 'var(--amber)' }}>{totalPending}</div>
              <div style={styles.statLabel}>Pending</div>
            </div>
          </div>
          <div style={styles.progress}>
            <div style={{ ...styles.progressBar, width: `${progressPct}%` }} />
          </div>
          {genStatus && (
            <div style={{ ...styles.status, ...(genStatus.type === 'error' ? styles.statusError : genStatus.type === 'success' ? styles.statusSuccess : genStatus.type === 'warn' ? styles.statusWarn : styles.statusLoading) }}>
              {genStatus.msg}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isRunning && <button onClick={stopGeneration} style={styles.btnDanger}>Stop</button>}
            {!isRunning && totalFailed > 0 && <button onClick={retryFailed} style={styles.btnSmall}>Retry Failed</button>}
          </div>
        </div>
      )}

      {/* RESULTS */}
      {articles.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>Generated Articles</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 15, padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
            <button onClick={copyAllArticles} style={styles.btn} disabled={totalDone === 0}>
              Copy {totalDone} {totalDone === 1 ? 'Article' : 'Articles'}
            </button>
            <button onClick={downloadAllZip} style={styles.btnSuccess}>Download All (ZIP)</button>
            <button onClick={exportCsv} style={styles.btnSmall}>Export CSV</button>
            <button onClick={clearResults} style={styles.btnDanger}>Clear All</button>
          </div>
          {articles.map((a) => (
            <div key={a.index} style={styles.articleCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
                <div style={{ fontSize: '1rem', color: 'var(--primary)', fontWeight: 600, flex: 1, minWidth: 200 }}>
                  #{a.index + 1}: {a.title}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {a.pair && (
                    <span style={{ ...styles.badge, background: 'rgba(99,102,241,0.18)', color: 'var(--primary)' }}>
                      {a.pair.keyword}
                    </span>
                  )}
                  <span style={{
                    ...styles.badge,
                    ...(a.status === 'done' ? { background: 'rgba(34,197,94,0.18)', color: 'var(--green)' } :
                        a.status === 'error' ? { background: 'rgba(239,68,68,0.18)', color: 'var(--red)' } :
                        { background: 'rgba(245,158,11,0.18)', color: 'var(--amber)' })
                  }}>
                    {a.status === 'done' ? 'Done' : a.status === 'error' ? 'Failed' : a.status === 'generating' ? 'Generating...' : 'Pending'}
                  </span>
                </div>
              </div>
              {a.content && (
                <div style={styles.articleMeta}>
                  <span>{a.content.split(/\s+/).length} words</span>
                  {a.pair && <span>→ {a.pair.link}</span>}
                </div>
              )}
              {a.error && <div style={{ color: 'var(--red)', fontSize: '0.8rem', marginBottom: 8 }}>{a.error}</div>}
              {a.status === 'done' && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => toggleExpand(a.index)} style={styles.btnSmall}>
                    {expanded.has(a.index) ? 'Hide' : 'View'}
                  </button>
                  <button onClick={() => copyArticle(a.index)} style={styles.btnSmall}>Copy (Rich)</button>
                  <button onClick={() => copyHtmlSource(a.index)} style={styles.btnSmall}>Copy HTML</button>
                  <button onClick={() => downloadArticle(a.index)} style={styles.btnSmall}>Download</button>
                </div>
              )}
              {expanded.has(a.index) && a.content && (
                <div style={styles.articleContent} dangerouslySetInnerHTML={{ __html: a.content }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: {
    fontSize: '1.8rem',
    fontWeight: 700,
    marginBottom: 6,
    color: 'var(--text)',
  },
  card: {
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 22,
    marginBottom: 18,
  },
  cardTitle: { fontSize: '1rem', color: 'var(--text)', fontWeight: 700, marginBottom: 15 },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 12 },
  label: { display: 'block', fontSize: '0.82rem', color: 'var(--muted)', marginBottom: 6, fontWeight: 500 },
  help: { fontSize: '0.75rem', color: 'var(--muted)', marginTop: 4 },
  input: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 12px',
    color: 'var(--text)',
    fontSize: '0.9rem',
    width: '100%',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  btn: {
    background: 'var(--primary)',
    color: '#fff',
    border: 'none',
    padding: '12px 24px',
    borderRadius: 8,
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnSmall: {
    background: 'var(--bg)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  btnDanger: {
    background: 'var(--red)',
    color: '#fff',
    border: 'none',
    padding: '8px 14px',
    borderRadius: 6,
    fontSize: '0.85rem',
    cursor: 'pointer',
  },
  btnSuccess: {
    background: 'var(--green)',
    color: '#fff',
    border: 'none',
    padding: '8px 14px',
    borderRadius: 6,
    fontSize: '0.85rem',
    cursor: 'pointer',
  },
  btnAdd: {
    background: 'transparent',
    color: 'var(--primary)',
    border: '1px dashed var(--primary)',
    padding: '8px 14px',
    borderRadius: 6,
    fontSize: '0.85rem',
    cursor: 'pointer',
    marginTop: 8,
  },
  providerTab: {
    padding: '8px 14px',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: '0.85rem',
    color: 'var(--text)',
  },
  providerTabActive: { background: 'var(--primary)', borderColor: 'var(--primary)', color: '#fff' },
  modeBtn: {
    padding: 8,
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    color: 'var(--muted)',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: '0.85rem',
  },
  modeBtnActive: { background: 'var(--primary)', borderColor: 'var(--primary)', color: '#fff' },
  linkPair: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
  },
  removeBtn: {
    background: 'transparent',
    color: 'var(--red)',
    border: '1px solid var(--red)',
    padding: '4px 10px',
    borderRadius: 4,
    fontSize: '0.75rem',
    cursor: 'pointer',
  },
  distInfo: {
    background: 'rgba(99,102,241,0.08)',
    border: '1px solid var(--primary)',
    borderRadius: 6,
    padding: '10px 14px',
    fontSize: '0.82rem',
    marginTop: 10,
    color: 'var(--text)',
  },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 15 },
  statBox: {
    background: 'var(--bg)',
    padding: 12,
    borderRadius: 8,
    textAlign: 'center',
    border: '1px solid var(--border)',
  },
  statValue: { fontSize: '1.4rem', fontWeight: 700 },
  statLabel: { fontSize: '0.75rem', color: 'var(--muted)', marginTop: 4 },
  progress: {
    background: 'var(--bg)',
    borderRadius: 6,
    height: 8,
    margin: '12px 0',
    overflow: 'hidden',
  },
  progressBar: {
    background: 'var(--primary)',
    height: '100%',
    transition: 'width 0.3s',
  },
  status: { padding: 12, borderRadius: 8, margin: '12px 0', fontSize: '0.9rem' },
  statusLoading: { background: 'rgba(99,102,241,0.12)', border: '1px solid var(--primary)' },
  statusSuccess: { background: 'rgba(34,197,94,0.12)', border: '1px solid var(--green)' },
  statusError: { background: 'rgba(239,68,68,0.12)', border: '1px solid var(--red)' },
  statusWarn: { background: 'rgba(245,158,11,0.12)', border: '1px solid var(--amber)' },
  articleCard: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  articleMeta: {
    fontSize: '0.78rem',
    color: 'var(--muted)',
    marginBottom: 8,
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
  },
  articleContent: {
    background: 'var(--bg2)',
    padding: 18,
    borderRadius: 6,
    fontSize: '0.88rem',
    lineHeight: 1.7,
    maxHeight: 400,
    overflowY: 'auto',
    marginTop: 10,
    color: 'var(--text)',
  },
  badge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: '0.7rem',
    fontWeight: 600,
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '8px 12px',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: '0.85rem',
    color: 'var(--text)',
    cursor: 'pointer',
  },
  checkbox: {
    marginTop: 3,
    width: 16,
    height: 16,
    cursor: 'pointer',
    accentColor: 'var(--primary)',
  },
  toggleHint: {
    color: 'var(--muted)',
    fontWeight: 400,
  },
};
