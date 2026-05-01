'use client';

import { useMemo } from 'react';
import { buildBrandMatcher } from '@/lib/parser';
import type { BrandInput } from '@/lib/parser';

/**
 * One card per prompt on the audit drill-down. Body lists each model
 * (5 fixed) with a status dot, model name, and the response snippet
 * (italic, with brand mention emphasized) — or "No mention" when the
 * call returned nothing matching.
 *
 * Visual language (per spec):
 *   green dot = mentioned
 *   gray dot  = not mentioned
 *   amber dot = partial — shown when the call errored
 */

export interface PromptResultRow {
  /** stable id from geo_audit_results */
  id: string;
  region: string;
  promptText: string;
  platform: string;
  model: string | null;
  response: string | null;
  mentioned: boolean;
  error: string | null;
}

interface Props {
  promptText: string;
  /** Exactly the rows for this prompt, one per model. The component
   *  doesn't filter — the parent applies model/state filters before
   *  passing them in. */
  rows: PromptResultRow[];
  /** Brand info for emphasis matching. Optional — when missing we
   *  render the snippet without highlighting (no fake matches). */
  brand: BrandInput | null;
}

const SNIPPET_LEN = 240;

const MODEL_ORDER = ['ChatGPT', 'Perplexity', 'Gemini', 'Claude', 'Grok'];

export default function PromptResultCard({ promptText, rows, brand }: Props) {
  const matcher = useMemo(() => (brand ? buildBrandMatcher(brand) : null), [brand]);

  // Stable model order — even if the parent passes them in different
  // sequences, the card always shows ChatGPT first → Grok last.
  const ordered = useMemo(() => {
    const byPlatform = new Map(rows.map((r) => [r.platform, r]));
    return MODEL_ORDER
      .map((p) => byPlatform.get(p))
      .filter((r): r is PromptResultRow => Boolean(r));
  }, [rows]);

  const mentionedCount = ordered.filter((r) => r.mentioned).length;

  return (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      {/* Card header: prompt text + mention count badge */}
      <div
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          gap: 12, marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 14, fontWeight: 600, color: 'var(--text)',
            lineHeight: 1.45, flex: 1, minWidth: 0,
          }}
        >
          {promptText}
        </div>
        <span
          style={{
            fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums',
            fontSize: 11, fontWeight: 700,
            padding: '3px 10px', borderRadius: 100,
            background: mentionedCount > 0 ? 'rgba(16,185,129,.08)' : 'rgba(148,163,184,.10)',
            color: mentionedCount > 0 ? 'var(--green)' : 'var(--muted)',
            whiteSpace: 'nowrap',
          }}
        >
          {mentionedCount} / 5 mentioned
        </span>
      </div>

      {/* Per-model rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ordered.map((r) => (
          <ModelRow key={r.id} row={r} matcher={matcher} />
        ))}
      </div>
    </div>
  );
}

function ModelRow({
  row, matcher,
}: {
  row: PromptResultRow;
  matcher: ReturnType<typeof buildBrandMatcher> | null;
}) {
  const dotColor = row.error
    ? 'var(--amber)'                     // partial / error
    : row.mentioned
      ? 'var(--green)'
      : 'var(--muted)';

  // Snippet: truncated response text. Brand emphasis comes from the
  // existing BrandMatcher's `exactRe` so the highlight matches the
  // same definition the worker uses to set `mentioned`.
  const snippet = useMemo(() => {
    if (row.error) return null;
    if (!row.mentioned && (!row.response || row.response.trim().length === 0)) return null;
    if (!row.response) return null;
    return truncate(row.response, SNIPPET_LEN);
  }, [row.error, row.mentioned, row.response]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '12px 90px 1fr',
        alignItems: 'baseline',
        gap: 10, fontSize: 13, lineHeight: 1.55,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8, height: 8, borderRadius: '50%',
          background: dotColor, marginTop: 6,
        }}
      />
      <span style={{ fontWeight: 600, color: 'var(--text)' }}>{row.platform}</span>
      <span style={{ color: 'var(--muted)', minWidth: 0 }}>
        {row.error ? (
          <span style={{ color: 'var(--amber)' }}>Provider error: {row.error}</span>
        ) : !row.mentioned ? (
          <span>No mention</span>
        ) : snippet == null ? (
          <span>Mentioned</span>
        ) : (
          <em style={{ fontStyle: 'italic', color: 'var(--text)' }}>
            “{matcher ? renderWithMatch(snippet, matcher.exactRe) : snippet}”
          </em>
        )}
      </span>
    </div>
  );
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  // Don't cut mid-word.
  const slice = t.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > max - 40 ? slice.slice(0, lastSpace) : slice) + '…';
}

function renderWithMatch(text: string, re: RegExp): React.ReactNode {
  // Safety: clone the regex with the global flag so we can iterate
  // matches without mutating the caller's lastIndex.
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const r = new RegExp(re.source, flags);
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = r.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <strong key={`m-${i++}`} style={{ color: 'var(--text)', fontStyle: 'normal', fontWeight: 700 }}>
        {m[0]}
      </strong>,
    );
    last = m.index + m[0].length;
    // Defensive against zero-width matches.
    if (m[0].length === 0) r.lastIndex++;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
