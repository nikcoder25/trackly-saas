/**
 * Prompt discovery: find the prompts a brand should track, as a staged
 * background job.
 *
 * Two things make this a job rather than a request.
 *
 * First, it takes long enough that a user should not have to sit on a
 * spinner - the stages together are several LLM round trips plus a sitemap
 * fetch. State lives in the database and progress is polled, so closing the
 * tab does not cancel anything and reopening it rejoins the same job.
 *
 * Second, the stages are worth showing. "Setting up your report" with a
 * bar tells the user nothing; "Grouping into topics" tells them what they
 * are getting. Every stage below is work that actually happens - the stage
 * list is generated from the pipeline, not decoration written to look busy.
 */

import { pool } from './db';
import { uid } from './helpers';
import { logger } from './logger';
import { queryAI, getDefaultModel } from './ai-platforms';
import { resolveGeneratorKey } from './generator-key';
import { classifyPrompts, selectImportantPages, type CandidatePage } from './prompt-map';
import { upsertPromptMeta } from './prompt-meta';
import {
  deLocalize,
  getAiSearchVolume,
  getSearchIntent,
  isBuyingIntent,
  isDataForSeoConfigured,
  type KeywordIntent,
} from './dataforseo';

export type DiscoveryStageKey =
  | 'generate'
  | 'dedupe'
  | 'intent'
  | 'demand'
  | 'pages'
  | 'topics';

export type DiscoveryStatus = 'queued' | 'running' | 'done' | 'failed';

export interface DiscoveryStage {
  key: DiscoveryStageKey;
  label: string;
  status: 'pending' | 'running' | 'done' | 'skipped';
  /** Short result line, e.g. "38 candidates" - shown next to the tick. */
  detail?: string;
}

/**
 * The pipeline, in order. Labels are user-facing and describe the work
 * literally; if a stage is ever removed the label goes with it rather than
 * being left behind as theatre.
 */
export const STAGE_DEFS: Array<{ key: DiscoveryStageKey; label: string }> = [
  { key: 'generate', label: 'Generating candidate prompts' },
  { key: 'dedupe', label: 'Deduplicating and cleaning up results' },
  { key: 'intent', label: 'Determining search intent' },
  { key: 'demand', label: 'Checking how often these are asked' },
  { key: 'pages', label: 'Finding your most important pages' },
  { key: 'topics', label: 'Grouping into topics' },
];

export interface DiscoveryJob {
  id: string;
  brandId: string;
  userId: string;
  status: DiscoveryStatus;
  stages: DiscoveryStage[];
  /** Prompts the job settled on, available once status is 'done'. */
  prompts: string[];
  /** Demand data per prompt, keyed by the prompt text. May be empty. */
  demand: Record<string, PromptDemand>;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

let schemaEnsured = false;
export async function ensureDiscoverySchema(): Promise<void> {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prompt_discovery_jobs (
      id           TEXT PRIMARY KEY,
      brand_id     TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'queued',
      stages       JSONB NOT NULL DEFAULT '[]'::jsonb,
      prompts      JSONB NOT NULL DEFAULT '[]'::jsonb,
      demand       JSONB NOT NULL DEFAULT '{}'::jsonb,
      error        TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );
    -- Additive, for environments that created the table before demand
    -- data existed. Jobs written then simply have no demand to show.
    ALTER TABLE prompt_discovery_jobs
      ADD COLUMN IF NOT EXISTS demand JSONB NOT NULL DEFAULT '{}'::jsonb;
    CREATE INDEX IF NOT EXISTS prompt_discovery_brand_idx
      ON prompt_discovery_jobs (brand_id, created_at DESC);
  `);
  schemaEnsured = true;
}

/** Test seam: forget that the schema was ensured. */
export function __resetDiscoverySchemaCache(): void {
  schemaEnsured = false;
}

function initialStages(): DiscoveryStage[] {
  return STAGE_DEFS.map(d => ({ key: d.key, label: d.label, status: 'pending' as const }));
}

export async function createDiscoveryJob(brandId: string, userId: string): Promise<DiscoveryJob> {
  await ensureDiscoverySchema();
  const id = uid();
  const stages = initialStages();
  await pool.query(
    `INSERT INTO prompt_discovery_jobs (id, brand_id, user_id, status, stages)
     VALUES ($1,$2,$3,'queued',$4)`,
    [id, brandId, userId, JSON.stringify(stages)],
  );
  return {
    id, brandId, userId, status: 'queued', stages, prompts: [], demand: {},
    error: null, createdAt: new Date().toISOString(), completedAt: null,
  };
}

export async function getDiscoveryJob(jobId: string): Promise<DiscoveryJob | null> {
  await ensureDiscoverySchema();
  const res = await pool.query(
    `SELECT id, brand_id, user_id, status, stages, prompts, demand, error, created_at, completed_at
       FROM prompt_discovery_jobs WHERE id = $1`,
    [jobId],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    brandId: row.brand_id,
    userId: row.user_id,
    status: row.status,
    stages: Array.isArray(row.stages) ? row.stages : [],
    prompts: Array.isArray(row.prompts) ? row.prompts : [],
    demand: (row.demand && typeof row.demand === 'object' && !Array.isArray(row.demand))
      ? row.demand as Record<string, PromptDemand>
      : {},
    error: row.error,
    createdAt: new Date(row.created_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  };
}

/** Most recent job for a brand, so a reopened tab can rejoin it. */
export async function getLatestDiscoveryJob(brandId: string): Promise<DiscoveryJob | null> {
  await ensureDiscoverySchema();
  const res = await pool.query(
    `SELECT id FROM prompt_discovery_jobs
      WHERE brand_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [brandId],
  );
  return res.rows[0] ? getDiscoveryJob(res.rows[0].id) : null;
}

async function patchStage(
  jobId: string,
  key: DiscoveryStageKey,
  patch: Partial<DiscoveryStage>,
): Promise<void> {
  const job = await getDiscoveryJob(jobId);
  if (!job) return;
  const stages = job.stages.map(s => (s.key === key ? { ...s, ...patch } : s));
  await pool.query(
    `UPDATE prompt_discovery_jobs SET stages = $1, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(stages), jobId],
  );
}

export interface DiscoveryInput {
  jobId: string;
  brandId: string;
  tenantId: string;
  brandName: string;
  industry?: string;
  city?: string;
  website?: string;
  /** Prompts already tracked, so the generator doesn't repeat them. */
  existing: string[];
  /** Hard cap from the caller's plan. */
  maxPrompts: number;
}

/** Strip numbering/quotes a model sometimes wraps list items in. */
function cleanPrompt(raw: string): string {
  return raw
    .trim()
    .replace(/^\s*\d+[.)]\s*/, '')
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deduplicate prompts that differ only in casing, punctuation, or filler.
 * Returns the surviving prompts in their original order.
 */
export function dedupePrompts(prompts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of prompts) {
    const clean = cleanPrompt(raw);
    if (clean.length < 3 || clean.length > 300) continue;
    const key = clean
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\b(the|a|an|for|of|in|to|my|me|near)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

/**
 * Never hand back fewer than this many prompts because a classifier
 * misfired. The user waited on a job; an empty result is worse than a
 * slightly noisy one they can prune.
 */
export const MIN_KEPT_PROMPTS = 5;

export interface PromptDemand {
  /** Monthly AI search volume for the prompt itself, if the dataset has it. */
  volume: number | null;
  trend: 'rising' | 'falling' | 'flat' | null;
  /**
   * True when `volume` came from the de-localized head term rather than
   * the prompt itself - "best hvac company" standing in for "best hvac
   * company in auburn wa". Surfaced so the UI can say "category volume"
   * instead of overstating what is known about the local phrasing.
   */
  proxy: boolean;
  /** The head term used, when proxy is true. */
  proxyFor?: string;
}

/**
 * Look up AI search volume for a set of prompts, falling back to the
 * de-localized head term for prompts the dataset has never seen.
 *
 * Two batched requests at most: one for the prompts as written, one for
 * the head terms of whatever came back empty.
 */
export async function measureDemand(
  prompts: string[],
  city?: string,
): Promise<Map<string, PromptDemand>> {
  const out = new Map<string, PromptDemand>();
  if (!prompts.length) return out;

  const direct = await getAiSearchVolume(prompts);
  const needsProxy: Array<{ prompt: string; head: string }> = [];

  for (const prompt of prompts) {
    const hit = direct.get(prompt.toLowerCase());
    if (hit && hit.volume !== null) {
      out.set(prompt, { volume: hit.volume, trend: hit.trend, proxy: false });
      continue;
    }
    const head = deLocalize(prompt, city);
    if (head) needsProxy.push({ prompt, head });
    else out.set(prompt, { volume: null, trend: null, proxy: false });
  }

  if (needsProxy.length) {
    const heads = await getAiSearchVolume(needsProxy.map(p => p.head));
    for (const { prompt, head } of needsProxy) {
      const hit = heads.get(head.toLowerCase());
      out.set(prompt, {
        volume: hit?.volume ?? null,
        trend: hit?.trend ?? null,
        proxy: hit?.volume != null,
        proxyFor: hit?.volume != null ? head : undefined,
      });
    }
  }

  return out;
}

/**
 * Order prompts by demand, strongest first.
 *
 * Direct volume outranks proxy volume at the same number, because a
 * figure measured on the exact phrasing is worth more than one borrowed
 * from its head term. Prompts with no data at all keep their original
 * relative order at the end rather than being shuffled arbitrarily - and
 * they are kept, not dropped.
 */
export function rankByDemand(prompts: string[], demand: Map<string, PromptDemand>): string[] {
  return prompts
    .map((prompt, index) => ({ prompt, index, d: demand.get(prompt) }))
    .sort((a, b) => {
      const av = a.d?.volume ?? -1;
      const bv = b.d?.volume ?? -1;
      if (av !== bv) return bv - av;
      const aProxy = a.d?.proxy ? 1 : 0;
      const bProxy = b.d?.proxy ? 1 : 0;
      if (aProxy !== bProxy) return aProxy - bProxy;
      return a.index - b.index;
    })
    .map(x => x.prompt);
}

const GENERATE_PROMPT = (input: DiscoveryInput) => {
  const where = input.city ? ` in or near ${input.city}` : '';
  const already = input.existing.length
    ? `\n\nAlready tracked (do NOT repeat):\n${input.existing.slice(0, 100).join('\n')}`
    : '';
  return `Generate ${Math.min(40, input.maxPrompts * 2)} search prompts a real person would type into an AI assistant (ChatGPT, Gemini, Perplexity) when they are looking for "${input.industry || 'these'}" services${where}.

Cover the whole buying journey, not just one slice:
- urgent/emergency need
- price, quotes, and financing
- comparison and "best/top rated" shopping
- specific services within the category
- trust signals: reviews, licensing, warranty, how to choose

Write them the way people actually talk to an assistant - full questions, not keyword strings. Do NOT include the brand name.

Return ONLY a JSON array of strings.${already}`;
};

const INTENT_PROMPT = (prompts: string[]) =>
  `For each prompt below, decide whether someone asking it is close to hiring a local service business (commercial intent) or just reading (informational).

Keep the commercial ones. Drop pure research questions that would never lead to a booking.

PROMPTS:
${prompts.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Return ONLY a JSON array of the 1-based numbers to KEEP, e.g. [1,3,4,7]`;

function parseStringArray(text: string): string[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === 'string')
      : [];
  } catch {
    return [];
  }
}

function parseNumberArray(text: string): number[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed)
      ? parsed.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
      : [];
  } catch {
    return [];
  }
}

/**
 * Run the discovery pipeline to completion, updating job state as it goes.
 *
 * Never throws: any failure is recorded on the job as `failed` with a
 * message, because the caller is an after() callback with nobody to catch
 * it and a job stuck on 'running' forever is the worst outcome for the UI.
 */
export async function runDiscovery(input: DiscoveryInput): Promise<void> {
  const { jobId } = input;
  try {
    await pool.query(
      `UPDATE prompt_discovery_jobs SET status = 'running', updated_at = NOW() WHERE id = $1`,
      [jobId],
    );

    const key = await resolveGeneratorKey(input.tenantId);
    if (!key) throw new Error('No AI API keys available. Add keys in Account Settings.');
    const model = getDefaultModel(key.platform);

    // ── Stage 1: generate ────────────────────────────────
    await patchStage(jobId, 'generate', { status: 'running' });
    const generated = await queryAI(
      key.platform, GENERATE_PROMPT(input), key.apiKey, model, undefined,
      { jsonMode: true, tenantId: input.tenantId, maxTokens: 3000 },
    );
    let candidates = parseStringArray(generated?.text || '');
    if (!candidates.length) throw new Error('The model returned no usable prompts. Try again.');
    await patchStage(jobId, 'generate', {
      status: 'done',
      detail: `${candidates.length} candidates`,
    });

    // ── Stage 2: dedupe ──────────────────────────────────
    await patchStage(jobId, 'dedupe', { status: 'running' });
    const beforeDedupe = candidates.length;
    // Existing prompts are folded in so the dedupe also catches near-
    // duplicates of what the brand already tracks, then removed again.
    const existingKeys = new Set(dedupePrompts(input.existing).map(p => p.toLowerCase()));
    candidates = dedupePrompts(candidates).filter(p => !existingKeys.has(p.toLowerCase()));
    await patchStage(jobId, 'dedupe', {
      status: 'done',
      detail: `${beforeDedupe - candidates.length} removed`,
    });

    // ── Stage 3: intent ──────────────────────────────────
    // DataForSEO's classifier is preferred over asking a model to
    // introspect: it is trained on SERP data, it is consistent between
    // runs, and it covers localized prompts ("best hvac company in
    // auburn wa" -> commercial, p=0.95) which is precisely the traffic
    // this product exists to measure.
    await patchStage(jobId, 'intent', { status: 'running' });
    let kept = candidates;
    let intentSource: 'dataforseo' | 'llm' | 'none' = 'none';
    let intentMap = new Map<string, KeywordIntent>();

    if (isDataForSeoConfigured()) {
      intentMap = await getSearchIntent(candidates);
      if (intentMap.size > 0) {
        intentSource = 'dataforseo';
        kept = candidates.filter(p => isBuyingIntent(intentMap.get(p.toLowerCase())));
      }
    }

    if (intentSource === 'none') {
      try {
        const intent = await queryAI(
          key.platform, INTENT_PROMPT(candidates), key.apiKey, model, undefined,
          { jsonMode: true, tenantId: input.tenantId, maxTokens: 1500 },
        );
        const keepIdx = new Set(parseNumberArray(intent?.text || ''));
        const filtered = candidates.filter((_, i) => keepIdx.has(i + 1));
        if (filtered.length) { kept = filtered; intentSource = 'llm'; }
      } catch (e) {
        logger.warn('discovery.intent_failed', { jobId, errorMessage: (e as Error).message });
      }
    }

    // Floor: a classifier having a bad day must not hand the user an
    // empty prompt set. Better to keep some unfiltered candidates and let
    // them prune than to return nothing from a run they waited on.
    if (kept.length < MIN_KEPT_PROMPTS) {
      kept = candidates.slice(0, Math.max(MIN_KEPT_PROMPTS, kept.length));
      intentSource = intentSource === 'none' ? 'none' : intentSource;
    }

    const dropped = candidates.length - kept.length;
    await patchStage(jobId, 'intent', {
      status: 'done',
      detail: intentSource === 'none'
        ? 'not classified'
        : `${dropped} informational dropped`
          + (intentSource === 'dataforseo' ? ' · DataForSEO' : ' · model'),
    });

    // ── Stage 4: demand ──────────────────────────────────
    // Rank by how often each prompt is actually asked of an AI assistant.
    //
    // Volume NEVER drops a prompt. Localized and "near me" prompts return
    // no data at all from this dataset, and for a local service business
    // those are the most valuable prompts there are - filtering on volume
    // would delete the good ones and keep the national head terms the
    // customer cannot rank for. It is a sort key and a label, nothing more.
    await patchStage(jobId, 'demand', { status: 'running' });
    let demand = new Map<string, PromptDemand>();
    if (isDataForSeoConfigured()) {
      demand = await measureDemand(kept, input.city);
      const withVolume = [...demand.values()].filter(d => d.volume !== null).length;
      kept = rankByDemand(kept, demand);
      await patchStage(jobId, 'demand', {
        status: 'done',
        detail: withVolume > 0
          ? `${withVolume} of ${kept.length} have volume data`
          : 'no volume data (all local)',
      });
    } else {
      // Shown as skipped rather than ticked - the stage genuinely did not
      // run, and a tick for nothing is how progress UI starts lying.
      await patchStage(jobId, 'demand', { status: 'skipped', detail: 'DataForSEO not configured' });
    }

    kept = kept.slice(0, input.maxPrompts);

    // ── Stage 4: pages ───────────────────────────────────
    await patchStage(jobId, 'pages', { status: 'running' });
    let pages: CandidatePage[] = [];
    if (input.website) {
      pages = await selectImportantPages(input.website);
      await patchStage(jobId, 'pages', {
        status: 'done',
        detail: pages.length ? `${pages.length} pages` : 'no sitemap found',
      });
    } else {
      // Honest about not running rather than showing a tick for nothing.
      await patchStage(jobId, 'pages', { status: 'skipped', detail: 'no website set' });
    }

    // ── Stage 5: topics ──────────────────────────────────
    await patchStage(jobId, 'topics', { status: 'running' });
    const outcome = await classifyPrompts({
      tenantId: input.tenantId,
      brandName: input.brandName,
      industry: input.industry,
      city: input.city,
      queries: kept,
      pages,
    });
    if (outcome.rows.length) await upsertPromptMeta(input.brandId, outcome.rows);
    const topicCount = new Set(
      outcome.rows.map(r => r.topic).filter((t): t is string => !!t),
    ).size;
    await patchStage(jobId, 'topics', {
      status: 'done',
      detail: topicCount ? `${topicCount} topics` : 'ungrouped',
    });

    await pool.query(
      `UPDATE prompt_discovery_jobs
          SET status = 'done', prompts = $1, demand = $2,
              updated_at = NOW(), completed_at = NOW()
        WHERE id = $3`,
      [
        JSON.stringify(kept),
        // Only the surviving prompts - carrying demand for candidates that
        // were filtered out would leave the UI joining against ghosts.
        JSON.stringify(Object.fromEntries(kept.map(p => [p, demand.get(p)]).filter(([, d]) => d))),
        jobId,
      ],
    );
    logger.info('discovery.completed', {
      jobId, brandId: input.brandId, prompts: kept.length, topics: topicCount,
    });
  } catch (e) {
    const message = (e as Error).message || 'Prompt discovery failed';
    logger.error('discovery.failed', { jobId, errorMessage: message });
    await pool.query(
      `UPDATE prompt_discovery_jobs
          SET status = 'failed', error = $1, updated_at = NOW(), completed_at = NOW()
        WHERE id = $2`,
      [message.slice(0, 500), jobId],
    ).catch(() => {});
  }
}
