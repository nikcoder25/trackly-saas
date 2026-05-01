'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useBrands } from '@/contexts/BrandContext';
import AuditCreditConfirmModal, {
  AUDIT_PER_UNIT_COST,
  AUDIT_PLATFORMS_COUNT,
} from '@/components/dashboard/geo-audits/AuditCreditConfirmModal';
import DrillDownHeader from '@/components/dashboard/geo-audits/DrillDownHeader';
import DrillDownKpiCards from '@/components/dashboard/geo-audits/DrillDownKpiCards';
import DrillDownFilters, {
  type ModelFilter,
  type StateFilter,
} from '@/components/dashboard/geo-audits/DrillDownFilters';
import PromptResultCard, {
  type PromptResultRow,
} from '@/components/dashboard/geo-audits/PromptResultCard';
import type { BrandInput } from '@/lib/parser';

interface AuditDetail {
  id: string;
  brandId: string;
  regions: string[];
  prompts: string[];
  promptsCount: number;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  mentionsCount: number;
  totalExpected: number;
  received: number;
  error: string | null;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

const POLL_INTERVAL_MS = 5_000;
const SNIPPET_LEN_FOR_CSV = 240;

export default function AuditDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const auditId = params?.id;
  const { brands } = useBrands();

  const [audit, setAudit] = useState<AuditDetail | null>(null);
  const [results, setResults] = useState<PromptResultRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [model, setModel] = useState<ModelFilter>('all');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');

  // Re-run flow
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);

  const inFlight = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchDetail() {
    if (!auditId || inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/geo-audits/${encodeURIComponent(auditId)}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        if (audit === null) setError(`Failed to load (HTTP ${res.status})`);
        return;
      }
      const data = await res.json();
      setAudit((data?.audit as AuditDetail) ?? null);
      setResults(Array.isArray(data?.results) ? (data.results as PromptResultRow[]) : []);
      setError(null);
    } catch (e) {
      if (audit === null) setError((e as Error).message || 'Network error');
    } finally {
      inFlight.current = false;
    }
  }

  useEffect(() => {
    fetchDetail();
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditId]);

  // Poll while queued/running so the user sees results land in real time.
  useEffect(() => {
    const active = audit?.status === 'queued' || audit?.status === 'running';
    if (active && !pollRef.current) {
      pollRef.current = setInterval(fetchDetail, POLL_INTERVAL_MS);
    } else if (!active && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit?.status]);

  // Brand input for mention highlighting. Pulled from BrandContext —
  // the audit's brandId always belongs to the current user since the
  // detail endpoint returns 404 otherwise. NO mock data: when the
  // brand isn't in the loaded list (e.g., it was just deleted), we
  // pass null to the result card and skip highlighting rather than
  // fabricating one.
  const brandInput: BrandInput | null = useMemo(() => {
    if (!audit) return null;
    const b = (brands ?? []).find((x) => (x as { id?: string }).id === audit.brandId) as
      | (Record<string, unknown> & { id?: string; name?: string })
      | undefined;
    if (!b) return null;
    const data = (b.data as Record<string, unknown> | undefined) ?? b;
    return {
      name: String(data.name ?? b.name ?? ''),
      website: typeof data.website === 'string' ? data.website : undefined,
      aliases: Array.isArray(data.aliases) ? (data.aliases as string[]) : undefined,
      city: typeof data.city === 'string' ? data.city : undefined,
      nearbyAreas: Array.isArray(data.nearbyAreas) ? (data.nearbyAreas as string[]) : undefined,
      competitors: Array.isArray(data.competitors) ? (data.competitors as string[]) : undefined,
    };
  }, [audit, brands]);

  // Apply model + state filters across the full per-call result set.
  const filteredResults = useMemo(() => {
    if (!results) return [];
    return results.filter((r) => {
      if (model !== 'all' && r.platform !== model) return false;
      if (stateFilter === 'mentioned' && !r.mentioned) return false;
      if (stateFilter === 'not_mentioned' && r.mentioned) return false;
      return true;
    });
  }, [results, model, stateFilter]);

  // Group filtered rows by prompt. Order = order they appear in the
  // audit's `prompts` array (stable across reloads).
  const promptOrder = audit?.prompts ?? [];
  const grouped: { promptText: string; rows: PromptResultRow[] }[] = useMemo(() => {
    if (!audit) return [];
    const byPrompt = new Map<string, PromptResultRow[]>();
    for (const row of filteredResults) {
      const arr = byPrompt.get(row.promptText) ?? [];
      arr.push(row);
      byPrompt.set(row.promptText, arr);
    }
    // Preserve audit.prompts ordering, then surface anything else
    // (defensive — prompt text from results should always match).
    const ordered: { promptText: string; rows: PromptResultRow[] }[] = [];
    const seen = new Set<string>();
    for (const p of promptOrder) {
      if (byPrompt.has(p)) {
        ordered.push({ promptText: p, rows: byPrompt.get(p)! });
        seen.add(p);
      }
    }
    for (const [p, rows] of byPrompt) {
      if (!seen.has(p)) ordered.push({ promptText: p, rows });
    }
    return ordered;
  }, [filteredResults, audit, promptOrder]);

  const totalPrompts = audit?.promptsCount ?? promptOrder.length;
  const visiblePrompts = grouped.length;
  const hiddenPrompts = Math.max(0, totalPrompts - visiblePrompts);

  // Mention rate = mentionsCount / received (calls actually made).
  // Null when received === 0 so the KPI shows "—" instead of "0.0%".
  const mentionRate = audit && audit.received > 0
    ? audit.mentionsCount / audit.received
    : null;

  // Format header date (e.g., "Nov 14"). Use createdAt as the
  // canonical "when this audit was started".
  const dateLabel = audit?.createdAt
    ? new Date(audit.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';
  const regionLabel = audit?.regions.join(' · ') ?? '';

  function exportCsv() {
    if (!audit || !results) return;
    const rows = [
      ['prompt', 'model', 'mentioned', 'snippet', 'timestamp'],
      ...results.map((r) => [
        r.promptText,
        r.platform,
        r.mentioned ? 'true' : 'false',
        r.error ? `[error: ${r.error}]` : (r.response ?? '').replace(/\s+/g, ' ').trim().slice(0, SNIPPET_LEN_FOR_CSV),
        // Use createdAt from the detail row; the route returns it as ISO.
        ((r as PromptResultRow & { createdAt?: string | null }).createdAt) ?? '',
      ]),
    ];
    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `regional-audit-${auditId}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleConfirmedRerun() {
    if (!audit || submitting) return;
    setConfirmOpen(false);
    setSubmitting(true);
    setRerunError(null);
    try {
      const res = await fetch('/api/geo-audits', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: audit.brandId,
          regions: audit.regions,
          prompts: audit.prompts,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          (typeof data?.error === 'string' && data.error) ||
          (typeof data?.message === 'string' && data.message) ||
          `Failed (HTTP ${res.status})`;
        setRerunError(msg);
        setSubmitting(false);
        return;
      }
      const newId = typeof data?.id === 'string' ? data.id : null;
      if (newId) {
        // Land on the freshly-queued audit so the user can watch it
        // run. Same UX pattern as kicking off a new audit from Screen 01.
        router.push(`/dashboard/geo-audits/${encodeURIComponent(newId)}`);
      } else {
        // Fallback if the response shape ever changes — at least
        // refresh the list.
        router.push('/dashboard/geo-audits');
      }
    } catch (e) {
      setRerunError((e as Error).message || 'Network error');
      setSubmitting(false);
    }
  }

  if (!auditId) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>Missing audit id</div>
      </div>
    );
  }

  if (audit === null && !error) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--muted)', fontSize: 13 }}>
        Loading audit…
      </div>
    );
  }
  if (error) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginBottom: 4 }}>Couldn&apos;t load audit</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>{error}</div>
        <button onClick={fetchDetail} className="pbtn" style={{ minHeight: 36 }}>Retry</button>
      </div>
    );
  }
  if (!audit) return null;

  const isTerminal = audit.status === 'done' || audit.status === 'failed' || audit.status === 'cancelled';
  const rerunDisabled = submitting;

  return (
    <div>
      <DrillDownHeader
        regionLabel={regionLabel}
        dateLabel={dateLabel}
        status={audit.status.toUpperCase()}
        onExportCsv={exportCsv}
        onRerun={() => setConfirmOpen(true)}
        rerunDisabled={rerunDisabled}
        rerunDisabledReason={submitting ? 'Re-run in progress' : undefined}
      />

      {!isTerminal && (
        <div
          className="card"
          style={{
            padding: '10px 14px', marginBottom: 12,
            background: 'rgba(99,102,241,.06)',
            borderColor: 'rgba(99,102,241,.25)',
            fontSize: 12, color: 'var(--text)',
          }}
        >
          <strong>Audit {audit.status}.</strong>{' '}
          <span style={{ color: 'var(--muted)' }}>
            Results land here as the worker completes each call ({audit.received} of {audit.totalExpected} so far).
          </span>
        </div>
      )}

      <DrillDownKpiCards
        promptsCount={audit.promptsCount}
        modelsCount={AUDIT_PLATFORMS_COUNT}
        mentionsCount={audit.mentionsCount}
        mentionRate={mentionRate}
      />

      <DrillDownFilters
        model={model}
        onModelChange={setModel}
        stateFilter={stateFilter}
        onStateChange={setStateFilter}
      />

      {results === null || results.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          {audit.status === 'queued' ? 'Audit queued — results will appear here as the worker starts.'
           : audit.status === 'running' ? 'Audit running — first results will land momentarily.'
           : 'No results recorded.'}
        </div>
      ) : grouped.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          No prompts match your current filters.
        </div>
      ) : (
        <>
          {grouped.map((g) => (
            <PromptResultCard
              key={g.promptText}
              promptText={g.promptText}
              rows={g.rows}
              brand={brandInput}
            />
          ))}

          {hiddenPrompts > 0 && (
            <div
              style={{
                fontSize: 12, color: 'var(--muted)', textAlign: 'center',
                padding: '12px 0',
              }}
            >
              + {hiddenPrompts} more {hiddenPrompts === 1 ? 'prompt' : 'prompts'} hidden by current filters
            </div>
          )}
        </>
      )}

      {rerunError && (
        <div
          className="card"
          style={{
            padding: '10px 14px', marginTop: 12,
            background: 'rgba(239,68,68,.06)',
            borderColor: 'rgba(239,68,68,.25)',
            fontSize: 12, color: 'var(--red)',
          }}
        >
          Re-run failed: {rerunError}
        </div>
      )}

      {confirmOpen && (
        <AuditCreditConfirmModal
          regionsCount={audit.regions.length}
          promptsCount={audit.prompts.length}
          perUnitCost={AUDIT_PER_UNIT_COST}
          platformsCount={AUDIT_PLATFORMS_COUNT}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={handleConfirmedRerun}
        />
      )}
    </div>
  );
}

function csvEscape(value: unknown): string {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
