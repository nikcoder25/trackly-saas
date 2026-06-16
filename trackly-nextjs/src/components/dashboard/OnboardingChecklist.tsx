'use client';

import { useState, useEffect, useMemo, type ReactNode, type CSSProperties } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useBrands } from '@/contexts/BrandContext';
import { useRun } from '@/contexts/RunContext';

/**
 * Lightweight first-login progress checklist that makes the happy path
 * obvious: verify email → add brand → run first scan → view results. It
 * derives each step's completion from real app state, is dismissable, and
 * hides itself entirely once every step is done.
 */
const RESULTS_SEEN_KEY = 'livesov_onboarding_results_seen';
const DISMISSED_KEY = 'livesov_onboarding_checklist_dismissed';

export default function OnboardingChecklist() {
  const { user } = useAuth();
  const { brands, loading: brandsLoading, selectedBrandLocked } = useBrands();
  const { startRun, live } = useRun();

  const [dismissed, setDismissed] = useState(false);
  const [resultsSeen, setResultsSeen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISSED_KEY) === '1') setDismissed(true);
      if (localStorage.getItem(RESULTS_SEEN_KEY) === '1') setResultsSeen(true);
    } catch { /* storage unavailable */ }
  }, []);

  // Has any brand completed at least one run?
  const hasRun = useMemo(() => brands.some(b => {
    const runs = (b as Record<string, unknown>).runs;
    return Array.isArray(runs) && runs.length > 0;
  }), [brands]);

  // Once results exist and the user has run, treat the run as "viewed" too if
  // they've already seen real data before (flag persisted on click below).
  const emailVerified = !!user?.emailVerified;
  const hasBrand = brands.length > 0;

  const steps = [
    {
      key: 'verify', label: 'Verify your email', done: emailVerified,
      hint: 'Check your inbox - the link unlocks your full 7-day trial.',
      cta: null as ReactNode,
    },
    {
      key: 'brand', label: 'Add your brand', done: hasBrand,
      hint: 'Tell us your brand, competitors and the prompts to track.',
      cta: <Link href="/dashboard/setup" style={ctaStyle}>Add brand →</Link>,
    },
    {
      key: 'scan', label: 'Run your first scan', done: hasRun,
      hint: 'Send your tracked prompts to the AI engines.',
      cta: hasBrand && !hasRun ? (
        <button
          onClick={() => startRun(false)}
          disabled={live.running || selectedBrandLocked}
          style={{ ...ctaStyle, border: 'none', cursor: live.running || selectedBrandLocked ? 'not-allowed' : 'pointer', opacity: live.running || selectedBrandLocked ? 0.6 : 1 }}
        >
          {live.running ? 'Running…' : 'Run now →'}
        </button>
      ) : null,
    },
    {
      key: 'results', label: 'View your results', done: resultsSeen && hasRun,
      hint: 'See your Share of Voice, mentions and competitors.',
      cta: hasRun ? (
        <Link
          href="/dashboard"
          onClick={() => { try { localStorage.setItem(RESULTS_SEEN_KEY, '1'); } catch {} setResultsSeen(true); }}
          style={ctaStyle}
        >View results →</Link>
      ) : null,
    },
  ];

  const doneCount = steps.filter(s => s.done).length;
  const allDone = doneCount === steps.length;

  // Don't render until brands are loaded (avoids a flash of "add brand" for
  // users who already have one), once everything is done, or once dismissed.
  if (brandsLoading || !user || allDone || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch {}
  };

  // Index of the next actionable (incomplete) step - highlighted to guide focus.
  const activeIdx = steps.findIndex(s => !s.done);

  return (
    <div style={{
      marginBottom: 12, padding: '14px 16px',
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-xs)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Get started</span>
        <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{doneCount}/{steps.length} complete</span>
        <div style={{ flex: 1, height: 4, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${(doneCount / steps.length) * 100}%`, height: '100%', background: 'var(--green)', transition: 'width .4s ease' }} />
        </div>
        <button onClick={handleDismiss} aria-label="Dismiss checklist" style={{
          background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer',
          fontSize: 15, lineHeight: 1, padding: 0, opacity: 0.5,
        }}>&times;</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((s, i) => {
          const active = i === activeIdx;
          return (
            <div key={s.key} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              opacity: s.done ? 0.6 : 1,
            }}>
              <span style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                background: s.done ? 'var(--green)' : active ? 'var(--primary)' : 'var(--bg3)',
                color: s.done || active ? '#fff' : 'var(--muted)',
                border: s.done || active ? 'none' : '1px solid var(--border)',
              }}>{s.done ? '✓' : i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: s.done ? 500 : 600, color: 'var(--text)', textDecoration: s.done ? 'line-through' : 'none' }}>
                  {s.label}
                </div>
                {active && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{s.hint}</div>}
              </div>
              {active && s.cta}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ctaStyle: CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--primary)',
  padding: '5px 12px', borderRadius: 6, textDecoration: 'none', whiteSpace: 'nowrap',
  flexShrink: 0,
};
