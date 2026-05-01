'use client';

import { useEffect } from 'react';

/**
 * Stub modal shown when the user clicks "Compare 2 selected" while
 * exactly two audits are checked. The compare view itself is a
 * follow-up PR (Screens 03+); this is a placeholder so the button
 * isn't a no-op or a dead link.
 */
interface Props {
  ids: [string, string];
  onClose: () => void;
}

export default function CompareStubModal({ ids, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Compare audits — coming soon"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1100, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', maxWidth: 420, width: '100%',
          padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,.3)',
        }}
      >
        <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
          Compare view — coming soon
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.55 }}>
          Side-by-side region comparison ships in a follow-up release.
          Tracking{' '}
          <code style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)' }}>{ids[0]}</code>{' '}
          vs{' '}
          <code style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)' }}>{ids[1]}</code>.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 16px', borderRadius: 'var(--radius-xs)',
              background: 'var(--primary)', color: '#fff', border: 'none',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
