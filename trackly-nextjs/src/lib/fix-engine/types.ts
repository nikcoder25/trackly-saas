/**
 * Fix Engine - shared contract.
 *
 * Every fix module (title rewrite, llms.txt, FAQ schema, ...) implements
 * the same `FixModule` interface so the engine can run them all the same
 * way: detect → generate → preview → ship → recheck. Adding a new module
 * is one file implementing this interface plus one line in registry.ts.
 *
 * The shape mirrors the repo's existing detect→store→surface modules
 * (geo-audits, nap-audits, recommendations) with two stages bolted on:
 * `generate` (LLM produces the new content) and `ship` (the content is
 * written to the customer's live site).
 */

import type { Pool } from 'pg';

/** Channel A = REST API (CMS), Channel B = Connector plugin (head/files). */
export type FixChannel = 'A' | 'B';

/** What surfaces the work that a module acts on. */
export type FixTrigger = 'crawl' | 'gsc' | 'manual';

/**
 * Lifecycle of a single fix row. The engine is the only writer; modules
 * never mutate status directly.
 *
 *   detected      detect() found an issue, no content yet
 *   generating    generate() is running
 *   generated     a draft exists, awaiting human approval
 *   preview_ready alias used by the UI once a preview block is attached
 *   approved      a human approved the draft; eligible to ship
 *   shipping      ship() is running
 *   staged        handed to the Connector as a DRAFT revision (not live);
 *                 a preview URL is available and the user can Publish it
 *   shipped       written to the live site (Channel A) or handed to the
 *                 Connector (Channel B)
 *   verified      recheck() confirmed the change is live + scored
 *   failed        a terminal error in any stage (see `error`)
 *   reverted      a shipped fix was rolled back
 */
export type FixStatus =
  | 'detected'
  | 'generating'
  | 'generated'
  | 'preview_ready'
  | 'approved'
  | 'shipping'
  | 'staged'
  | 'shipped'
  | 'verified'
  | 'failed'
  | 'reverted'
  // User marked the AI's suggestion as wrong/unwanted. Hidden from the
  // default lists; restorable from the "Dismissed" filter.
  | 'dismissed';

export type FixSeverity = 'critical' | 'high' | 'medium' | 'low';

/** Minimal brand view the engine threads into modules. */
export interface FixBrand {
  id: string;
  userId: string;
  name?: string;
  website?: string;
  industry?: string | null;
  city?: string | null;
  country?: string | null;
  description?: string;
  queries?: string[];
  competitors?: string[];
  [key: string]: unknown;
}

/**
 * An issue a module detected on a specific target (usually a URL). One
 * issue becomes one `fixes` row. `key` must be stable for a given
 * (module, target) so re-scans dedupe instead of duplicating.
 */
export interface DetectedIssue {
  /** Stable dedupe key within a module, e.g. the target URL or url#field. */
  key: string;
  targetUrl: string | null;
  severity: FixSeverity;
  /** Human summary shown in the list, e.g. "Title is 71 chars (too long)". */
  summary: string;
  /** Machine-readable evidence the generate step consumes. */
  detected: Record<string, unknown>;
  /** Snapshot of the current live value, for before/after diffing. */
  before?: Record<string, unknown>;
}

/** Output of generate(): the new content plus how to render it. */
export interface GeneratedDraft {
  /** The payload ship() will write. Shape is module-specific. */
  generated: Record<string, unknown>;
  /** Credits the generation actually consumed (for refund reconciliation). */
  creditsUsed?: number;
}

/** A before/after block the dashboard renders without module knowledge. */
export interface PreviewBlock {
  kind: 'text-diff' | 'code-block' | 'key-values';
  label: string;
  before?: string;
  after?: string;
  /**
   * For additive fixes (schema, FAQ, citations…) there's no current value to
   * show as "before" — this one-line note explains what's being added, so the
   * card still reads as a before/after ("nothing today → this").
   */
  addNote?: string;
  /** For code-block previews (schema JSON-LD, llms.txt, ...). */
  language?: string;
}

/** Result of ship(). */
export interface ShipResult {
  ok: boolean;
  /** Channel A: the CMS write result; Channel B: the queued instruction id. */
  detail: Record<string, unknown>;
  /** What the engine stores as after_snapshot for recheck to compare. */
  after?: Record<string, unknown>;
  error?: string;
}

/**
 * A normalised, CMS-agnostic description of a page-content change, used by
 * the staged-preview path: instead of writing the change live, the engine
 * hands this patch to the Connector, which applies it as a DRAFT revision
 * the user previews before publishing. A module that can express its change
 * as a ContentPatch implements `contentPatch()`; modules that can't (e.g.
 * site-root file writes) simply omit it and can only ship live.
 */
export interface ContentPatch {
  /** Page to stage. Required — staging targets an existing published page. */
  url: string;
  /** New SEO/post title. */
  title?: string;
  /** New meta description. */
  metaDescription?: string;
  /** New canonical URL. */
  canonical?: string;
  /** Make the page indexable (clear noindex). */
  indexable?: boolean;
  /** Replace the entire post body. */
  bodyHtml?: string;
  /** Append to the post body (schema blocks, FAQ, TL;DR). */
  bodyAppend?: string;
  /** Exact in-place replacement within the body (first occurrence). */
  bodyReplace?: { find: string; replace: string };
}

/** Result of recheck(). */
export interface RecheckVerdict {
  verified: boolean;
  /** 0-100 quality/health score of the target after the fix, if computable. */
  scoreAfter?: number | null;
  note?: string;
}

/**
 * Everything a module needs at runtime. The engine constructs this once
 * per scan/operation and passes it to every stage so modules stay pure
 * (no direct pool/key plumbing of their own beyond what's here).
 */
export interface FixContext {
  pool: Pool;
  brand: FixBrand;
  /** Brand owner's user id - the tenant key for credits + AI cost caps. */
  tenantId: string;
  /** Legacy per-user provider keys (decrypted), passed to resolveKeysForTenant. */
  userKeysLegacy: Record<string, string | null | undefined>;
  /** Abort signal for long crawls/LLM calls. */
  signal?: AbortSignal;
  /**
   * How the current operation should write. 'live' (default) writes
   * straight to the production page; 'draft' routes the change through the
   * Connector as a previewable draft revision (see ContentPatch / stageFix).
   */
  shipMode?: 'live' | 'draft';
}

/** The contract every module implements. */
export interface FixModule {
  /** Stable id, e.g. 'title-rewrite'. Used as fixes.module_key. */
  key: string;
  /** Human label for the dashboard. */
  title: string;
  /** One-line description of what the module fixes. */
  description: string;
  channel: FixChannel;
  trigger: FixTrigger;
  /** Minimum effective plan required to run this module. */
  minPlan: string;
  /** Phase 1/2/3 - informational, used for grouping in the UI. */
  phase: 1 | 2 | 3;
  /**
   * Find issues this module can fix. Pure read - may crawl the site or
   * read GSC, but must not write. Returns [] when nothing needs fixing.
   */
  detect(ctx: FixContext): Promise<DetectedIssue[]>;
  /**
   * Produce the new content for one detected issue. Typically one or
   * more queryAI calls. May reserve/refund credits via the engine's
   * helpers (passed creditsUsed back so the engine reconciles).
   */
  generate(issue: DetectedIssue, ctx: FixContext): Promise<GeneratedDraft>;
  /** Render a before/after preview from a generated draft. Pure. */
  preview(issue: DetectedIssue, draft: GeneratedDraft): PreviewBlock;
  /**
   * Write the generated content to the live site. Channel A modules use
   * a CmsAdapter; Channel B modules queue a Connector instruction.
   */
  ship(
    issue: DetectedIssue,
    draft: GeneratedDraft,
    ctx: FixContext,
  ): Promise<ShipResult>;
  /** Confirm the fix is live and score the result. */
  recheck(
    issue: DetectedIssue,
    draft: GeneratedDraft,
    ctx: FixContext,
  ): Promise<RecheckVerdict>;
  /**
   * Optional: undo a shipped fix by restoring the pre-fix value (from the
   * issue's `before` snapshot). Modules that can't cleanly reverse a
   * change simply omit this; the engine then reports "manual revert".
   */
  revert?(
    issue: DetectedIssue,
    draft: GeneratedDraft,
    ctx: FixContext,
  ): Promise<ShipResult>;
  /**
   * Optional: express this fix's change as a normalised ContentPatch so it
   * can be staged as a Connector draft revision (ship-as-draft / preview).
   * Return null when the change can't be staged (e.g. the target passage
   * isn't in the stored body). Modules that omit this can only ship live.
   */
  contentPatch?(issue: DetectedIssue, draft: GeneratedDraft): ContentPatch | null;
}

/** A persisted fix row, as read back from the DB. */
export interface FixRow {
  id: string;
  userId: string;
  brandId: string;
  moduleKey: string;
  channel: FixChannel;
  targetUrl: string | null;
  status: FixStatus;
  severity: FixSeverity;
  dedupeKey: string;
  summary: string;
  detected: Record<string, unknown>;
  generated: Record<string, unknown> | null;
  beforeSnapshot: Record<string, unknown> | null;
  afterSnapshot: Record<string, unknown> | null;
  shipResult: Record<string, unknown> | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  /** AI-visibility (SOV) snapshots captured at ship / recheck. */
  aiBefore: Record<string, unknown> | null;
  aiAfter: Record<string, unknown> | null;
  note: string | null;
  assignee: string | null;
  /** 'live' (write straight to production) or 'draft' (staged via Connector). */
  shipMode: 'live' | 'draft';
  /** Connector-supplied preview URL for a staged (draft) change, if any. */
  previewUrl: string | null;
  /** Target page's 28-day GSC metrics captured at ship / ~28 days later. */
  gscBefore: Record<string, unknown> | null;
  gscAfter: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FixBatchRow {
  id: string;
  userId: string;
  brandId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  modules: string[];
  totalExpected: number;
  received: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}
