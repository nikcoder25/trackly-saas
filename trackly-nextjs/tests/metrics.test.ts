import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordAiCall,
  recordHttpRequest,
  classifyOutcome,
  renderProm,
  resetMetricsForTesting,
  _internals,
  OUTCOMES,
} from '../src/lib/metrics';

beforeEach(() => {
  resetMetricsForTesting();
});

describe('metrics — counter', () => {
  it('increments per (tenant, platform, outcome) bucket', () => {
    recordAiCall({ tenant: 't_1', platform: 'ChatGPT', outcome: 'success' }, 100);
    recordAiCall({ tenant: 't_1', platform: 'ChatGPT', outcome: 'success' }, 200);
    recordAiCall({ tenant: 't_2', platform: 'ChatGPT', outcome: 'success' }, 300);
    recordAiCall({ tenant: 't_1', platform: 'ChatGPT', outcome: 'rate_limited' }, 50);

    const snap = _internals.aiCallsTotal.snapshot();
    const map = new Map(snap.map(e => [`${e.labels.tenant}|${e.labels.platform}|${e.labels.outcome}`, e.value]));
    expect(map.get('t_1|ChatGPT|success')).toBe(2);
    expect(map.get('t_2|ChatGPT|success')).toBe(1);
    expect(map.get('t_1|ChatGPT|rate_limited')).toBe(1);
  });

  it('substitutes "unknown" for empty tenant on the metric, but keeps platform/outcome', () => {
    recordAiCall({ tenant: '', platform: 'Gemini', outcome: 'timeout' }, 60000);
    const snap = _internals.aiCallsTotal.snapshot();
    expect(snap[0].labels.tenant).toBe('unknown');
    expect(snap[0].labels.platform).toBe('Gemini');
    expect(snap[0].labels.outcome).toBe('timeout');
    expect(snap[0].value).toBe(1);
  });
});

describe('metrics — histogram', () => {
  it('places observations in cumulative buckets and increments _count/_sum', () => {
    // boundaries include 100, 250, 500, 1000, ...
    recordAiCall({ tenant: 't', platform: 'Claude', outcome: 'success' }, 80);   // <=100
    recordAiCall({ tenant: 't', platform: 'Claude', outcome: 'success' }, 400);  // <=500
    recordAiCall({ tenant: 't', platform: 'Claude', outcome: 'success' }, 5000); // <=5000

    const [entry] = _internals.aiCallLatencyMs.snapshot();
    expect(entry.count).toBe(3);
    expect(entry.sum).toBe(80 + 400 + 5000);
    // 50ms bucket: 0 of 3 (smallest sample is 80)
    expect(entry.buckets[0]).toBe(0);
    // 100ms bucket: 1 of 3 (the 80ms sample)
    expect(entry.buckets[1]).toBe(1);
    // 500ms bucket: 2 of 3 (80 + 400)
    expect(entry.buckets[3]).toBe(2);
    // +Inf bucket (last) holds all samples
    expect(entry.buckets[entry.buckets.length - 1]).toBe(3);
  });

  it('separates histogram series by label values', () => {
    recordAiCall({ tenant: 'a', platform: 'Grok', outcome: 'success' }, 100);
    recordAiCall({ tenant: 'b', platform: 'Grok', outcome: 'success' }, 100);
    expect(_internals.aiCallLatencyMs.snapshot()).toHaveLength(2);
  });
});

describe('metrics — classifyOutcome', () => {
  it.each([
    [{ message: 'rate limit hit' }, 'rate_limited'],
    [{ isRateLimit: true, message: 'ratelimited' }, 'rate_limited'],
    [{ message: 'request timeout after 60000ms' }, 'timeout'],
    [{ name: 'AbortError', message: 'aborted' }, 'timeout'],
    [{ message: 'Auth error 401' }, 'key_invalid'],
    [{ message: 'platform rate-limit circuit open (cooling 120s)', isRateLimit: true }, 'circuit_open'],
    [{ message: 'Server error 503' }, 'server_error'],
    [{ message: 'something weird happened' }, 'server_error'],
  ])('classifies %j as %s', (err, expected) => {
    expect(classifyOutcome(err)).toBe(expected);
  });

  it('returns success for a falsy error', () => {
    expect(classifyOutcome(null)).toBe('success');
    expect(classifyOutcome(undefined)).toBe('success');
  });

  it('exposes the full set of supported outcomes', () => {
    expect([...OUTCOMES]).toEqual([
      'success',
      'timeout',
      'rate_limited',
      'circuit_open',
      'key_invalid',
      'server_error',
    ]);
  });
});

describe('metrics — Prometheus exposition', () => {
  it('renders counter and histogram with correct labels and types', () => {
    recordAiCall({ tenant: 't_1', platform: 'ChatGPT', outcome: 'success' }, 250);
    recordAiCall({ tenant: 't_1', platform: 'ChatGPT', outcome: 'rate_limited' }, 5000);
    recordHttpRequest('/api/brands/[id]/run', 200);

    const out = renderProm();

    // HELP and TYPE lines must be present.
    expect(out).toContain('# HELP trackly_ai_calls_total');
    expect(out).toContain('# TYPE trackly_ai_calls_total counter');
    expect(out).toContain('# HELP trackly_ai_call_latency_ms');
    expect(out).toContain('# TYPE trackly_ai_call_latency_ms histogram');
    expect(out).toContain('# TYPE trackly_http_requests_total counter');

    // Counter value lines.
    expect(out).toMatch(/trackly_ai_calls_total\{[^}]*tenant="t_1"[^}]*\} 1/);
    expect(out).toMatch(/trackly_ai_calls_total\{[^}]*outcome="rate_limited"[^}]*\} 1/);

    // Histogram has _bucket, _sum, _count and a +Inf bucket. The two
    // recordAiCall calls land in distinct (outcome) series so each
    // series has count=1; sums are 250 and 5000 respectively.
    expect(out).toMatch(/trackly_ai_call_latency_ms_bucket\{[^}]*le="500"[^}]*\}/);
    expect(out).toMatch(/trackly_ai_call_latency_ms_bucket\{[^}]*le="\+Inf"[^}]*\}/);
    expect(out).toMatch(/trackly_ai_call_latency_ms_count\{[^}]*outcome="success"[^}]*\} 1/);
    expect(out).toMatch(/trackly_ai_call_latency_ms_count\{[^}]*outcome="rate_limited"[^}]*\} 1/);
    expect(out).toMatch(/trackly_ai_call_latency_ms_sum\{[^}]*outcome="success"[^}]*\} 250/);
    expect(out).toMatch(/trackly_ai_call_latency_ms_sum\{[^}]*outcome="rate_limited"[^}]*\} 5000/);

    // HTTP counter renders.
    expect(out).toMatch(/trackly_http_requests_total\{[^}]*route="\/api\/brands\/\[id\]\/run"[^}]*status="200"[^}]*\} 1/);

    // Output must end with a newline (Prometheus parser requirement).
    expect(out.endsWith('\n')).toBe(true);
  });

  it('escapes backslashes and quotes in label values', () => {
    recordHttpRequest('/api/foo"bar\\baz', 500);
    const out = renderProm();
    expect(out).toContain('route="/api/foo\\"bar\\\\baz"');
  });
});
