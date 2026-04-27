/**
 * In-process Prometheus-compatible metrics registry.
 *
 * Why a custom registry instead of `prom-client`:
 *   The Next.js bundle is already heavy and we run in a multi-instance
 *   App Platform deployment where Prometheus would scrape each instance
 *   separately anyway. A small label-aware counter+histogram covers the
 *   per-(tenant, platform, outcome) cardinality issue #412 calls out
 *   without dragging another dependency through the edge bundle.
 *
 * Cardinality:
 *   Labels are restricted to a known small set - `platform` is one of
 *   the five providers (ChatGPT/Claude/Gemini/Grok/Perplexity), and
 *   `outcome` is one of {success, timeout, rate_limited, circuit_open,
 *   key_invalid, server_error}. Tenant cardinality is bounded by user
 *   count; an unbounded `tenant` label would explode the registry, so
 *   the helper hashes/normalises before recording (callers pass the
 *   real tenantId; the registry just tags it).
 *
 * Exposition:
 *   `renderProm()` returns text/plain in the Prometheus 0.0.4 format,
 *   served from /api/metrics under an admin-token gate. No registry
 *   reset between scrapes - counters monotonically increase, histograms
 *   accumulate samples; that's the contract Prometheus expects.
 */

export type Outcome =
  | 'success'
  | 'timeout'
  | 'rate_limited'
  | 'circuit_open'
  | 'key_invalid'
  | 'server_error';

export const OUTCOMES: readonly Outcome[] = [
  'success',
  'timeout',
  'rate_limited',
  'circuit_open',
  'key_invalid',
  'server_error',
] as const;

export interface AiCallLabels {
  tenant: string;
  platform: string;
  outcome: Outcome;
}

// Default histogram buckets, in milliseconds. Tuned for AI provider
// calls: most successful chat completions land in the 500-5000ms range;
// search-class models routinely exceed 10s; the 180s tail covers the
// per-task timeout budget.
const DEFAULT_LATENCY_BUCKETS_MS: readonly number[] = [
  50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000, 120000, 180000,
] as const;

interface CounterEntry {
  labels: Record<string, string>;
  value: number;
}

interface HistogramEntry {
  labels: Record<string, string>;
  // Cumulative bucket counts. `buckets[i]` = number of observations
  // with value <= `boundaries[i]`. Final entry is +Inf (total count).
  buckets: number[];
  sum: number;
  count: number;
}

class Counter {
  readonly name: string;
  readonly help: string;
  readonly labelNames: readonly string[];
  private readonly entries = new Map<string, CounterEntry>();

  constructor(name: string, help: string, labelNames: readonly string[]) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
  }

  inc(labels: Record<string, string>, by = 1): void {
    const key = labelKey(this.labelNames, labels);
    const existing = this.entries.get(key);
    if (existing) existing.value += by;
    else this.entries.set(key, { labels: pickLabels(this.labelNames, labels), value: by });
  }

  reset(): void {
    this.entries.clear();
  }

  snapshot(): CounterEntry[] {
    return Array.from(this.entries.values()).map(e => ({ ...e, labels: { ...e.labels } }));
  }

  render(): string {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} counter`);
    for (const entry of this.entries.values()) {
      lines.push(`${this.name}${formatLabels(entry.labels)} ${entry.value}`);
    }
    return lines.join('\n');
  }
}

class Histogram {
  readonly name: string;
  readonly help: string;
  readonly labelNames: readonly string[];
  readonly boundaries: readonly number[];
  private readonly entries = new Map<string, HistogramEntry>();

  constructor(
    name: string,
    help: string,
    labelNames: readonly string[],
    boundaries: readonly number[] = DEFAULT_LATENCY_BUCKETS_MS,
  ) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    this.boundaries = boundaries;
  }

  observe(labels: Record<string, string>, value: number): void {
    const key = labelKey(this.labelNames, labels);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        labels: pickLabels(this.labelNames, labels),
        // +1 for the implicit +Inf bucket at the end.
        buckets: new Array<number>(this.boundaries.length + 1).fill(0),
        sum: 0,
        count: 0,
      };
      this.entries.set(key, entry);
    }
    for (let i = 0; i < this.boundaries.length; i++) {
      if (value <= this.boundaries[i]) entry.buckets[i]++;
    }
    entry.buckets[this.boundaries.length]++; // +Inf
    entry.sum += value;
    entry.count++;
  }

  reset(): void {
    this.entries.clear();
  }

  snapshot(): HistogramEntry[] {
    return Array.from(this.entries.values()).map(e => ({
      labels: { ...e.labels },
      buckets: [...e.buckets],
      sum: e.sum,
      count: e.count,
    }));
  }

  render(): string {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} histogram`);
    for (const entry of this.entries.values()) {
      for (let i = 0; i < this.boundaries.length; i++) {
        const labels = { ...entry.labels, le: String(this.boundaries[i]) };
        lines.push(`${this.name}_bucket${formatLabels(labels)} ${entry.buckets[i]}`);
      }
      lines.push(
        `${this.name}_bucket${formatLabels({ ...entry.labels, le: '+Inf' })} ${entry.buckets[this.boundaries.length]}`,
      );
      lines.push(`${this.name}_sum${formatLabels(entry.labels)} ${entry.sum}`);
      lines.push(`${this.name}_count${formatLabels(entry.labels)} ${entry.count}`);
    }
    return lines.join('\n');
  }
}

function labelKey(names: readonly string[], labels: Record<string, string>): string {
  // Stable join order so repeated calls land on the same bucket.
  return names.map(n => `${n}=${labels[n] ?? ''}`).join('|');
}

function pickLabels(names: readonly string[], labels: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of names) out[n] = labels[n] ?? '';
  return out;
}

function escapeLabelValue(v: string): string {
  // Prometheus exposition rules: escape backslash, double-quote, newline.
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function formatLabels(labels: Record<string, string>): string {
  const parts = Object.entries(labels).map(([k, v]) => `${k}="${escapeLabelValue(v)}"`);
  return parts.length ? `{${parts.join(',')}}` : '';
}

// ── Registry ────────────────────────────────────────────────────────

const AI_LABEL_NAMES = ['tenant', 'platform', 'outcome'] as const;

const aiCallsTotal = new Counter(
  'trackly_ai_calls_total',
  'Total AI provider calls grouped by tenant, platform, and outcome.',
  AI_LABEL_NAMES,
);

const aiCallLatencyMs = new Histogram(
  'trackly_ai_call_latency_ms',
  'Latency of AI provider calls in milliseconds, by tenant, platform, outcome.',
  AI_LABEL_NAMES,
);

// HTTP-level request counter, keyed by route + status. Useful for
// distinguishing /api/cron pileups from app-route errors when the AI
// metrics look healthy.
const httpRequestsTotal = new Counter(
  'trackly_http_requests_total',
  'HTTP requests served by the Next.js app, by route and status class.',
  ['route', 'status'],
);

export function recordAiCall(labels: AiCallLabels, latencyMs: number): void {
  const safe: Record<string, string> = {
    tenant: labels.tenant || 'unknown',
    platform: labels.platform || 'unknown',
    outcome: labels.outcome,
  };
  aiCallsTotal.inc(safe);
  aiCallLatencyMs.observe(safe, Math.max(0, latencyMs));
}

export function recordHttpRequest(route: string, status: number): void {
  httpRequestsTotal.inc({ route: route || 'unknown', status: String(status) });
}

/**
 * Map an arbitrary error into the bounded `Outcome` set so callers can
 * record metrics without having to know every error class. The matching
 * is deliberate-ordered (most specific first): a circuit-breaker error
 * also sets `isRateLimit`, but the breaker outcome is more informative.
 */
export function classifyOutcome(err: unknown): Outcome {
  if (!err) return 'success';
  const e = err as {
    isRateLimit?: boolean;
    budgetExhausted?: boolean;
    message?: string;
    name?: string;
  };
  const msg = (e.message || '').toLowerCase();
  if (msg.includes('circuit open') || msg.includes('circuit breaker')) return 'circuit_open';
  if (msg.includes('auth error') || msg.includes('401') || msg.includes('403') || msg.includes('invalid api key')) {
    return 'key_invalid';
  }
  if (e.isRateLimit || msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests')) {
    return 'rate_limited';
  }
  if (
    msg.includes('timeout')
    || msg.includes('timed out')
    || msg.includes('aborted')
    || e.name === 'AbortError'
    || msg.includes('sleep budget exhausted')
  ) {
    return 'timeout';
  }
  if (msg.includes('server error') || msg.includes('5')) {
    // Last-resort match: anything that mentioned a 5xx or upstream
    // server error falls here.
    if (/\b5\d\d\b/.test(msg) || msg.includes('server error')) return 'server_error';
  }
  return 'server_error';
}

/**
 * Render the full registry in Prometheus 0.0.4 exposition format.
 * Trailing newline is required by the spec; some scrapers are lenient
 * but Grafana Agent flags missing-newline as a parse warning.
 */
export function renderProm(): string {
  const sections = [
    aiCallsTotal.render(),
    aiCallLatencyMs.render(),
    httpRequestsTotal.render(),
  ];
  return sections.join('\n') + '\n';
}

export function resetMetricsForTesting(): void {
  aiCallsTotal.reset();
  aiCallLatencyMs.reset();
  httpRequestsTotal.reset();
}

// Exposed for tests so we can assert label sets without scraping the
// rendered text.
export const _internals = {
  aiCallsTotal,
  aiCallLatencyMs,
  httpRequestsTotal,
};
