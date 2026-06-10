/**
 * OpenAI Batch API integration for no-search ChatGPT calls.
 *
 * Routes daily-cron, non-latency-sensitive tracking ticks through
 * /v1/batches for the 50% pricing discount vs. /v1/chat/completions.
 *
 * Reversibility: every entry point is gated on the CHATGPT_BATCH_ENABLED
 * env flag. When unset / false, callers fall through to the existing
 * synchronous Chat Completions path with byte-identical behavior. No
 * redeploy is required to flip the path on or off.
 *
 * Failure handling: any batch upload / create / poll / per-item error
 * — including a max-wait timeout that exceeds CHATGPT_BATCH_MAX_WAIT_MS
 * — surfaces as a `ChatGPTBatchError`. The caller (ai-platforms.queryAI
 * ChatGPT branch) catches it and falls back to the synchronous nano
 * path so no tracking tick is silently dropped and mention recall is
 * preserved.
 *
 * Parsing: a successful batch row carries the exact /v1/chat/completions
 * response body on `response.body`. Callers receive it unchanged, so the
 * downstream brand-mention extraction logic in ai-platforms.queryAI runs
 * on batch results without modification.
 *
 * Out of scope: this module does NOT touch the synchronous web_search
 * path. Search-enabled calls remain on /v1/chat/completions so mention
 * recall for freshness-sensitive queries is identical to today.
 */

import { logger } from './logger';
import type { AiResponseData } from './ai-platforms';

const OPENAI_API_BASE = 'https://api.openai.com/v1';

/** Reads CHATGPT_BATCH_ENABLED. Default: false (sync path). */
export function isChatGPTBatchEnabled(): boolean {
  const raw = (process.env.CHATGPT_BATCH_ENABLED || '').toLowerCase().trim();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

/**
 * Maximum wall-clock time to wait for a batch to reach a terminal
 * state. Default: 6h. OpenAI's Batch API window is 24h, but waiting
 * the full window for a daily tracking tick is pointless — if the
 * batch hasn't completed within the configured window, we'd rather
 * fall back to the sync nano path than miss the day's data point.
 * Override via CHATGPT_BATCH_MAX_WAIT_MS.
 */
export function getChatGPTBatchMaxWaitMs(): number {
  const raw = Number(process.env.CHATGPT_BATCH_MAX_WAIT_MS);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return 6 * 60 * 60 * 1000;
}

/**
 * Interval between batch status polls. Default: 30s. OpenAI bills no
 * request charge on GET /v1/batches/{id}, but a tighter poll burns
 * client-side work for negligible gain on a 6h window. Override via
 * CHATGPT_BATCH_POLL_INTERVAL_MS.
 */
export function getChatGPTBatchPollIntervalMs(): number {
  const raw = Number(process.env.CHATGPT_BATCH_POLL_INTERVAL_MS);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return 30_000;
}

export type BatchStage =
  | 'upload'
  | 'create'
  | 'poll'
  | 'fetch'
  | 'timeout'
  | 'item';

export class ChatGPTBatchError extends Error {
  public readonly batchId?: string;
  public readonly stage: BatchStage;
  public readonly isTransient: boolean;
  constructor(
    message: string,
    opts: { batchId?: string; stage: BatchStage; isTransient?: boolean },
  ) {
    super(message);
    this.name = 'ChatGPTBatchError';
    this.batchId = opts.batchId;
    this.stage = opts.stage;
    this.isTransient = !!opts.isTransient;
  }
}

export interface BatchRequest {
  /** Caller-supplied correlation id. Echoed on the result row. */
  customId: string;
  /** Raw /v1/chat/completions request body. */
  body: Record<string, unknown>;
}

export interface BatchItemResult {
  customId: string;
  /** Chat Completions response body when the row succeeded. */
  response: AiResponseData | null;
  /** Per-item error envelope when the row failed. */
  error: { code?: string; message: string } | null;
}

interface BatchStatusPayload {
  id: string;
  status: string;
  output_file_id?: string | null;
  error_file_id?: string | null;
  errors?: { data?: Array<{ code?: string; message?: string }> };
}

interface BatchOutputRow {
  custom_id?: string;
  response?: { status_code?: number; body?: AiResponseData };
  error?: { code?: string; message?: string } | null;
}

async function openaiFetch(
  path: string,
  init: RequestInit,
  apiKey: string,
  signal?: AbortSignal,
): Promise<Response> {
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${apiKey}`);
  return fetch(`${OPENAI_API_BASE}${path}`, { ...init, headers, signal });
}

async function uploadBatchFile(
  items: BatchRequest[],
  apiKey: string,
  signal?: AbortSignal,
): Promise<string> {
  const jsonl = items
    .map(it =>
      JSON.stringify({
        custom_id: it.customId,
        method: 'POST',
        url: '/v1/chat/completions',
        body: it.body,
      }),
    )
    .join('\n');
  const blob = new Blob([jsonl], { type: 'application/jsonl' });
  const form = new FormData();
  form.append('purpose', 'batch');
  form.append('file', blob, 'batch.jsonl');
  const resp = await openaiFetch('/files', { method: 'POST', body: form }, apiKey, signal);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new ChatGPTBatchError(
      `upload failed: ${resp.status} ${text.slice(0, 200)}`,
      { stage: 'upload', isTransient: resp.status >= 500 || resp.status === 429 },
    );
  }
  const data = (await resp.json().catch(() => ({}))) as { id?: string };
  if (!data?.id) {
    throw new ChatGPTBatchError('upload returned no file id', { stage: 'upload' });
  }
  return data.id;
}

async function createBatch(
  fileId: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string> {
  const resp = await openaiFetch(
    '/batches',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input_file_id: fileId,
        endpoint: '/v1/chat/completions',
        completion_window: '24h',
      }),
    },
    apiKey,
    signal,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new ChatGPTBatchError(
      `create failed: ${resp.status} ${text.slice(0, 200)}`,
      { stage: 'create', isTransient: resp.status >= 500 || resp.status === 429 },
    );
  }
  const data = (await resp.json().catch(() => ({}))) as { id?: string };
  if (!data?.id) {
    throw new ChatGPTBatchError('create returned no batch id', { stage: 'create' });
  }
  return data.id;
}

async function getBatchStatus(
  batchId: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<BatchStatusPayload> {
  const resp = await openaiFetch(`/batches/${batchId}`, { method: 'GET' }, apiKey, signal);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new ChatGPTBatchError(
      `poll failed: ${resp.status} ${text.slice(0, 200)}`,
      { stage: 'poll', batchId, isTransient: resp.status >= 500 || resp.status === 429 },
    );
  }
  return (await resp.json()) as BatchStatusPayload;
}

async function fetchOutputFile(
  fileId: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string> {
  const resp = await openaiFetch(
    `/files/${fileId}/content`,
    { method: 'GET' },
    apiKey,
    signal,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new ChatGPTBatchError(
      `fetch output failed: ${resp.status} ${text.slice(0, 200)}`,
      { stage: 'fetch', isTransient: resp.status >= 500 },
    );
  }
  return await resp.text();
}

// Best-effort cancel for a batch we are abandoning while it may still be
// running. OpenAI bills batch requests that complete even if nobody ever
// fetches the output, and the caller falls back to the synchronous path
// after a ChatGPTBatchError — without the cancel, the same query would be
// billed twice (once in the orphaned batch, once sync). Uses its own
// timeout instead of the caller's signal, which is typically already
// aborted by the time we get here.
async function cancelBatch(batchId: string, apiKey: string, tag: string): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const resp = await openaiFetch(
      `/batches/${batchId}/cancel`,
      { method: 'POST' },
      apiKey,
      ctrl.signal,
    );
    logger.info(tag, { event: 'orphan_cancelled', batchId, status: resp.status });
  } catch (e) {
    logger.warn(tag, {
      event: 'orphan_cancel_failed',
      batchId,
      errorMessage: ((e as Error).message || '').slice(0, 200),
    });
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Parse the newline-delimited-JSON output of a completed batch into one
 * BatchItemResult per submitted request. Rows missing from the output
 * are reported with a `no row in batch output` error so the caller can
 * fall back to the sync path for that specific item.
 *
 * Exported for unit tests.
 */
export function parseBatchOutput(
  raw: string,
  items: BatchRequest[],
): BatchItemResult[] {
  const byCustomId = new Map<string, BatchItemResult>();
  for (const it of items) {
    byCustomId.set(it.customId, {
      customId: it.customId,
      response: null,
      error: { message: 'no row in batch output' },
    });
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let row: BatchOutputRow;
    try {
      row = JSON.parse(trimmed) as BatchOutputRow;
    } catch {
      continue;
    }
    const customId = row.custom_id;
    if (!customId || !byCustomId.has(customId)) continue;
    const rowError = row.error || row.response?.body?.error;
    if (rowError) {
      byCustomId.set(customId, {
        customId,
        response: null,
        error: {
          code: rowError.code,
          message: rowError.message || 'unknown batch item error',
        },
      });
      continue;
    }
    const body = row.response?.body;
    if (!body) {
      byCustomId.set(customId, {
        customId,
        response: null,
        error: { message: 'batch row missing response.body' },
      });
      continue;
    }
    byCustomId.set(customId, { customId, response: body, error: null });
  }
  return Array.from(byCustomId.values());
}

/**
 * Submit one or more Chat Completions requests through OpenAI's Batch
 * API. Uploads the JSONL, creates the batch with a 24h completion
 * window, then polls every CHATGPT_BATCH_POLL_INTERVAL_MS until the
 * batch reaches a terminal state OR the per-call max-wait window
 * (CHATGPT_BATCH_MAX_WAIT_MS) elapses. On the happy path returns one
 * BatchItemResult per request, keyed by customId, each carrying the
 * raw Chat Completions response body so downstream parsing is
 * unchanged.
 *
 * Throws a ChatGPTBatchError for any whole-batch failure (network,
 * upload, create, terminal failed/expired/cancelled, max-wait
 * timeout). The caller is expected to log and fall back to the sync
 * Chat Completions path so no tracking tick is silently dropped.
 */
export async function submitChatGPTBatch(
  items: BatchRequest[],
  apiKey: string,
  opts?: {
    signal?: AbortSignal;
    maxWaitMs?: number;
    pollIntervalMs?: number;
    logTag?: string;
  },
): Promise<BatchItemResult[]> {
  if (items.length === 0) return [];
  const maxWait = opts?.maxWaitMs ?? getChatGPTBatchMaxWaitMs();
  const pollInterval = opts?.pollIntervalMs ?? getChatGPTBatchPollIntervalMs();
  const signal = opts?.signal;
  const tag = opts?.logTag || '[chatgpt.batch]';
  const startedAt = Date.now();

  logger.info(tag, {
    event: 'submit',
    count: items.length,
    maxWaitMs: maxWait,
    pollIntervalMs: pollInterval,
  });

  const fileId = await uploadBatchFile(items, apiKey, signal);
  const batchId = await createBatch(fileId, apiKey, signal);
  logger.info(tag, { event: 'created', batchId, fileId });

  // Once `terminal` is true the batch has finished on OpenAI's side and
  // there is nothing left to cancel; until then, any error that exits
  // the poll loop (max-wait timeout, caller abort, poll/network failure)
  // abandons a batch that may still run to completion — and bill —
  // server-side, so the catch below fires a best-effort cancel first.
  let terminal = false;
  try {
    for (;;) {
      const elapsed = Date.now() - startedAt;
      if (elapsed >= maxWait) {
        throw new ChatGPTBatchError(
          `batch ${batchId} exceeded max-wait ${maxWait}ms (still in progress)`,
          { stage: 'timeout', batchId, isTransient: true },
        );
      }
      const status = await getBatchStatus(batchId, apiKey, signal);
      if (status.status === 'completed') {
        terminal = true;
        if (!status.output_file_id) {
          throw new ChatGPTBatchError(
            `batch ${batchId} completed without output_file_id`,
            { stage: 'poll', batchId },
          );
        }
        logger.info(tag, {
          event: 'completed',
          batchId,
          latencyMs: Date.now() - startedAt,
        });
        const raw = await fetchOutputFile(status.output_file_id, apiKey, signal);
        return parseBatchOutput(raw, items);
      }
      if (
        status.status === 'failed'
        || status.status === 'expired'
        || status.status === 'cancelled'
        || status.status === 'cancelling'
      ) {
        terminal = true;
        const firstError =
          status.errors?.data?.[0]?.message
          || `batch terminal status: ${status.status}`;
        throw new ChatGPTBatchError(
          `batch ${batchId} ${status.status}: ${firstError}`,
          { stage: 'poll', batchId, isTransient: status.status === 'expired' },
        );
      }
      // status: validating | in_progress | finalizing — keep polling.
      await sleep(Math.min(pollInterval, Math.max(0, maxWait - elapsed)), signal);
    }
  } catch (e) {
    if (!terminal) await cancelBatch(batchId, apiKey, tag);
    throw e;
  }
}
