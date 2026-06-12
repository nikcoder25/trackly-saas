'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  ANCHOR_TYPES,
  ANCHOR_LABELS,
  ANCHOR_HELP,
  ANCHOR_MIX_TOLERANCE,
  DEFAULT_ANCHOR_MIX,
  type AnchorType,
  anchorTextFor,
  assignAnchorTypes,
  normaliseMix,
  planAnchorAssignments,
} from '@/lib/anchor-mix';

const STORAGE_KEY = 'trackly.backlink-tool.v2';
const PRESETS_KEY = 'trackly.backlink-tool.presets.v1';
const MAX_LINK_COUNT = 5;
const INTERRUPTED_ERROR = 'Interrupted (page reloaded)';
// The API route rejects prompts over 20,000 chars; leave headroom for the
// wrapper buildClientPrompt adds around the pasted client instructions.
const CLIENT_PROMPT_LIMIT = 18000;

interface AnchorMixEditorProps {
  mix: Record<AnchorType, number>;
  count: number;
  onChange: (next: Record<AnchorType, number>) => void;
  previewParams: { moneySite: string; niche: string; location: string; sampleKeyword: string; sampleLink: string };
}

/**
 * Admin control for the anchor-text profile of a campaign. Renders one
 * row per AnchorType with the requested percentage, the resolved article
 * count for the current batch size, and a live preview of what the
 * actual anchor STRING will look like for that type.
 *
 * Three preset buttons cover the common shapes:
 *   • Balanced (the SEO default)
 *   • Branded-heavy (safe for fresh sites with no link history)
 *   • Exact-only (legacy behaviour — handy for re-running an old campaign)
 */
function AnchorMixEditor({ mix, count, onChange, previewParams }: AnchorMixEditorProps) {
  const total = ANCHOR_TYPES.reduce((s, t) => s + (mix[t] ?? 0), 0);
  const onTarget = Math.abs(total - 100) <= ANCHOR_MIX_TOLERANCE;
  const plan = planAnchorAssignments(Math.max(0, count), mix);

  const previewPair: LinkPair = {
    id: 0,
    keyword: previewParams.sampleKeyword,
    link: previewParams.sampleLink,
    weight: 1,
  };

  function setValue(type: AnchorType, raw: string) {
    const n = Math.max(0, Math.min(100, Math.round(parseFloat(raw) || 0)));
    onChange({ ...mix, [type]: n });
  }
  function reset(to: Record<AnchorType, number>) {
    onChange({ ...to });
  }
  function autoFill() {
    // Scale every non-zero row so the total reaches 100. Leaves zero
    // rows untouched so the admin can "turn off" a category and still
    // hit 100 across the rest.
    const sum = ANCHOR_TYPES.reduce((s, t) => s + (mix[t] ?? 0), 0);
    if (sum === 0) {
      onChange({ ...DEFAULT_ANCHOR_MIX });
      return;
    }
    const factor = 100 / sum;
    const scaled: Record<AnchorType, number> = { ...mix };
    let runningTotal = 0;
    let lastNonZero: AnchorType | null = null;
    for (const t of ANCHOR_TYPES) {
      const next = Math.round((mix[t] ?? 0) * factor);
      scaled[t] = next;
      runningTotal += next;
      if (next > 0) lastNonZero = t;
    }
    if (runningTotal !== 100 && lastNonZero) {
      scaled[lastNonZero] = Math.max(0, scaled[lastNonZero] + (100 - runningTotal));
    }
    onChange(scaled);
  }

  return (
    <>
      <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--muted)', marginBottom: 6, fontWeight: 500 }}>
        Anchor Text Mix
      </label>
      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 4, marginBottom: 8 }}>
        Distribution of anchor types across the money-site backlink. The total should add up to ~100%. Each generated article is pre-assigned a type so the realised mix matches what you set here.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <button type="button" onClick={() => reset(DEFAULT_ANCHOR_MIX)} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 6, fontSize: '0.78rem', cursor: 'pointer' }}>
          Balanced (default)
        </button>
        <button type="button" onClick={() => reset({ exact: 0, partial: 5, branded: 60, generic: 15, topical: 10, geo: 0, naked: 10, url: 0 })} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 6, fontSize: '0.78rem', cursor: 'pointer' }}>
          Branded-heavy
        </button>
        <button type="button" onClick={() => reset({ exact: 100, partial: 0, branded: 0, generic: 0, topical: 0, geo: 0, naked: 0, url: 0 })} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 6, fontSize: '0.78rem', cursor: 'pointer' }}>
          Exact only (legacy)
        </button>
        <button type="button" onClick={autoFill} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 6, fontSize: '0.78rem', cursor: 'pointer' }}>
          Auto-balance to 100%
        </button>
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.8fr 2fr', gap: 0, background: 'var(--bg)', padding: '8px 12px', fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700 }}>
          <div>Type</div>
          <div>Percent</div>
          <div style={{ textAlign: 'right' }}>Articles</div>
          <div>Example anchor</div>
        </div>
        {ANCHOR_TYPES.map((t, i) => {
          const sample = anchorTextFor(t, previewPair, previewParams.moneySite, previewParams.niche, previewParams.location, i);
          return (
            <div key={t} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.8fr 2fr', gap: 0, padding: '8px 12px', borderTop: '1px solid var(--border)', background: 'var(--bg2)', alignItems: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text)' }}>
                <div style={{ fontWeight: 600 }}>{ANCHOR_LABELS[t]}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>{ANCHOR_HELP[t]}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={mix[t] ?? 0}
                  onChange={(e) => setValue(t, e.target.value)}
                  style={{ width: 70, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', color: 'var(--text)', fontSize: '0.85rem' }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>%</span>
              </div>
              <div style={{ textAlign: 'right', fontSize: '0.85rem', color: 'var(--muted)' }} className="mono">
                {plan[t] ?? 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', overflowWrap: 'anywhere' }}>
                {sample ? `"${sample}"` : <span style={{ fontStyle: 'italic' }}>fill in money site / keyword to preview</span>}
              </div>
            </div>
          );
        })}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.8fr 2fr', gap: 0, padding: '8px 12px', borderTop: '1px solid var(--border)', background: 'var(--bg)', fontSize: '0.85rem', fontWeight: 700, color: onTarget ? 'var(--green)' : 'var(--red)' }}>
          <div>Total</div>
          <div>{total}%</div>
          <div style={{ textAlign: 'right' }} className="mono">{Math.max(0, count)}</div>
          <div style={{ color: onTarget ? 'var(--green)' : 'var(--red)' }}>
            {onTarget ? '✓ adds up to 100%' : `Adjust to 100% (currently ${total}%) — totals off-target will be normalised proportionally`}
          </div>
        </div>
      </div>
    </>
  );
}

// Topic angles rotated across a batch so each article gets a different
// take on the same brief. Shared by both the structured-form prompt and
// the client-prompt wrapper.
const ARTICLE_ANGLES = [
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

/**
 * Wraps the raw instructions the admin received from a customer in just
 * enough scaffolding to make the output usable by this tool: the client's
 * own rules stay authoritative, each article in the batch gets a
 * uniqueness directive, and the model is told to return clean HTML so the
 * preview/export pipeline works. `addOns` carries optional operator-set
 * campaign rules composed from the structured form sections the admin
 * chose to include alongside the brief.
 */
function buildClientPrompt(instructions: string, index: number, total: number, addOns = ''): string {
  const angle = ARTICLE_ANGLES[index % ARTICLE_ANGLES.length];
  const updateDate = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return `You are an expert SEO content writer producing an article for an off-page backlink campaign.

================================================================
CLIENT BRIEF
================================================================
The instructions below come directly from the client. Follow EVERY requirement and rule in them exactly (keywords, anchor texts, links, word count, tone, structure, topics, banned words, anything else they specify). Where the client's rules conflict with the generic guidance further down, the client's rules win.

"""
${instructions}
"""

================================================================
BATCH CONTEXT
================================================================
- This is article ${index + 1} of ${total} generated from the same client brief.
- Every article in the batch must be 100% unique: a different title, structure, examples, and wording from the others. Suggested angle for this one: ${angle}. If the brief prescribes specific topics or titles, follow the brief instead.
${addOns}
================================================================
SITE WRITING RULES (house defaults - the client brief above overrides any of these on conflict)
================================================================
- Do NOT include any links to other websites or domains, for any reason. When citing a statistic or source, name it inline in plain text right where the claim appears (e.g., "according to Energy Star"), citing the original source rather than an aggregator. Never hyperlink sources. Only links the client brief explicitly asks for are allowed.
- Answer the article's main question directly in the first 2-3 sentences of the intro (inverted pyramid), then expand.
- Open every H2 section with a direct, extractable answer, then expand. Use question-based H2 headings where natural ("How Much Does X Cost?"). Each section must stand alone if quoted by an AI engine.
- Include 2-3 sourced statistics with the source named inline, at least one expert-style quote or attributed statement, and specific numbers over vague claims ("save 20 to 30% on cooling costs", not "save money").
- Write like a real practitioner: local climate specifics, realistic local pricing ranges and timelines, relevant codes or permits, and common mistakes people make. Use first-hand framing where it fits ("our techs see this every winter"). Avoid generic content that could apply to any city or any company.
- Include ONE FAQ section near the end: an <h2> such as "Frequently Asked Questions About [topic]" with 3-5 real questions as <h3> headings, each answered directly in 2-4 sentences.
- Keep paragraphs to 2-3 lines and roughly a 65/35 paragraph-to-bullet ratio.
- Use the primary keyword (if the brief names one) naturally in the H1 near the start, in the first 100 words, and in at least one H2. NATURAL use only - keyword stuffing performs worse than no optimization.
- BANNED buzzwords (do not use any): unleash, leverage, optimize, elevate, transform, delve, dive into, navigate, robust, seamless, cutting-edge, game-changer.
- Conclusion heading must be specific and contextual. NEVER "Conclusion", "Final Thoughts", "Wrapping Up", "Final Word", or "In Closing".
- Include a visible "Last Updated" line in italics directly below the H1: <p><em>Last Updated: ${updateDate}</em></p>
- Give every image (if any) descriptive alt text that matches the article content.

================================================================
OUTPUT FORMAT
================================================================
- Return ONLY the article as clean HTML. No preamble, no explanation, no code fences. Start directly with <h1>.
- Use <h1> for the title (exactly one), <h2>/<h3> for section headings, <p> for paragraphs, <ul>/<ol> with <li> for lists, <strong>/<em> for emphasis, and <a href="..."> for any links the brief requires.
- NEVER use # ## ### markdown headings or - / * bullets. Real HTML tags only.
- NEVER use the em dash character "—" (Unicode U+2014) anywhere in the article. It is a telltale sign of AI-generated content. Use commas, periods, or parentheses instead.`;
}

// USD per 1M tokens. Numbers are list prices used only for a rough
// pre-flight estimate; real billing comes from the provider invoice.
const MODEL_RATES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5': { input: 0.8, output: 4.0 },
  'claude-opus-4-7': { input: 15.0, output: 75.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
};
type PresetState = {
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
  /** Optional on legacy presets — falls back to DEFAULT_ANCHOR_MIX when missing. */
  anchorMix?: Record<AnchorType, number>;
  /**
   * When true, anchors are distributed across the anchor-text mix above.
   * When false, every backlink uses the plain exact keyword as its anchor
   * (the simple "keyword + link pair" mode). Optional on legacy presets —
   * defaults to true so existing campaigns keep their mix.
   */
  useAnchorMix?: boolean;
  /** Operator-supplied real interlinks. Optional on legacy presets. */
  interlinks?: Interlink[];
  /** How many interlinks each article uses (rotated). 0 = all. Optional on legacy presets. */
  interlinksPerArticle?: number;
  /** Which generation mode the campaign uses. Optional on legacy presets — defaults to 'form'. */
  promptMode?: PromptMode;
  /** Raw instructions pasted from the customer for client-prompt mode. Optional on legacy presets. */
  clientPrompt?: string;
  /** Sections layered into client-prompt generation. Optional on legacy presets — default off. */
  includeMoneySiteSection?: boolean;
  includeLinkPairsSection?: boolean;
  includeSettingsSection?: boolean;
};
type PersistedState = PresetState & {
  articles: Article[];
};

function clampCount(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(MAX_LINK_COUNT, Math.floor(n)));
}

type LinkPair = { id: number; keyword: string; link: string; weight: number };
/** A real internal/interlink the operator supplies: clickable anchor text + destination URL. */
type Interlink = { id: number; anchor: string; url: string };
type ArticleStatus = 'pending' | 'generating' | 'done' | 'error';
type Article = {
  index: number;
  status: ArticleStatus;
  title: string;
  content: string;
  error: string | null;
  /** Keyword/link pair driving the structured-form prompt. Absent on client-prompt articles. */
  pair?: LinkPair;
  /**
   * Where the article's prompt came from. 'custom' articles are rebuilt
   * from the client-prompt textarea on retry/regenerate instead of from
   * the structured form fields. Optional for backward compat with
   * persisted Articles created before the mode existed (= 'form').
   */
  source?: 'form' | 'custom';
  /**
   * Anchor profile picked for this article. Resolved at startGeneration
   * time so re-runs / persistence keep the original mix even if the
   * admin tweaks the percentages mid-batch. Optional for backward compat
   * with persisted Articles created before the mix existed.
   */
  anchorType?: AnchorType;
  anchorText?: string;
};
type DistributionMode = 'rotate' | 'random' | 'weighted';
type PromptMode = 'form' | 'custom';
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
  const [interlinks, setInterlinks] = useState<Interlink[]>([]);
  const [interlinksPerArticle, setInterlinksPerArticle] = useState(2);

  const [count, setCount] = useState(10);
  const [wordCount, setWordCount] = useState('600');
  const [tone, setTone] = useState('conversational');
  const [placement, setPlacement] = useState('natural');
  const [extras, setExtras] = useState('');
  // Site rule: no links to other websites in the content. Sources are
  // named inline in plain text instead. Raise only when a client
  // explicitly wants outbound authority links.
  const [externalLinkCount, setExternalLinkCount] = useState(0);
  const [serviceLinkCount, setServiceLinkCount] = useState(2);
  const [blogLinkCount, setBlogLinkCount] = useState(2);
  const [includeTable, setIncludeTable] = useState(false);
  const [includeImages, setIncludeImages] = useState(false);
  const [anchorMix, setAnchorMix] = useState<Record<AnchorType, number>>({ ...DEFAULT_ANCHOR_MIX });
  const [useAnchorMix, setUseAnchorMix] = useState(true);
  // Client prompt is the default flow: paste the customer's brief at the
  // top of the page and generate. The structured form remains available
  // behind the mode toggle.
  const [promptMode, setPromptMode] = useState<PromptMode>('custom');
  const [clientPrompt, setClientPrompt] = useState('');
  const [includeMoneySiteSection, setIncludeMoneySiteSection] = useState(false);
  const [includeLinkPairsSection, setIncludeLinkPairsSection] = useState(false);
  const [includeSettingsSection, setIncludeSettingsSection] = useState(false);

  const [articles, setArticles] = useState<Article[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const shouldStopRef = useRef(false);
  const [genStatus, setGenStatus] = useState<GenStatus | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'done' | 'error' | 'pending'>('all');
  const [presets, setPresets] = useState<Record<string, PresetState>>({});
  const [activePresetName, setActivePresetName] = useState('');

  // Load presets once. Stored separately from STORAGE_KEY so the form
  // state and the named presets evolve independently.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRESETS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') setPresets(parsed);
    } catch {
      /* corrupt - ignore */
    }
  }, []);
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
        if (s.anchorMix && typeof s.anchorMix === 'object') setAnchorMix(normaliseMix(s.anchorMix));
        if (typeof s.useAnchorMix === 'boolean') setUseAnchorMix(s.useAnchorMix);
        if (Array.isArray(s.interlinks)) setInterlinks(s.interlinks);
        if (typeof s.interlinksPerArticle === 'number') setInterlinksPerArticle(Math.max(0, Math.floor(s.interlinksPerArticle)));
        if (s.promptMode === 'form' || s.promptMode === 'custom') setPromptMode(s.promptMode);
        if (typeof s.clientPrompt === 'string') setClientPrompt(s.clientPrompt);
        if (typeof s.includeMoneySiteSection === 'boolean') setIncludeMoneySiteSection(s.includeMoneySiteSection);
        if (typeof s.includeLinkPairsSection === 'boolean') setIncludeLinkPairsSection(s.includeLinkPairsSection);
        if (typeof s.includeSettingsSection === 'boolean') setIncludeSettingsSection(s.includeSettingsSection);
        if (Array.isArray(s.articles)) {
          // Rehydrate any in-flight articles as errored so the UI doesn't
          // look stuck in 'generating' forever after a reload.
          const fixed = s.articles.map((a) =>
            a.status === 'generating' || a.status === 'pending'
              ? { ...a, status: 'error' as ArticleStatus, error: a.error || INTERRUPTED_ERROR }
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
        linkPairs, distributionMode, interlinks, interlinksPerArticle, count, wordCount, tone, placement, extras,
        externalLinkCount, serviceLinkCount, blogLinkCount,
        includeTable, includeImages, anchorMix, useAnchorMix, promptMode, clientPrompt,
        includeMoneySiteSection, includeLinkPairsSection, includeSettingsSection, articles,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      /* quota exceeded - silently drop; user can clear manually */
    }
  }, [
    hydrated, provider, model, concurrency, moneySite, niche, location, authorInfo,
    linkPairs, distributionMode, interlinks, count, wordCount, tone, placement, extras,
    externalLinkCount, serviceLinkCount, blogLinkCount,
    includeTable, includeImages, anchorMix, useAnchorMix, promptMode, clientPrompt,
    includeMoneySiteSection, includeLinkPairsSection, includeSettingsSection, articles,
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

  const [csvInput, setCsvInput] = useState('');
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvMode, setCsvMode] = useState<'append' | 'replace'>('append');

  function addLinkPair() {
    setLinkPairs([...linkPairs, { id: Date.now() + Math.random(), keyword: '', link: '', weight: 1 }]);
  }

  function parseCsvLine(line: string): string[] {
    // Minimal CSV parser supporting quoted fields and either comma or
    // tab as the delimiter (so Excel/Sheets paste works either way).
    const delim = line.includes('\t') && !line.includes(',') ? '\t' : ',';
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else cur += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delim) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  }

  function importCsv() {
    const text = csvInput.trim();
    if (!text) {
      setGenStatus({ msg: 'Paste some CSV data first', type: 'error' });
      return;
    }
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const parsed: LinkPair[] = [];
    let skippedHeader = false;
    let skippedRows = 0;
    for (const line of lines) {
      const cols = parseCsvLine(line);
      const keyword = cols[0] || '';
      const link = cols[1] || '';
      const weightRaw = cols[2];
      // Heuristic: first row looks like a header if its second column
      // doesn't start with http(s) - skip it.
      if (!skippedHeader && parsed.length === 0 && link && !/^https?:\/\//i.test(link)) {
        skippedHeader = true;
        continue;
      }
      if (!keyword || !link) {
        skippedRows++;
        continue;
      }
      parsed.push({
        id: Date.now() + Math.random(),
        keyword,
        link,
        weight: weightRaw ? safeWeight(weightRaw) : 1,
      });
    }
    if (parsed.length === 0) {
      setGenStatus({ msg: 'No valid keyword/URL rows found. Expected: keyword,https://url[,weight]', type: 'error' });
      return;
    }
    if (csvMode === 'replace') {
      setLinkPairs(parsed);
    } else {
      const existing = linkPairs.filter((p) => p.keyword.trim() || p.link.trim());
      setLinkPairs(existing.length === 0 ? parsed : [...existing, ...parsed]);
    }
    setCsvInput('');
    setCsvOpen(false);
    const skippedNote = skippedRows > 0 ? ` (skipped ${skippedRows} invalid row${skippedRows === 1 ? '' : 's'})` : '';
    setGenStatus({ msg: `✓ Imported ${parsed.length} link pair${parsed.length === 1 ? '' : 's'}${skippedNote}`, type: 'success' });
    setTimeout(() => setGenStatus(null), skippedRows > 0 ? 4000 : 2000);
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
  const validInterlinks = interlinks.filter((l) => l.anchor.trim() && l.url.trim());

  function addInterlink() {
    setInterlinks([...interlinks, { id: Date.now() + Math.random(), anchor: '', url: '' }]);
  }
  function removeInterlink(id: number) {
    setInterlinks(interlinks.filter((l) => l.id !== id));
  }
  function updateInterlink(id: number, field: 'anchor' | 'url', value: string) {
    setInterlinks(interlinks.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }

  // Weighted distribution only behaves correctly with positive, finite
  // weights. A zero/negative/NaN weight would skew (or break) the running
  // total in getPairForArticle, so clamp everywhere a weight enters.
  const MIN_WEIGHT = 0.1;
  function safeWeight(value: unknown): number {
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    return Number.isFinite(n) && n >= MIN_WEIGHT ? n : 1;
  }

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
      const tw = validPairs.reduce((s, p) => s + safeWeight(p.weight), 0);
      return validPairs
        .map((p) => `${p.keyword || '(empty)'}: ${((safeWeight(p.weight) / tw) * 100).toFixed(0)}%`)
        .join(' • ');
    }
  }

  function getPairForArticle(index: number): LinkPair {
    if (distributionMode === 'rotate') return validPairs[index % validPairs.length];
    if (distributionMode === 'random') return validPairs[Math.floor(Math.random() * validPairs.length)];
    const tw = validPairs.reduce((s, p) => s + safeWeight(p.weight), 0);
    let r = Math.random() * tw;
    for (const p of validPairs) {
      r -= safeWeight(p.weight);
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
    interlinks: { anchor: string; url: string }[];
    interlinksPerArticle: number;
  };

  function buildPrompt(
    params: PromptParams,
    index: number,
    pair: LinkPair,
    anchorOverride?: { type: AnchorType; text: string },
  ): string {
    const angle = ARTICLE_ANGLES[index % ARTICLE_ANGLES.length];

    let pl = params.placement;
    if (pl === 'random') pl = ['natural', 'early', 'conclusion'][Math.floor(Math.random() * 3)];
    let placementInstruction = 'Place the anchor link naturally somewhere in the middle of the article (around 40-60%).';
    if (pl === 'early') placementInstruction = 'Place the anchor link naturally within the first or second paragraph.';
    if (pl === 'conclusion') placementInstruction = 'Place the anchor link naturally in the conclusion section.';

    const cleanDomain = params.moneySite.replace(/\/$/, '');
    const updateDate = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Compose the anchor text the model is REQUIRED to use for the
    // money-site backlink. If the parent supplied an explicit anchor
    // (from the configured mix), use it verbatim; otherwise fall back
    // to the legacy "exact match only" rule for backwards compat with
    // generation flows that don't go through startGeneration.
    const anchorType: AnchorType = anchorOverride?.type ?? 'exact';
    const anchorText = anchorOverride?.text?.trim() || pair.keyword.trim();
    const anchorTypeNote: Record<AnchorType, string> = {
      exact: 'exact-match keyword',
      partial: 'partial-match phrase',
      branded: 'brand name',
      generic: 'generic call-to-action anchor',
      topical: 'topical / LSI phrase',
      geo: 'geo-modified phrase',
      naked: 'naked URL (bare domain)',
      url: 'full URL',
    };
    const linkingRules: string[] = [
      `- ONE money-site backlink: <a href="${pair.link}">${anchorText}</a> placed naturally. Use this anchor text EXACTLY as written above — it has been pre-chosen as a ${anchorTypeNote[anchorType]} for this article's slot in the anchor-text mix. Do NOT paraphrase, expand, or substitute it.`,
    ];
    // Internal links: when the operator supplies explicit interlink
    // anchor+URL pairs, those REPLACE the AI-invented service/blog links so
    // every article only links to the real URLs provided. Otherwise fall
    // back to the model inventing service/blog paths on the money site.
    const useCustomInterlinks = params.interlinks.length > 0;
    let internalLinkCount: number;
    if (useCustomInterlinks) {
      // Rotate a window of `interlinksPerArticle` links across the batch so
      // articles don't all link to the same pages. Keyed on the article
      // index, so a retry of the same index reuses the same subset. A value
      // of 0 (or >= the list size) means "include all in every article".
      const all = params.interlinks;
      const per = params.interlinksPerArticle;
      let selected: { anchor: string; url: string }[];
      if (per <= 0 || per >= all.length) {
        selected = all;
      } else {
        selected = [];
        const start = (index * per) % all.length;
        for (let k = 0; k < per; k++) selected.push(all[(start + k) % all.length]);
      }
      internalLinkCount = selected.length;
      const list = selected
        .map((l) => `<a href="${l.url}">${l.anchor}</a>`)
        .join('\n  ');
      linkingRules.push(
        `- Include these EXACT internal interlink${selected.length > 1 ? 's' : ''}, each placed naturally in a relevant sentence and used exactly once:\n  ${list}\n  Use the anchor text and URL of each EXACTLY as written — do NOT paraphrase the anchor text, alter the URLs, or invent any other internal links to the money site.`,
      );
    } else {
      internalLinkCount = params.serviceLinkCount + params.blogLinkCount;
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
    }
    if (params.externalLinkCount > 0) {
      linkingRules.push(
        `- EXACTLY ${params.externalLinkCount} EXTERNAL AUTHORITY link${params.externalLinkCount > 1 ? 's' : ''} to .gov, .edu, Wikipedia, EPA, DOE, industry associations, or major news outlets. Natural anchor text.`,
      );
    } else {
      linkingRules.push('- DO NOT include any links to other websites or domains, for any reason. Only links to the money site are permitted. When citing statistics or sources, name them in plain text without a hyperlink.');
    }
    const totalLinks = 1 + internalLinkCount + params.externalLinkCount;
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
- Every H2 section must stand alone. A reader landing on any section should understand it without reading the rest - each section must hold up if quoted by an AI engine.
- Open every H2 section with a direct, extractable answer (2-3 sentences), then expand. Use question-based H2 headings where natural (e.g., "How Much Does X Cost?").
- Never use vague references like "as mentioned above" or "see below". Define terms where you use them.

3. CONTENT STRUCTURE
- Proper hierarchy: ONE <h1>, then <h2> for main sections, <h3> for sub-sections. Never skip levels.
- Paragraphs MUST be under 120 words (ideally 40-80 words). Break long ideas into multiple short paragraphs.
- Use <ol><li> NUMBERED lists for step-by-step processes.
- Use <ul><li> BULLET lists for key facts, features, or comparisons.
- Keep roughly a 65/35 paragraph-to-bullet ratio: prose carries the article, lists support it.

4. FACT DENSITY & STATISTICS
- Include at least one statistic, percentage, number, or concrete data point every 150-200 words.
- Use realistic, specific figures (e.g., "around 73% of homeowners", "average cost $3,500 to $7,000", "EPA reports show...", "according to a 2024 industry survey").
- Include 2-3 sourced statistics with the source NAMED INLINE in plain text right where the claim appears (e.g., "according to the U.S. Department of Energy"). Cite original sources, not aggregators. Do NOT hyperlink sources - links are governed solely by the LINKING STRATEGY rules below.
- Include at least one expert-style quote or attributed statement where it fits.
- Use specific numbers over vague claims ("save 20 to 30% on cooling costs", not "save money").

5. E-E-A-T SIGNALS (Experience, Expertise, Authority, Trust)
- Write like a real practitioner: include details only someone in the trade would know - local climate specifics, realistic local pricing ranges and timelines, relevant codes or permits, and common mistakes people make.${params.location ? ` Ground these details in ${params.location}.` : ''}
- Use first-hand framing where it fits (e.g., "our techs see this every winter"). Avoid generic content that could apply to any city or any company.
- End the article with an AUTHOR BIO section using this exact structure:
  <h2>About the Author</h2>
  <p>${params.authorInfo ? params.authorInfo + '. ' : "[Generate a realistic author name with credentials matching the niche - e.g., 'Sarah Mitchell is a certified HVAC technician with 12 years of industry experience and has written for trade publications']. "}The author specializes in [topic area relevant to the article].</p>
- Include a "Last Updated" line in italics just below the H1 title: <p><em>Last Updated: ${updateDate}</em></p>

6. LINKING STRATEGY (CRITICAL)
${linkingRules.join('\n')}

7. KEYWORD PLACEMENT
- Primary keyword "${pair.keyword}" MUST appear in the H1 title (naturally, near the start, not stuffed).
- Primary keyword MUST appear in the first 100 words of the article body and in at least one H2 heading.
- Use the keyword 2-4 more times throughout. NATURAL use only - keyword stuffing performs worse than no optimization.
${params.location ? `- Mention "${params.location}" naturally at least once for local SEO relevance.` : ''}

8. FAQ SECTION
- Include ONE FAQ section near the end (before the CTA and author bio): an <h2> such as "Frequently Asked Questions About [topic]" with 3-5 real questions as <h3> headings, each answered directly in 2-4 sentences.

9. CTA (Call to Action)
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
- NEVER use the em dash character (Unicode U+2014). Use commas, periods, or parentheses instead.
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
    // Both prompts ban the em dash (a telltale sign of AI-generated
    // content), but models still slip it in occasionally. Normalise any
    // survivors to a comma pause so no article ships with one.
    html = html.replace(/\s*—+\s*/g, ', ');
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
    // Scale the output budget with the requested length (~1.4 tokens per
    // word for HTML plus headroom) so 2,000-3,000 word guides don't get
    // truncated mid-article. Client-prompt briefs can demand any length,
    // so they always get the server-side maximum.
    const wc = parseInt(wordCount, 10);
    const maxTokens = promptMode === 'custom'
      ? 8000
      : Math.min(8000, Math.max(4000, Math.round((Number.isFinite(wc) ? wc : 1000) * 2)));
    const res = await fetch('/api/admin/backlink-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ provider, model, prompt, maxTokens }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data.content;
  }

  function buildParams(): PromptParams {
    return {
      moneySite, niche, location, authorInfo, wordCount, tone, placement, extras,
      externalLinkCount, serviceLinkCount, blogLinkCount, includeTable, includeImages,
      interlinks: validInterlinks.map((l) => ({ anchor: l.anchor.trim(), url: l.url.trim() })),
      interlinksPerArticle,
    };
  }

  /**
   * Composes the optional CAMPAIGN SETTINGS block appended to a client
   * prompt. Only the form sections the admin ticked in the Client Prompt
   * card contribute; with nothing ticked (or nothing filled in) the brief
   * goes out on its own, exactly as before.
   */
  function buildCustomAddOns(index: number, pair?: LinkPair, anchor?: { type: AnchorType; text: string }): string {
    const blocks: string[] = [];

    if (includeMoneySiteSection) {
      const lines: string[] = [];
      if (moneySite.trim()) lines.push(`- Money site (the brand/site these articles support): ${moneySite.trim()}`);
      if (niche.trim()) lines.push(`- Niche / industry: ${niche.trim()}`);
      if (location.trim()) lines.push(`- Local service area: ${location.trim()} — mention it naturally at least once for local SEO relevance.`);
      if (authorInfo.trim()) lines.push(`- End with an "About the Author" H2 section for this author: ${authorInfo.trim()}`);
      if (lines.length > 0) blocks.push(`MONEY SITE INFO:\n${lines.join('\n')}`);
    }

    if (includeLinkPairsSection && pair) {
      const anchorText = anchor?.text?.trim() || pair.keyword.trim();
      blocks.push(
        `MONEY-SITE BACKLINK (CRITICAL):\n- Include exactly ONE backlink to the money site: <a href="${pair.link}">${anchorText}</a> placed naturally in the article body. Use this anchor text EXACTLY as written — it has been pre-chosen for this article's slot in the anchor-text mix. Do NOT paraphrase, expand, or substitute it.\n- Target keyword for this article: "${pair.keyword}". Use it naturally in the H1 title and within the first 100 words.`,
      );
    }

    if (includeSettingsSection) {
      const lines: string[] = [
        `- Word count: approximately ${wordCount} words.`,
        `- Tone: ${tone}.`,
      ];
      if (includeLinkPairsSection && pair) {
        let pl = placement;
        if (pl === 'random') pl = ['natural', 'early', 'conclusion'][Math.floor(Math.random() * 3)];
        if (pl === 'early') lines.push('- Place the money-site backlink naturally within the first or second paragraph.');
        else if (pl === 'conclusion') lines.push('- Place the money-site backlink naturally in the conclusion section.');
        else lines.push('- Place the money-site backlink naturally somewhere in the middle of the article (around 40-60%).');
      }
      if (extras.trim()) lines.push(`- Extra instructions: ${extras.trim()}`);
      const cleanDomain = moneySite.trim().replace(/\/$/, '');
      const siteRef = cleanDomain || 'the money site';
      if (validInterlinks.length > 0) {
        const all = validInterlinks;
        const per = interlinksPerArticle;
        let chosen = all;
        if (per > 0 && per < all.length) {
          chosen = [];
          const start = (index * per) % all.length;
          for (let k = 0; k < per; k++) chosen.push(all[(start + k) % all.length]);
        }
        const list = chosen.map((l) => `<a href="${l.url.trim()}">${l.anchor.trim()}</a>`).join('\n  ');
        lines.push(`- Include these EXACT internal interlink${chosen.length > 1 ? 's' : ''}, each placed naturally in a relevant sentence and used exactly once:\n  ${list}\n  Use the anchor text and URL of each EXACTLY as written.`);
      } else {
        if (serviceLinkCount > 0) lines.push(`- Include EXACTLY ${serviceLinkCount} internal link${serviceLinkCount > 1 ? 's' : ''} to related service/commercial pages on ${siteRef} (e.g. /services, /pricing, /about) with natural anchor text.`);
        if (blogLinkCount > 0) lines.push(`- Include EXACTLY ${blogLinkCount} internal link${blogLinkCount > 1 ? 's' : ''} to related blog posts on ${siteRef} using realistic /blog/... slug paths.`);
      }
      if (externalLinkCount > 0) lines.push(`- Include EXACTLY ${externalLinkCount} external authority link${externalLinkCount > 1 ? 's' : ''} to .gov, .edu, Wikipedia, or industry associations with natural anchor text.`);
      else lines.push('- Do NOT include any links to other websites or domains, for any reason. When citing statistics or sources, name them in plain text without a hyperlink.');
      if (includeTable) lines.push('- Include ONE relevant HTML <table> (3-5 rows, 2-4 columns) using <thead>/<tbody>, placed where it adds real informational value.');
      if (includeImages) lines.push('- Include 1-2 <figure> blocks, each with an <img src="https://picsum.photos/seed/<unique-slug>/1200/630"> (keyword-relevant kebab-case slug, different per image), descriptive alt text, and a <figcaption>.');
      blocks.push(`ARTICLE SETTINGS:\n${lines.join('\n')}`);
    }

    if (blocks.length === 0) return '';
    return `
================================================================
CAMPAIGN SETTINGS (set by the operator — follow alongside the client brief)
================================================================
${blocks.join('\n\n')}
`;
  }

  // Shared worker pool used by initial generation, retry, regenerate, and
  // resume. Reads the pair AND the pre-assigned anchor profile for each
  // index from caller-supplied lookups so the realised anchor mix matches
  // what startGeneration planned even when a single article is retried.
  // Client-prompt articles bypass the form-driven buildPrompt entirely:
  // their finished prompt arrives via promptLookup.
  async function runWorkers(
    indices: number[],
    pairLookup: Map<number, LinkPair>,
    anchorLookup: Map<number, { type: AnchorType; text: string }>,
    promptLookup?: Map<number, string>,
  ) {
    if (indices.length === 0) return;
    const params = buildParams();
    const queue = [...indices];

    const updateArticle = (idx: number, changes: Partial<Article>) => {
      setArticles((prev) => prev.map((a) => (a.index === idx ? { ...a, ...changes } : a)));
    };

    const workersList: Promise<void>[] = [];
    for (let w = 0; w < concurrency; w++) {
      workersList.push((async () => {
        while (queue.length > 0 && !shouldStopRef.current) {
          const idx = queue.shift();
          if (idx === undefined) break;
          const customPrompt = promptLookup?.get(idx);
          const pair = pairLookup.get(idx);
          if (customPrompt === undefined && !pair) continue;
          const anchor = anchorLookup.get(idx);
          updateArticle(idx, { status: 'generating', error: null });
          try {
            const prompt = customPrompt !== undefined || !pair
              ? (customPrompt ?? '')
              : buildPrompt(params, idx, pair, anchor);
            const raw = await callGenerate(prompt);
            const content = cleanToHtml(raw);
            const title = extractTitle(content) || `Article ${idx + 1}`;
            updateArticle(idx, { status: 'done', title, content, error: null });
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            updateArticle(idx, { status: 'error', error: msg });
          }
          await new Promise((r) => setTimeout(r, 200));
        }
      })());
    }
    await Promise.all(workersList);
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

    const assigned: LinkPair[] = [];
    if (distributionMode === 'rotate') {
      for (let i = 0; i < count; i++) assigned.push(validPairs[i % validPairs.length]);
    } else {
      for (let i = 0; i < count; i++) assigned.push(getPairForArticle(i));
    }

    // Distribute the configured anchor mix across the batch and pin the
    // resolved type+text on each Article so retries/regenerations keep
    // the same anchor instead of resampling and skewing the totals. When
    // the mix is toggled off, every backlink just uses the exact keyword
    // (the simple "keyword + link pair" mode).
    const anchorTypes = useAnchorMix
      ? assignAnchorTypes(count, anchorMix)
      : (Array.from({ length: count }, () => 'exact') as AnchorType[]);
    const initial: Article[] = [];
    const lookup = new Map<number, LinkPair>();
    const anchorLookup = new Map<number, { type: AnchorType; text: string }>();
    for (let i = 0; i < count; i++) {
      const anchorType = anchorTypes[i] ?? 'exact';
      const anchorText = anchorTextFor(anchorType, assigned[i], moneySite, niche, location, i);
      initial.push({
        index: i,
        status: 'pending',
        title: `Article #${i + 1}`,
        content: '',
        error: null,
        pair: assigned[i],
        anchorType,
        anchorText,
      });
      lookup.set(i, assigned[i]);
      anchorLookup.set(i, { type: anchorType, text: anchorText });
    }
    setArticles(initial);
    setSelected(new Set());
    setIsRunning(true);
    shouldStopRef.current = false;
    setGenStatus({ msg: `Generating ${count} articles with ${concurrency} parallel workers...`, type: 'loading' });

    await runWorkers(Array.from({ length: count }, (_, i) => i), lookup, anchorLookup);
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

  async function startCustomGeneration() {
    const instructions = clientPrompt.trim();
    if (!instructions) {
      setGenStatus({ msg: 'Paste the client instructions into the prompt area first', type: 'error' });
      return;
    }
    if (instructions.length > CLIENT_PROMPT_LIMIT) {
      setGenStatus({ msg: `Client prompt too long (${instructions.length.toLocaleString()} chars, max ${CLIENT_PROMPT_LIMIT.toLocaleString()})`, type: 'error' });
      return;
    }
    if (count < 1 || count > 500) {
      setGenStatus({ msg: 'Count must be between 1 and 500', type: 'error' });
      return;
    }
    if (includeLinkPairsSection && validPairs.length === 0) {
      setGenStatus({ msg: 'Add at least one keyword + link pair, or untick the Anchor Text + Link Pairs section', type: 'error' });
      return;
    }

    // When the Link Pairs section is included, distribute the pairs and
    // the anchor mix across the batch exactly like the structured form
    // does, then pin the result on each Article so retries keep it.
    const assigned: LinkPair[] = [];
    let anchorTypes: AnchorType[] = [];
    if (includeLinkPairsSection) {
      if (distributionMode === 'rotate') {
        for (let i = 0; i < count; i++) assigned.push(validPairs[i % validPairs.length]);
      } else {
        for (let i = 0; i < count; i++) assigned.push(getPairForArticle(i));
      }
      anchorTypes = useAnchorMix
        ? assignAnchorTypes(count, anchorMix)
        : (Array.from({ length: count }, () => 'exact') as AnchorType[]);
    }

    const initial: Article[] = [];
    const promptLookup = new Map<number, string>();
    for (let i = 0; i < count; i++) {
      let pair: LinkPair | undefined;
      let anchor: { type: AnchorType; text: string } | undefined;
      if (includeLinkPairsSection) {
        pair = assigned[i];
        const type = anchorTypes[i] ?? 'exact';
        anchor = { type, text: anchorTextFor(type, pair, moneySite, niche, location, i) };
      }
      initial.push({
        index: i,
        status: 'pending',
        title: `Article #${i + 1}`,
        content: '',
        error: null,
        source: 'custom',
        pair,
        anchorType: anchor?.type,
        anchorText: anchor?.text,
      });
      promptLookup.set(i, buildClientPrompt(instructions, i, count, buildCustomAddOns(i, pair, anchor)));
    }
    setArticles(initial);
    setSelected(new Set());
    setIsRunning(true);
    shouldStopRef.current = false;
    setGenStatus({ msg: `Generating ${count} articles from the client prompt with ${concurrency} parallel workers...`, type: 'loading' });

    await runWorkers(Array.from({ length: count }, (_, i) => i), new Map(), new Map(), promptLookup);
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

  async function regenerateIndices(indices: number[], statusMsg: string) {
    if (indices.length === 0) return;
    const toRun = new Set(indices);
    // Client-prompt articles are rebuilt from the current prompt area, so
    // it must still hold the brief before they can be regenerated.
    const hasCustom = articles.some((a) => toRun.has(a.index) && a.source === 'custom');
    if (hasCustom && !clientPrompt.trim()) {
      setGenStatus({ msg: 'The client prompt area is empty — paste the client instructions before regenerating these articles', type: 'error' });
      return;
    }
    const lookup = new Map<number, LinkPair>();
    const anchorLookup = new Map<number, { type: AnchorType; text: string }>();
    const promptLookup = new Map<number, string>();
    const batchTotal = articles.length;
    articles.forEach((a) => {
      if (!toRun.has(a.index)) return;
      if (a.source === 'custom') {
        const anchor = a.anchorType
          ? { type: a.anchorType, text: a.anchorText ?? a.pair?.keyword ?? '' }
          : undefined;
        promptLookup.set(a.index, buildClientPrompt(clientPrompt.trim(), a.index, batchTotal, buildCustomAddOns(a.index, a.pair, anchor)));
        return;
      }
      if (!a.pair) return;
      lookup.set(a.index, a.pair);
      // Legacy persisted articles (from before the mix existed) won't
      // have anchorType set — fall back to the exact-match behaviour the
      // tool used at that time so a retry doesn't quietly change the
      // anchor under the user.
      const type: AnchorType = a.anchorType ?? 'exact';
      const text = a.anchorText
        ?? anchorTextFor(type, a.pair, moneySite, niche, location, a.index);
      anchorLookup.set(a.index, { type, text });
    });
    setArticles((prev) =>
      prev.map((a) => (toRun.has(a.index) ? { ...a, status: 'pending', content: '', error: null } : a)),
    );
    setIsRunning(true);
    shouldStopRef.current = false;
    setGenStatus({ msg: statusMsg, type: 'loading' });

    await runWorkers(indices, lookup, anchorLookup, promptLookup);
    setIsRunning(false);

    setArticles((prev) => {
      const failed = prev.filter((a) => toRun.has(a.index) && a.status === 'error').length;
      const done = prev.filter((a) => toRun.has(a.index) && a.status === 'done').length;
      if (failed > 0) setGenStatus({ msg: `${done} regenerated, ${failed} failed.`, type: 'warn' });
      else setGenStatus({ msg: `✓ Regenerated ${done} article${done === 1 ? '' : 's'}.`, type: 'success' });
      return prev;
    });
  }

  async function retryFailed() {
    const failedIdx = articles.filter((a) => a.status === 'error').map((a) => a.index);
    if (failedIdx.length === 0) return;
    await regenerateIndices(failedIdx, 'Retrying failed articles...');
  }

  async function regenerateSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Regenerate ${selected.size} selected article${selected.size > 1 ? 's' : ''}? Existing content will be replaced.`)) return;
    await regenerateIndices(Array.from(selected), `Regenerating ${selected.size} selected...`);
  }

  // Inline per-row regenerate. Failed articles retry immediately; done
  // articles confirm first since their content gets replaced. Either way
  // regenerateIndices reuses the article's pinned pair + anchor and the
  // index-keyed interlink rotation, so the campaign plan stays intact.
  async function regenerateOne(idx: number) {
    const a = articles.find((x) => x.index === idx);
    if (!a || isRunning) return;
    if (a.status === 'done' && !confirm(`Regenerate article #${idx + 1}? Its current content will be replaced.`)) return;
    await regenerateIndices([idx], `Regenerating article #${idx + 1}...`);
  }

  // Replaces the current selection with exactly the failed articles so a
  // partial batch (e.g. 25 failures out of 125) can be regenerated
  // without touching the completed ones.
  function selectFailed() {
    setSelected(new Set(articles.filter((a) => a.status === 'error').map((a) => a.index)));
  }

  async function resumeInterrupted() {
    const interruptedIdx = articles
      .filter((a) => a.status === 'error' && a.error === INTERRUPTED_ERROR)
      .map((a) => a.index);
    if (interruptedIdx.length === 0) return;
    await regenerateIndices(interruptedIdx, `Resuming ${interruptedIdx.length} interrupted article${interruptedIdx.length === 1 ? '' : 's'}...`);
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

  function toggleSelect(idx: number) {
    const next = new Set(selected);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setSelected(next);
  }

  function selectVisible() {
    // Select all currently-visible (filtered) articles. Adds to any
    // existing selection from rows that are not visible right now.
    setSelected((prev) => {
      const next = new Set(prev);
      filteredArticles.forEach((a) => next.add(a.index));
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function deleteArticles(indices: number[]) {
    if (indices.length === 0) return;
    const toRemove = new Set(indices);
    setArticles((prev) => prev.filter((a) => !toRemove.has(a.index)));
    setExpanded((prev) => {
      const next = new Set(prev);
      indices.forEach((i) => next.delete(i));
      return next;
    });
    setSelected((prev) => {
      const next = new Set(prev);
      indices.forEach((i) => next.delete(i));
      return next;
    });
  }

  function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected article${selected.size > 1 ? 's' : ''}?`)) return;
    deleteArticles(Array.from(selected));
    setGenStatus({ msg: `Deleted ${selected.size} article${selected.size > 1 ? 's' : ''}`, type: 'success' });
    setTimeout(() => setGenStatus(null), 1800);
  }

  function deleteOne(idx: number) {
    if (!confirm('Delete this article?')) return;
    deleteArticles([idx]);
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

  function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function copyAllArticles() {
    const done = articles.filter((a) => a.status === 'done');
    if (done.length === 0) {
      setGenStatus({ msg: 'No completed articles to copy', type: 'warn' });
      return;
    }
    // Every article gets a VISIBLE divider banner. HTML comments don't
    // survive a paste into Google Docs / Word, so the separator and the
    // article metadata must be real rendered content for a team member
    // scrolling the doc to see where one article ends and the next begins.
    const html = done
      .map((a, i) => {
        const meta = [
          a.pair?.keyword ? `Keyword: ${escapeHtml(a.pair.keyword)}` : '',
          a.pair?.link ? `Anchor link: ${escapeHtml(a.pair.link)}` : '',
        ].filter(Boolean).join(' &nbsp;•&nbsp; ');
        return [
          '<hr />',
          `<p style="text-align:center;background-color:#eef0ff;padding:10px 0;"><strong>━━━━━━━━━━ ARTICLE ${i + 1} OF ${done.length} ━━━━━━━━━━</strong></p>`,
          `<p style="text-align:center;"><strong>${escapeHtml(a.title)}</strong>${meta ? `<br /><em>${meta}</em>` : ''}</p>`,
          '<hr />',
          a.content,
        ].join('\n');
      })
      .join('\n\n');
    const plain = done
      .map((a, i) => {
        const body = a.content.replace(/<[^>]+>/g, '').replace(/\n\n+/g, '\n\n').trim();
        const metaLines = [
          a.pair?.keyword ? `Keyword: ${a.pair.keyword}` : '',
          a.pair?.link ? `Anchor link: ${a.pair.link}` : '',
        ].filter(Boolean).join('\n');
        return `${'='.repeat(56)}\nARTICLE ${i + 1} OF ${done.length}: ${a.title}\n${metaLines ? metaLines + '\n' : ''}${'='.repeat(56)}\n\n${body}`;
      })
      .join('\n\n\n');
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

  function getBaseFilename(): string {
    const today = new Date().toISOString().slice(0, 10);
    const nicheSlug = slugify(niche.trim()) || slugify(moneySite.replace(/^https?:\/\//, '').trim()) || 'backlink-articles';
    return `${nicheSlug}-${today}`;
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
    link.download = `${getBaseFilename()}.zip`;
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
    downloadBlob(csv, `${getBaseFilename()}.csv`, 'text/csv');
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
  const interruptedCount = articles.filter((a) => a.status === 'error' && a.error === INTERRUPTED_ERROR).length;

  const filteredArticles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return articles.filter((a) => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'pending') {
          if (a.status !== 'pending' && a.status !== 'generating') return false;
        } else if (a.status !== statusFilter) return false;
      }
      if (q) {
        const hay = `${a.title} ${a.pair?.keyword || ''} ${a.pair?.link || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [articles, searchQuery, statusFilter]);

  const visibleIndexSet = useMemo(() => new Set(filteredArticles.map((a) => a.index)), [filteredArticles]);
  const visibleSelectedCount = useMemo(() => {
    let n = 0;
    selected.forEach((i) => { if (visibleIndexSet.has(i)) n++; });
    return n;
  }, [selected, visibleIndexSet]);

  // Pre-flight cost estimate. Prompt overhead ~ 1500 input tokens; output
  // ~ wordCount * 1.4 (rough token-per-word average for HTML content).
  const estimatedCost = useMemo(() => {
    const rate = MODEL_RATES[model];
    if (!rate) return null;
    const wc = parseInt(wordCount, 10);
    if (!Number.isFinite(wc)) return null;
    const inputTokens = 1500;
    const outputTokens = Math.round(wc * 1.4);
    const perArticle = (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
    return perArticle * Math.max(1, count);
  }, [model, wordCount, count]);

  function savePreset() {
    const suggested = activePresetName || (niche ? niche.slice(0, 30) : '');
    const name = prompt('Save current settings as preset. Name:', suggested);
    if (!name || !name.trim()) return;
    const key = name.trim();
    const preset: PresetState = {
      provider, model, concurrency, moneySite, niche, location, authorInfo,
      linkPairs, distributionMode, interlinks, interlinksPerArticle, count, wordCount, tone, placement, extras,
      externalLinkCount, serviceLinkCount, blogLinkCount, includeTable, includeImages,
      anchorMix, useAnchorMix, promptMode, clientPrompt,
      includeMoneySiteSection, includeLinkPairsSection, includeSettingsSection,
    };
    const next = { ...presets, [key]: preset };
    setPresets(next);
    setActivePresetName(key);
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    } catch {
      /* quota - ignore */
    }
    setGenStatus({ msg: `✓ Saved preset "${key}"`, type: 'success' });
    setTimeout(() => setGenStatus(null), 1800);
  }

  function loadPreset(name: string) {
    if (!name) return;
    const p = presets[name];
    if (!p) return;
    setProvider(p.provider);
    setModel(p.model);
    setConcurrency(p.concurrency);
    setMoneySite(p.moneySite);
    setNiche(p.niche);
    setLocation(p.location);
    setAuthorInfo(p.authorInfo);
    setLinkPairs(p.linkPairs);
    setDistributionMode(p.distributionMode);
    setInterlinks(Array.isArray(p.interlinks) ? p.interlinks : []);
    setInterlinksPerArticle(typeof p.interlinksPerArticle === 'number' ? Math.max(0, Math.floor(p.interlinksPerArticle)) : 2);
    setCount(p.count);
    setWordCount(p.wordCount);
    setTone(p.tone);
    setPlacement(p.placement);
    setExtras(p.extras);
    setExternalLinkCount(p.externalLinkCount);
    setServiceLinkCount(p.serviceLinkCount);
    setBlogLinkCount(p.blogLinkCount);
    setIncludeTable(p.includeTable);
    setIncludeImages(p.includeImages);
    setAnchorMix(p.anchorMix ? normaliseMix(p.anchorMix) : { ...DEFAULT_ANCHOR_MIX });
    setUseAnchorMix(p.useAnchorMix ?? true);
    setPromptMode(p.promptMode === 'custom' ? 'custom' : 'form');
    setClientPrompt(typeof p.clientPrompt === 'string' ? p.clientPrompt : '');
    setIncludeMoneySiteSection(p.includeMoneySiteSection === true);
    setIncludeLinkPairsSection(p.includeLinkPairsSection === true);
    setIncludeSettingsSection(p.includeSettingsSection === true);
    setActivePresetName(name);
    setGenStatus({ msg: `✓ Loaded preset "${name}"`, type: 'success' });
    setTimeout(() => setGenStatus(null), 1800);
  }

  function deletePreset() {
    if (!activePresetName) return;
    if (!confirm(`Delete preset "${activePresetName}"?`)) return;
    const next = { ...presets };
    delete next[activePresetName];
    setPresets(next);
    setActivePresetName('');
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function clearForm() {
    const hasBusinessData = moneySite.trim() || niche.trim() || location.trim() || authorInfo.trim()
      || linkPairs.some((p) => p.keyword.trim() || p.link.trim()) || extras.trim() || clientPrompt.trim();
    if (hasBusinessData && !confirm('Clear all form fields for a new campaign? Generated articles below will be kept.')) return;
    setMoneySite('');
    setNiche('');
    setLocation('');
    setAuthorInfo('');
    setLinkPairs([{ id: Date.now(), keyword: '', link: '', weight: 1 }]);
    setDistributionMode('rotate');
    setCount(10);
    setExtras('');
    setClientPrompt('');
    setIncludeMoneySiteSection(false);
    setIncludeLinkPairsSection(false);
    setIncludeSettingsSection(false);
    setActivePresetName('');
    // AI provider/model, concurrency, word count, tone, placement, and the
    // link-count / table / images preferences are intentionally kept since
    // they're more like user defaults than campaign-specific data.
    setGenStatus({ msg: '✓ Form cleared - ready for a new campaign', type: 'success' });
    setTimeout(() => setGenStatus(null), 2000);
  }

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', color: 'var(--text)' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={styles.title}>Backlink Content Generate</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.95rem' }}>
          Admin tool - GEO-optimized articles for off-page SEO. API keys stay server-side.
        </p>
      </div>

      {/* GENERATION MODE */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>Generation Mode</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setPromptMode('custom')}
            style={{ ...styles.providerTab, ...(promptMode === 'custom' ? styles.providerTabActive : {}) }}
          >
            Client Prompt
          </button>
          <button
            onClick={() => setPromptMode('form')}
            style={{ ...styles.providerTab, ...(promptMode === 'form' ? styles.providerTabActive : {}) }}
          >
            Structured Form
          </button>
        </div>
        <div style={{ ...styles.help, marginTop: 8 }}>
          Client Prompt: paste the instructions and rules you received from the customer and generate contents directly from them, optionally layering in any of the structured sections. Structured Form: build each article brief entirely from the campaign fields.
        </div>
      </div>

      {/* CLIENT PROMPT */}
      {promptMode === 'custom' && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>Client Prompt</div>
          <label style={styles.label}>Client Instructions &amp; Rules</label>
          <textarea
            value={clientPrompt}
            onChange={(e) => setClientPrompt(e.target.value)}
            placeholder={`Paste the full brief from the customer here, e.g.:\n\nWrite articles about emergency plumbing services in Austin TX.\n- 800-1000 words each\n- Friendly, expert tone\n- Include one backlink to https://example.com/emergency-plumbing with the anchor "emergency plumber austin"\n- No AI-sounding phrases, no fluff intros\n...`}
            style={{ ...styles.input, minHeight: 220 }}
          />
          <div style={{ ...styles.help, ...(clientPrompt.trim().length > CLIENT_PROMPT_LIMIT ? { color: 'var(--red)' } : {}) }}>
            {clientPrompt.trim().length.toLocaleString()} / {CLIENT_PROMPT_LIMIT.toLocaleString()} characters. Everything the client specified (keywords, links, anchors, word count, tone, banned words, ...) is passed to the model verbatim and treated as the authoritative rules for every article.
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={styles.label}>Include Other Sections (optional)</label>
            <div style={styles.help}>Tick a section to open it further down the page and feed its settings into the generation prompt together with the client&apos;s instructions. Leave all unticked to generate from the prompt alone.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <label style={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={includeMoneySiteSection}
                  onChange={(e) => setIncludeMoneySiteSection(e.target.checked)}
                  style={styles.checkbox}
                />
                <span>
                  <strong>Money Site Info</strong>
                  <span style={styles.toggleHint}> - money site URL, niche, local service area and author credentials.</span>
                </span>
              </label>
              <label style={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={includeLinkPairsSection}
                  onChange={(e) => setIncludeLinkPairsSection(e.target.checked)}
                  style={styles.checkbox}
                />
                <span>
                  <strong>Anchor Text + Link Pairs</strong>
                  <span style={styles.toggleHint}> - distribute your keyword/link pairs (and the anchor mix, if enabled) across the batch; each article gets one money-site backlink.</span>
                </span>
              </label>
              <label style={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={includeSettingsSection}
                  onChange={(e) => setIncludeSettingsSection(e.target.checked)}
                  style={styles.checkbox}
                />
                <span>
                  <strong>Article Settings</strong>
                  <span style={styles.toggleHint}> - word count, tone, link placement, link counts, interlinks, tables/images and extra instructions.</span>
                </span>
              </label>
            </div>
          </div>
          <div style={{ marginTop: 12, maxWidth: 280 }}>
            <label style={styles.label}>Number of Contents</label>
            <input type="number" min={1} max={500} value={count} onChange={(e) => setCount(parseInt(e.target.value) || 1)} style={styles.input} />
            <div style={styles.help}>1 to 500 articles from this prompt. Each article gets a different angle and a uniqueness directive so the batch doesn&apos;t repeat itself.</div>
          </div>
          <button onClick={startCustomGeneration} disabled={isRunning} style={{ ...styles.btn, width: '100%', marginTop: 12, opacity: isRunning ? 0.5 : 1, cursor: isRunning ? 'not-allowed' : 'pointer' }}>
            {isRunning ? 'Generating...' : `Generate ${count} Content${count === 1 ? '' : 's'} from Client Prompt`}
          </button>
        </div>
      )}

      {/* PRESETS */}
      <div style={{ ...styles.card, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: 14 }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>Preset:</span>
        <select
          value={activePresetName}
          onChange={(e) => loadPreset(e.target.value)}
          style={{ ...styles.input, width: 'auto', minWidth: 180 }}
        >
          <option value="">- Choose a saved preset -</option>
          {Object.keys(presets).sort().map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <button onClick={savePreset} style={styles.btnSmall}>
          {activePresetName ? `Save (overwrite "${activePresetName}")` : 'Save as new preset'}
        </button>
        {activePresetName && (
          <button onClick={deletePreset} style={styles.btnSmallDanger}>
            Delete preset
          </button>
        )}
        <button onClick={clearForm} style={styles.btnSmallDanger}>
          Clear Form (New Campaign)
        </button>
        <span style={{ fontSize: '0.75rem', color: 'var(--muted)', flex: 1, textAlign: 'right' }}>
          Presets save your form settings (not generated articles). Useful when running campaigns for multiple money sites.
        </span>
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

      {/* Campaign-builder cards. In client-prompt mode each one appears
          only when its section is ticked in the Client Prompt card. */}
      {/* MONEY SITE */}
      {(promptMode === 'form' || includeMoneySiteSection) && (<>
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
      </>)}

      {/* LINK PAIRS */}
      {(promptMode === 'form' || includeLinkPairsSection) && (<>
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
                  <label style={styles.label}>Weight (%) - higher = used more often</label>
                  <input type="number" min={0.1} step={0.1} value={pair.weight} onChange={(e) => updateLinkPair(pair.id, 'weight', parseFloat(e.target.value) || 1)} onBlur={(e) => updateLinkPair(pair.id, 'weight', safeWeight(e.target.value))} style={styles.input} />
                </div>
              )}
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button onClick={addLinkPair} style={styles.btnAdd}>+ Add Another Pair</button>
          <button onClick={() => setCsvOpen((v) => !v)} style={styles.btnAdd}>
            {csvOpen ? '✕ Cancel Import' : '⬆ Import CSV'}
          </button>
        </div>

        {csvOpen && (
          <div style={{ marginTop: 12, padding: 14, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text)', fontWeight: 600, marginBottom: 6 }}>
              Paste CSV or TSV
            </div>
            <div style={{ ...styles.help, marginBottom: 8 }}>
              One row per pair. Format: <code>keyword,https://url</code> or <code>keyword,https://url,weight</code>. Tab-separated also works (paste straight from Google Sheets / Excel). Header row is auto-detected and skipped.
            </div>
            <textarea
              value={csvInput}
              onChange={(e) => setCsvInput(e.target.value)}
              placeholder={`hvac repair near me, https://example.com/hvac-repair\nfurnace replacement, https://example.com/furnace, 2`}
              style={{ ...styles.input, minHeight: 120, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.82rem' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--muted)' }}>
                <input
                  type="radio"
                  name="csv-mode"
                  value="append"
                  checked={csvMode === 'append'}
                  onChange={() => setCsvMode('append')}
                />
                Append to existing
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--muted)' }}>
                <input
                  type="radio"
                  name="csv-mode"
                  value="replace"
                  checked={csvMode === 'replace'}
                  onChange={() => setCsvMode('replace')}
                />
                Replace all existing
              </label>
              <div style={{ flex: 1 }} />
              <button onClick={importCsv} style={styles.btn}>Import</button>
            </div>
          </div>
        )}

        <div style={styles.distInfo}>{getDistributionPreview()}</div>
      </div>
      </>)}

      {/* ARTICLE SETTINGS */}
      {(promptMode === 'form' || includeSettingsSection) && (<>
      <div style={styles.card}>
        <div style={styles.cardTitle}>Article Settings</div>
        <div style={styles.formGrid}>
          {promptMode === 'form' && (
            <div>
              <label style={styles.label}>Number of Articles</label>
              <input type="number" min={1} max={500} value={count} onChange={(e) => setCount(parseInt(e.target.value) || 1)} style={styles.input} />
              <div style={styles.help}>1 to 500 articles</div>
            </div>
          )}
          <div>
            <label style={styles.label}>Word Count</label>
            <select value={wordCount} onChange={(e) => setWordCount(e.target.value)} style={styles.input}>
              <option value="400">400 words (quick answer)</option>
              <option value="600">600 words (quick answer)</option>
              <option value="800">800 words</option>
              <option value="1000">1000 words (listicle)</option>
              <option value="1500">1500 words (listicle)</option>
              <option value="1800">1800 words (how-to guide)</option>
              <option value="2000">2000 words (how-to guide)</option>
              <option value="2500">2500 words (how-to guide)</option>
              <option value="3000">3000 words (pillar page)</option>
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
            <label style={styles.toggleRow}>
              <input
                type="checkbox"
                checked={useAnchorMix}
                onChange={(e) => setUseAnchorMix(e.target.checked)}
                style={styles.checkbox}
              />
              <span>
                <strong>Use percentage-based anchor text mix</strong>
                <span style={styles.toggleHint}> - distribute anchors across exact / partial / branded / generic / etc. by the percentages below. Untick to use the plain target keyword as the anchor for every backlink (simple keyword + link pair mode).</span>
              </span>
            </label>
            {useAnchorMix && (
              <div style={{ marginTop: 12 }}>
                <AnchorMixEditor
                  mix={anchorMix}
                  count={count}
                  onChange={setAnchorMix}
                  previewParams={{ moneySite, niche, location, sampleKeyword: validPairs[0]?.keyword || niche || '', sampleLink: validPairs[0]?.link || moneySite || '' }}
                />
              </div>
            )}
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={styles.label}>Link Counts</label>
            <div style={styles.help}>The money-site backlink (your target keyword) is always included. Set any count to 0 to skip that type entirely.{validInterlinks.length > 0 ? ' Note: you have custom interlinks below, so the Service/Blog counts are ignored — those links are replaced by your interlink URLs.' : ''}</div>
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
                <div style={styles.help}>0-{MAX_LINK_COUNT}. Site rule: keep at 0 - no links to other websites; sources get named inline in plain text instead. Raise only if the client wants .gov/.edu/Wikipedia links.</div>
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
            <label style={styles.label}>Interlinking URLs (optional)</label>
            <div style={styles.help}>
              Real internal links to your client&apos;s pages — each with its own anchor text and destination URL. When you add one or more here, they replace the auto-generated Service/Blog internal links above, so articles only link to URLs you supply. Use the &quot;per article&quot; field below to rotate a subset across the batch so not every article uses the same links.
            </div>
            {interlinks.map((l, idx) => (
              <div key={l.id} style={styles.linkPair}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600 }}>
                    Interlink #{idx + 1}
                  </span>
                  <button onClick={() => removeInterlink(l.id)} style={styles.removeBtn}>
                    Remove
                  </button>
                </div>
                <div style={styles.formGrid}>
                  <div>
                    <label style={styles.label}>Anchor Text</label>
                    <input value={l.anchor} onChange={(e) => updateInterlink(l.id, 'anchor', e.target.value)} placeholder="emergency hvac service" style={styles.input} />
                  </div>
                  <div>
                    <label style={styles.label}>Anchor URL</label>
                    <input value={l.url} onChange={(e) => updateInterlink(l.id, 'url', e.target.value)} placeholder="https://example.com/emergency-repair" style={styles.input} />
                  </div>
                </div>
              </div>
            ))}
            <button onClick={addInterlink} style={styles.btnAdd}>+ Add Interlink</button>
            {interlinks.length > 0 && (
              <div style={{ marginTop: 12, maxWidth: 280 }}>
                <label style={styles.label}>Interlinks per article</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={interlinksPerArticle}
                  onChange={(e) => setInterlinksPerArticle(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  style={styles.input}
                />
                <div style={styles.help}>
                  How many of your interlinks each article uses, rotated evenly across the batch. 0 = include all of them in every article.
                  {validInterlinks.length > 0 && interlinksPerArticle > 0 && interlinksPerArticle < validInterlinks.length
                    ? ` Currently: ${interlinksPerArticle} of ${validInterlinks.length} per article.`
                    : validInterlinks.length > 0
                      ? ` Currently: all ${validInterlinks.length} per article.`
                      : ''}
                </div>
              </div>
            )}
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
                  <span style={styles.toggleHint}> - model adds one comparison/stats/pricing table where it fits.</span>
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
                  <span style={styles.toggleHint}> - adds 1-2 &lt;figure&gt; blocks using picsum.photos placeholders. Replace src with your own images later.</span>
                </span>
              </label>
            </div>
          </div>
        </div>
        {estimatedCost !== null && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.85rem', color: 'var(--muted)' }}>
            Estimated cost for {count} article{count === 1 ? '' : 's'} on <strong style={{ color: 'var(--text)' }}>{model}</strong>: <strong style={{ color: 'var(--text)' }}>~${estimatedCost.toFixed(estimatedCost < 1 ? 3 : 2)}</strong> at list prices. Real billing comes from the provider.
          </div>
        )}
        {promptMode === 'form' && (
          <button onClick={startGeneration} disabled={isRunning} style={{ ...styles.btn, width: '100%', marginTop: 12, opacity: isRunning ? 0.5 : 1, cursor: isRunning ? 'not-allowed' : 'pointer' }}>
            {isRunning ? 'Generating...' : 'Generate Articles'}
          </button>
        )}
      </div>
      </>)}

      {/* CUSTOM GENERATE (client-prompt mode) — sits below any included
          section cards so it's always the last step before Progress. */}
      {promptMode === 'custom' && (includeMoneySiteSection || includeLinkPairsSection || includeSettingsSection) && (
        <button onClick={startCustomGeneration} disabled={isRunning} style={{ ...styles.btn, width: '100%', marginBottom: 18, opacity: isRunning ? 0.5 : 1, cursor: isRunning ? 'not-allowed' : 'pointer' }}>
          {isRunning ? 'Generating...' : `Generate ${count} Content${count === 1 ? '' : 's'} from Client Prompt`}
        </button>
      )}

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
            {!isRunning && totalFailed > 0 && <button onClick={retryFailed} style={styles.btnSmall}>Retry Failed ({totalFailed})</button>}
            {!isRunning && interruptedCount > 0 && (
              <button onClick={resumeInterrupted} style={styles.btnSmall}>
                Resume Interrupted ({interruptedCount})
              </button>
            )}
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, keyword, or URL..."
              style={{ ...styles.input, flex: 1, minWidth: 200 }}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'done' | 'error' | 'pending')}
              style={{ ...styles.input, width: 'auto' }}
            >
              <option value="all">All statuses</option>
              <option value="done">Done only</option>
              <option value="error">Failed only</option>
              <option value="pending">Pending / generating</option>
            </select>
            {(searchQuery || statusFilter !== 'all') && (
              <button
                onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
                style={styles.btnSmall}
              >
                Reset filters
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
              {selected.size} selected ({filteredArticles.length} visible / {articles.length} total)
            </span>
            <div style={{ flex: 1 }} />
            <button onClick={selectVisible} style={styles.btnSmall} disabled={filteredArticles.length === 0 || visibleSelectedCount === filteredArticles.length}>
              Select Visible
            </button>
            <button onClick={selectFailed} style={styles.btnSmall} disabled={totalFailed === 0}>
              Select Failed ({totalFailed})
            </button>
            <button onClick={clearSelection} style={styles.btnSmall} disabled={selected.size === 0}>
              Deselect
            </button>
            <button
              onClick={regenerateSelected}
              style={{ ...styles.btnSmall, opacity: selected.size === 0 || isRunning ? 0.5 : 1, cursor: selected.size === 0 || isRunning ? 'not-allowed' : 'pointer' }}
              disabled={selected.size === 0 || isRunning}
            >
              Regenerate Selected ({selected.size})
            </button>
            <button
              onClick={deleteSelected}
              style={{ ...styles.btnDanger, opacity: selected.size === 0 ? 0.5 : 1, cursor: selected.size === 0 ? 'not-allowed' : 'pointer' }}
              disabled={selected.size === 0}
            >
              Delete Selected ({selected.size})
            </button>
          </div>
          <div style={{ ...styles.help, marginTop: -6, marginBottom: 12 }}>
            Regenerating (per row or selected) keeps each article&apos;s pre-assigned target keyword, anchor text, and interlink rotation, so the campaign&apos;s anchor-mix plan stays intact and untouched articles are never affected.
          </div>
          {filteredArticles.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem' }}>
              No articles match the current filter.
            </div>
          )}
          {filteredArticles.map((a) => (
            <div key={a.index} style={{ ...styles.articleCard, ...(selected.has(a.index) ? { borderColor: 'var(--primary)', boxShadow: '0 0 0 1px var(--primary)' } : {}) }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1, minWidth: 200 }}>
                  <input
                    type="checkbox"
                    checked={selected.has(a.index)}
                    onChange={() => toggleSelect(a.index)}
                    style={styles.checkbox}
                    aria-label={`Select article ${a.index + 1}`}
                  />
                  <span style={{ fontSize: '1rem', color: 'var(--primary)', fontWeight: 600 }}>
                    #{a.index + 1}: {a.title}
                  </span>
                </label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {a.pair && (
                    <span style={{ ...styles.badge, background: 'rgba(99,102,241,0.18)', color: 'var(--primary)' }}>
                      {a.pair.keyword}
                    </span>
                  )}
                  {a.anchorType && (
                    <span style={{ ...styles.badge, background: 'rgba(148,163,184,0.18)', color: 'var(--muted)' }}>
                      {ANCHOR_LABELS[a.anchorType]}: "{a.anchorText}"
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
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {a.status === 'done' && (
                  <>
                    <button onClick={() => toggleExpand(a.index)} style={styles.btnSmall}>
                      {expanded.has(a.index) ? 'Hide' : 'View'}
                    </button>
                    <button onClick={() => copyArticle(a.index)} style={styles.btnSmall}>Copy (Rich)</button>
                    <button onClick={() => copyHtmlSource(a.index)} style={styles.btnSmall}>Copy HTML</button>
                    <button onClick={() => downloadArticle(a.index)} style={styles.btnSmall}>Download</button>
                  </>
                )}
                {(a.status === 'done' || a.status === 'error') && (
                  <button
                    onClick={() => regenerateOne(a.index)}
                    disabled={isRunning}
                    style={{ ...styles.btnSmall, opacity: isRunning ? 0.5 : 1, cursor: isRunning ? 'not-allowed' : 'pointer' }}
                  >
                    {a.status === 'error' ? 'Retry' : 'Regenerate'}
                  </button>
                )}
                <button
                  onClick={() => deleteOne(a.index)}
                  disabled={a.status === 'generating'}
                  style={{ ...styles.btnSmallDanger, opacity: a.status === 'generating' ? 0.5 : 1, cursor: a.status === 'generating' ? 'not-allowed' : 'pointer' }}
                >
                  Delete
                </button>
              </div>
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
  btnSmallDanger: {
    background: 'transparent',
    color: 'var(--red)',
    border: '1px solid var(--red)',
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
