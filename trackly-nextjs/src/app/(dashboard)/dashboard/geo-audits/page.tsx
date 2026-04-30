'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { COUNTRIES } from '@/lib/constants';
import {
  listGeoAudits,
  createGeoAudit,
  type GeoAuditRow,
  type GeoAuditStatus,
} from '@/lib/mock/geo-audits';

// TODO(real-data): replace this with the real tracked-prompts list from
// the BrandContext (or a /api/tracked-prompts fetch) once the page is
// wired to a real backend. For now we just show a count so the form can
// render.
const MOCK_TRACKED_PROMPT_COUNT = 24;

const STATUS_LABEL: Record<GeoAuditStatus, string> = {
  queued: 'QUEUED',
  running: 'RUNNING',
  done: 'DONE',
  failed: 'FAILED',
};

const STATUS_COLOR: Record<GeoAuditStatus, string> = {
  queued: 'var(--muted)',
  running: 'var(--primary)',
  done: 'var(--green)',
  failed: 'var(--red)',
};

function StatusPill({ status }: { status: GeoAuditStatus }) {
  return (
    <span style={{
      fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
      color: STATUS_COLOR[status],
      padding: '2px 8px',
      background: status === 'done' ? 'rgba(16,185,129,.08)'
        : status === 'failed' ? 'rgba(239,68,68,.08)'
        : status === 'running' ? 'rgba(99,102,241,.08)'
        : 'rgba(148,163,184,.10)',
      borderRadius: 100,
      whiteSpace: 'nowrap',
    }}>{STATUS_LABEL[status]}</span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
}

interface NewAuditModalProps {
  onClose: () => void;
  onCreate: (input: { regions: string[]; promptsRun: number }) => void;
}

function NewAuditModal({ onClose, onCreate }: NewAuditModalProps) {
  const [region, setRegion] = useState<string>(COUNTRIES[0]);
  const [extraRegions, setExtraRegions] = useState<string[]>([]);
  const [allPrompts, setAllPrompts] = useState(true);
  const [promptCount, setPromptCount] = useState<number>(MOCK_TRACKED_PROMPT_COUNT);
  const [submitting, setSubmitting] = useState(false);

  // ESC closes the modal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const allRegions = useMemo(() => [region, ...extraRegions], [region, extraRegions]);

  function addExtraRegion() {
    const remaining = COUNTRIES.find(c => !allRegions.includes(c));
    if (!remaining) return;
    setExtraRegions([...extraRegions, remaining]);
  }

  function setExtraAt(idx: number, value: string) {
    const next = extraRegions.slice();
    next[idx] = value;
    setExtraRegions(next);
  }

  function removeExtra(idx: number) {
    setExtraRegions(extraRegions.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    onCreate({ regions: allRegions, promptsRun: allPrompts ? MOCK_TRACKED_PROMPT_COUNT : promptCount });
    onClose();
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Run new geo audit"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}>
      <div onClick={e => e.stopPropagation()}
        className="card"
        style={{ width: '100%', maxWidth: 480, padding: 20, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Run new geo audit</h2>
          <button onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 0, minWidth: 44, minHeight: 44 }}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="ga-primary-region" style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
              Region
            </label>
            <select id="ga-primary-region" className="brand-select" style={{ width: '100%', margin: 0 }}
              value={region} onChange={e => setRegion(e.target.value)}>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {extraRegions.map((r, i) => (
            <div key={i} style={{ marginBottom: 14, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label htmlFor={`ga-extra-${i}`} style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
                  Additional region
                </label>
                <select id={`ga-extra-${i}`} className="brand-select" style={{ width: '100%', margin: 0 }}
                  value={r} onChange={e => setExtraAt(i, e.target.value)}>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button type="button" onClick={() => removeExtra(i)} aria-label="Remove region"
                style={{ minWidth: 44, minHeight: 44, background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', color: 'var(--muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
          ))}

          {allRegions.length < COUNTRIES.length && (
            <button type="button" onClick={addExtraRegion}
              style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 'var(--radius-xs)', color: 'var(--primary)', padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 18, width: '100%' }}>
              + Add another region
            </button>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
              Prompts to include
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer', minHeight: 44 }}>
              <input type="radio" name="ga-prompts" checked={allPrompts} onChange={() => setAllPrompts(true)} />
              All tracked prompts ({MOCK_TRACKED_PROMPT_COUNT})
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer', minHeight: 44 }}>
              <input type="radio" name="ga-prompts" checked={!allPrompts} onChange={() => setAllPrompts(false)} />
              Custom count
              {!allPrompts && (
                <input type="number" min={1} max={MOCK_TRACKED_PROMPT_COUNT} value={promptCount}
                  onChange={e => setPromptCount(Math.max(1, Math.min(MOCK_TRACKED_PROMPT_COUNT, Number(e.target.value) || 1)))}
                  className="brand-select" style={{ width: 80, margin: 0 }} />
              )}
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18, flexWrap: 'wrap' }}>
            <button type="button" onClick={onClose} className="pbtn" style={{ minHeight: 44 }}>Cancel</button>
            <button type="submit" disabled={submitting}
              style={{
                minHeight: 44, padding: '8px 18px', background: 'var(--primary)', color: '#fff',
                border: 'none', borderRadius: 'var(--radius-xs)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                opacity: submitting ? 0.6 : 1,
              }}>
              {submitting ? 'Queuing…' : 'Run audit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function GeoAuditsPage() {
  const [audits, setAudits] = useState<GeoAuditRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tableScrolled, setTableScrolled] = useState(false);

  useEffect(() => {
    setAudits(listGeoAudits());
  }, []);

  function handleCreate(input: { regions: string[]; promptsRun: number }) {
    createGeoAudit(input);
    setAudits(listGeoAudits());
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="view-title">Geo Audits</div>
          <div className="view-sub">Run your tracked prompts through AI models from different regions.</div>
        </div>
        <button onClick={() => setModalOpen(true)}
          style={{
            minHeight: 44, padding: '8px 18px', background: 'var(--primary)', color: '#fff',
            border: 'none', borderRadius: 'var(--radius-xs)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}>
          + Run new audit
        </button>
      </div>

      {audits.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 36, opacity: .4, marginBottom: 12 }}>🌍</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>No geo audits yet</div>
          <p style={{ color: 'var(--muted)', fontSize: 13, maxWidth: 360, margin: '0 auto 16px' }}>
            Run your tracked prompts from a chosen country or region to compare how your brand shows up across markets.
          </p>
          <button onClick={() => setModalOpen(true)}
            style={{
              display: 'inline-block', background: 'var(--primary)', color: '#fff',
              padding: '8px 20px', borderRadius: 'var(--radius-xs)', fontSize: 12, fontWeight: 700,
              border: 'none', cursor: 'pointer',
            }}>
            Run your first geo audit
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className={`scroll-fade-wrap${tableScrolled ? ' is-scrolled' : ''}`}>
            <div
              style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
              onScroll={(e) => {
                const next = (e.currentTarget.scrollLeft || 0) > 0;
                if (next !== tableScrolled) setTableScrolled(next);
              }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 640 }}>
                <thead>
                  <tr style={{ background: 'var(--bg3)' }}>
                    <th className="th" style={{ width: '20%' }}>Date</th>
                    <th className="th">Region</th>
                    <th className="th" style={{ width: '14%' }}>Prompts</th>
                    <th className="th" style={{ width: '14%' }}>Mentions</th>
                    <th className="th" style={{ width: '14%' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {audits.map((a) => {
                    const isExpanded = expandedId === a.id;
                    return (
                      <React.Fragment key={a.id}>
                        <tr className="trow" role="button" tabIndex={0}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setExpandedId(isExpanded ? null : a.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setExpandedId(isExpanded ? null : a.id);
                            }
                          }}>
                          <td className="td" style={{ fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{formatDate(a.createdAt)}</td>
                          <td className="td">{a.regions.join(' · ')}</td>
                          <td className="td" style={{ fontFamily: 'var(--mono)' }}>{a.promptsRun}</td>
                          <td className="td" style={{ fontFamily: 'var(--mono)', color: a.mentionsFound > 0 ? 'var(--green)' : 'var(--muted)' }}>
                            {a.status === 'done' ? a.mentionsFound : '-'}
                          </td>
                          <td className="td"><StatusPill status={a.status} /></td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={5} style={{ padding: 0 }}>
                              <div style={{ padding: 16, background: 'var(--bg)', borderTop: '1px solid var(--bg3)', fontSize: 12, color: 'var(--text)', lineHeight: 1.7 }}>
                                <div><strong>Audit ID:</strong> <span style={{ fontFamily: 'var(--mono)' }}>{a.id}</span></div>
                                <div><strong>Regions:</strong> {a.regions.join(', ')}</div>
                                <div><strong>Prompts run:</strong> {a.promptsRun}</div>
                                <div>
                                  <strong>Mention rate:</strong>{' '}
                                  {a.status === 'done' && a.promptsRun > 0
                                    ? `${Math.round((a.mentionsFound / a.promptsRun) * 100)}% (${a.mentionsFound}/${a.promptsRun})`
                                    : '-'}
                                </div>
                                {a.status === 'failed' && (
                                  <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(239,68,68,.05)', border: '1px solid rgba(239,68,68,.15)', borderRadius: 'var(--radius-xs)', color: 'var(--red)' }}>
                                    This audit failed. The audit run errored before producing results — try running it again.
                                  </div>
                                )}
                                {a.status === 'done' && (
                                  <div style={{ marginTop: 10 }}>
                                    <a href={`/dashboard/results?audit=${encodeURIComponent(a.id)}`}
                                      style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}>
                                      View raw results →
                                    </a>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {modalOpen && <NewAuditModal onClose={() => setModalOpen(false)} onCreate={handleCreate} />}
    </div>
  );
}
