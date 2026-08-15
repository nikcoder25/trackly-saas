'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, Badge, Pill } from '@/app/dashboard-v2/ui';

interface DiscoveryStage {
  key: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'skipped';
  detail?: string;
}

export interface DiscoveryJob {
  id: string;
  brandId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  stages: DiscoveryStage[];
  prompts: string[];
  error: string | null;
}

const POLL_MS = 1500;
/**
 * Stop polling after this long. A job that has not moved in ten minutes is
 * not going to; leaving an interval running forever in a background tab is
 * worse than showing the user a stalled state they can retry from.
 */
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

function StageIcon({ status }: { status: DiscoveryStage['status'] }) {
  if (status === 'done') return <span style={{ color: 'var(--success)' }}>✓</span>;
  if (status === 'skipped') return <span className="dim">–</span>;
  if (status === 'running') {
    return (
      <span
        className="spinner"
        style={{
          display: 'inline-block', width: 12, height: 12,
          border: '1.5px solid var(--primary)', borderTopColor: 'transparent',
          borderRadius: '50%', animation: 'lvx-spin 1s linear infinite',
        }}
      />
    );
  }
  return <span className="dim">○</span>;
}

export function PromptDiscovery({
  brandId,
  onAccept,
  disabled,
  disabledReason,
}: {
  brandId: string;
  /** Called with the discovered prompts when the user accepts them. */
  onAccept: (prompts: string[]) => void | Promise<void>;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [job, setJob] = useState<DiscoveryJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const startedAt = useRef<number>(0);

  const fetchStatus = useCallback(async (jobId?: string) => {
    const qs = jobId ? `?job=${encodeURIComponent(jobId)}` : '';
    const res = await fetch(`/api/brands/${brandId}/discover-prompts${qs}`, {
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.job as DiscoveryJob | null) ?? null;
  }, [brandId]);

  // Rejoin an in-flight job on mount. This is what makes closing the tab
  // safe: the work is server-side, so coming back just re-attaches to it.
  useEffect(() => {
    let cancelled = false;
    fetchStatus().then(j => {
      if (cancelled || !j) return;
      if (j.status === 'queued' || j.status === 'running') {
        startedAt.current = Date.now();
        setJob(j);
      }
    });
    return () => { cancelled = true; };
  }, [fetchStatus]);

  // Poll while the job is live.
  useEffect(() => {
    if (!job || (job.status !== 'queued' && job.status !== 'running')) return;
    const timer = setInterval(async () => {
      if (Date.now() - startedAt.current > POLL_TIMEOUT_MS) {
        clearInterval(timer);
        setError('Discovery is taking longer than expected. Reload to check on it.');
        return;
      }
      const next = await fetchStatus(job.id);
      if (next) setJob(next);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [job, fetchStatus]);

  const start = async () => {
    if (starting || disabled) return;
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(`/api/brands/${brandId}/discover-prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string })?.error || 'Failed to start discovery');
      startedAt.current = Date.now();
      setJob(data.job as DiscoveryJob);
    } catch (e) {
      setError((e as Error).message);
    }
    setStarting(false);
  };

  const accept = async () => {
    if (!job?.prompts.length || accepting) return;
    setAccepting(true);
    try {
      await onAccept(job.prompts);
      setJob(null);
    } catch (e) {
      setError((e as Error).message || 'Failed to add the prompts');
    }
    setAccepting(false);
  };

  const running = job?.status === 'queued' || job?.status === 'running';

  return (
    <Card
      title="Find prompts for me"
      right={running ? <Badge tone="acc">RUNNING</Badge> : undefined}
      lede="Builds a prompt set from how people actually search for what you do, filters it down to the ones with buying intent, then groups them into topics and binds each to the page that should win it."
    >
      {!job && (
        <div style={{ display: 'grid', gap: 12 }}>
          {error && (
            <div style={{ fontSize: 12.5, color: 'var(--danger)' }}>{error}</div>
          )}
          <div>
            <button
              type="button"
              className="btn-p"
              onClick={start}
              disabled={starting || disabled}
              title={disabled ? disabledReason : undefined}
            >
              {starting ? 'Starting…' : 'Find prompts'}
            </button>
            {disabled && disabledReason && (
              <span className="dim" style={{ fontSize: 12, marginLeft: 10 }}>{disabledReason}</span>
            )}
          </div>
        </div>
      )}

      {job && (
        <div style={{ display: 'grid', gap: 14 }}>
          <ul style={{ display: 'grid', gap: 10, listStyle: 'none', margin: 0, padding: 0 }}>
            {job.stages.map(stage => (
              <li
                key={stage.key}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
                  color: stage.status === 'pending' ? 'var(--mute)' : 'inherit',
                }}
              >
                <span style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>
                  <StageIcon status={stage.status} />
                </span>
                <span>{stage.label}</span>
                {stage.detail && (
                  <span className="dim mono" style={{ fontSize: 11 }}>{stage.detail}</span>
                )}
              </li>
            ))}
          </ul>

          {running && (
            <div className="dim" style={{ fontSize: 11.5 }}>
              ⓘ You can close this page if you want — it keeps running in the background.
            </div>
          )}

          {job.status === 'failed' && (
            <div style={{ fontSize: 12.5, color: 'var(--danger)' }}>
              {job.error || 'Discovery failed.'}{' '}
              <button type="button" className="btn-d" onClick={() => { setJob(null); setError(null); }}>
                Try again
              </button>
            </div>
          )}

          {job.status === 'done' && (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Pill tone="acc">{job.prompts.length} prompts</Pill>
                <span className="dim" style={{ fontSize: 12 }}>
                  Review them below, then add the ones you want.
                </span>
              </div>
              <ul
                style={{
                  display: 'grid', gap: 6, listStyle: 'none', margin: 0, padding: 0,
                  maxHeight: 260, overflowY: 'auto', fontSize: 12.5,
                }}
              >
                {job.prompts.map(p => (
                  <li key={p} style={{ padding: '4px 0', borderBottom: '1px solid var(--line, rgba(127,127,127,.15))' }}>
                    {p}
                  </li>
                ))}
              </ul>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn-p" onClick={accept} disabled={accepting}>
                  {accepting ? 'Adding…' : `Add all ${job.prompts.length}`}
                </button>
                <button type="button" className="btn-d" onClick={() => setJob(null)} disabled={accepting}>
                  Discard
                </button>
              </div>
              {error && <div style={{ fontSize: 12.5, color: 'var(--danger)' }}>{error}</div>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
