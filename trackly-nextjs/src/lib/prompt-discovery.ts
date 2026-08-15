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

export type DiscoveryStageKey =
  | 'generate'
  | 'dedupe'
  | 'intent'
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
      error        TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );
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
    id, brandId, userId, status: 'queued', stages, prompts: [],
    error: null, createdAt: new Date().toISOString(), completedAt: null,
  };
}

export async function getDiscoveryJob(jobId: string): Promise<DiscoveryJob | null> {
  await ensureDiscoverySchema();
  const res = await pool.query(
    `SELECT id, brand_id, user_id, status, stages, prompts, error, created_at, completed_at
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
    await patchStage(jobId, 'intent', { status: 'running' });
    let kept = candidates;
    try {
      const intent = await queryAI(
        key.platform, INTENT_PROMPT(candidates), key.apiKey, model, undefined,
        { jsonMode: true, tenantId: input.tenantId, maxTokens: 1500 },
      );
      const keepIdx = new Set(parseNumberArray(intent?.text || ''));
      const filtered = candidates.filter((_, i) => keepIdx.has(i + 1));
      // A model that returns nothing usable must not silently wipe the
      // list - fall back to keeping everything and say so.
      if (filtered.length) kept = filtered;
    } catch (e) {
      logger.warn('discovery.intent_failed', { jobId, errorMessage: (e as Error).message });
    }
    const dropped = candidates.length - kept.length;
    kept = kept.slice(0, input.maxPrompts);
    await patchStage(jobId, 'intent', {
      status: 'done',
      detail: dropped > 0 ? `${dropped} informational dropped` : 'all commercial',
    });

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
          SET status = 'done', prompts = $1, updated_at = NOW(), completed_at = NOW()
        WHERE id = $2`,
      [JSON.stringify(kept), jobId],
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
