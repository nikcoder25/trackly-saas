'use client';

import { useEffect } from 'react';
import { useCredits } from '@/contexts/CreditsContext';
import {
  AUDIT_PER_UNIT_COST as STATE_PER_UNIT_COST,
  AUDIT_PLATFORMS_COUNT as STATE_PLATFORMS_COUNT,
  computeAuditCreditState,
} from './audit-credit-confirm-state';

// Re-export so the page can import the cost constants from the same
// module it imports the modal from.
export const AUDIT_PER_UNIT_COST = STATE_PER_UNIT_COST;
export const AUDIT_PLATFORMS_COUNT = STATE_PLATFORMS_COUNT;

/**
 * Pre-flight credit-confirmation popup for Regional Audits.
 *
 * Sibling of `PreflightModal` in src/contexts/CreditsContext.tsx —
 * mirrors its visual pattern (typography, layout, colors, blocked
 * state, upgrade link) so the user feels they're seeing the same
 * popup as the brand-run "Run query" flow. Differs only where the
 * audit spec calls for it:
 *
 *   - Three explicit numbers (cost, available now, remaining after)
 *     instead of the brand-run modal's two-number "X / Y" line.
 *   - "Confirm & Run" primary button (vs. the brand-run modal's
 *     "Run now"), per the approved audit copy.
 *   - Cost breakdown shown inline:
 *     "{cost} credits  ({regions} regions × {prompts} prompts × 5 models)"
 *     so the multiplication is visible.
 *
 * All numeric inputs come from the SAME credit hook the rest of the
 * dashboard uses (`useCredits().status`) — no fabricated values, no
 * separate fetch.
 */

interface AuditCreditConfirmModalProps {
  /** Number of regions selected. Used for the math breakdown only. */
  regionsCount: number;
  /** Number of prompts selected. Used for the math breakdown only. */
  promptsCount: number;
  /**
   * Per-unit cost — same constant the brand-run "Run query" popup
   * uses (1 credit per LLM call). Defaults to 1 so callers can omit.
   */
  perUnitCost?: number;
  /** Number of platforms — fixed at 5 for v1. Surfaced as a prop so
   *  tests can vary it without touching the constant. */
  platformsCount?: number;
  /** User clicked Cancel or hit Escape. */
  onCancel: () => void;
  /** User clicked Confirm & Run. */
  onConfirm: () => void;
}

export default function AuditCreditConfirmModal({
  regionsCount,
  promptsCount,
  perUnitCost = AUDIT_PER_UNIT_COST,
  platformsCount = AUDIT_PLATFORMS_COUNT,
  onCancel,
  onConfirm,
}: AuditCreditConfirmModalProps) {
  const { status } = useCredits();

  // All math + blocked-state lives in audit-credit-confirm-state.ts so
  // the same logic powering the popup is what the unit tests assert
  // against. The component is purely presentational below.
  const state = computeAuditCreditState(status, {
    regionsCount, promptsCount, perUnitCost, platformsCount,
  });
  const { cost, remaining, monthlyCap, remainingAfter, isUnlimited, blocked, blockMessage } = state;
  const dailyRemaining = status?.manualRemainingToday ?? 0;
  const dailyCap = status?.manualDailyCap ?? 0;

  // ESC closes the modal — same as PreflightModal's overlay onClick.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // Format a long-form number row. Tabular alignment so the three
  // numbers stack visually even at different magnitudes.
  const NumberRow = ({
    label, value, valueColor,
  }: { label: string; value: string; valueColor?: string }) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '6px 0', fontSize: 13,
    }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <strong style={{
        fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums',
        color: valueColor ?? 'var(--text)',
      }}>
        {value}
      </strong>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm regional audit"
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1100, padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', maxWidth: 440, width: '100%',
          padding: 24, fontFamily: 'var(--font)', color: 'var(--text)',
          boxShadow: '0 20px 60px rgba(0,0,0,.3)',
        }}
      >
        <h2 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 700 }}>
          Run Regional Audit
        </h2>
        <p style={{ margin: '0 0 14px 0', color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>
          This audit will use{' '}
          <strong style={{ color: 'var(--text)' }}>
            {cost.toLocaleString()} credit{cost === 1 ? '' : 's'}
          </strong>{' '}
          ({regionsCount.toLocaleString()} region{regionsCount === 1 ? '' : 's'}
          {' × '}
          {promptsCount.toLocaleString()} prompt{promptsCount === 1 ? '' : 's'}
          {' × '}
          {platformsCount} models).
        </p>

        <div
          data-testid="audit-credit-summary"
          style={{
            background: 'var(--bg2, var(--bg))',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xs)',
            padding: '8px 14px',
            marginBottom: 16,
          }}
        >
          <NumberRow
            label="Credits this audit will consume"
            value={cost.toLocaleString()}
          />
          <NumberRow
            label="Credits available right now"
            value={
              isUnlimited
                ? '∞'
                : `${remaining.toLocaleString()} / ${monthlyCap.toLocaleString()}`
            }
          />
          <NumberRow
            label="Credits remaining after the audit"
            value={
              isUnlimited
                ? '∞'
                : remainingAfter.toLocaleString()
            }
            valueColor={
              !isUnlimited && remaining < cost
                ? '#ef4444'
                : undefined
            }
          />
        </div>

        {dailyCap > 0 && dailyCap < 9999 && !blocked && (
          <p style={{ margin: '0 0 16px 0', color: 'var(--muted)', fontSize: 12 }}>
            Manual today: <strong>{dailyRemaining}/{dailyCap}</strong>
          </p>
        )}

        {blocked && blockMessage && (
          <div
            data-testid="audit-credit-blocked"
            style={{
              background: 'rgba(239,68,68,.06)',
              border: '1px solid rgba(239,68,68,.25)',
              borderRadius: 'var(--radius-xs)',
              padding: '10px 12px',
              color: '#ef4444', fontSize: 12, marginBottom: 16,
            }}
          >
            {blockMessage}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: 'none', border: '1px solid var(--border)',
              color: 'var(--text)', padding: '9px 16px',
              borderRadius: 'var(--radius-xs)', fontSize: 13,
              fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
            }}
          >
            Cancel
          </button>
          {blocked ? (
            <a
              href="/dashboard/billing"
              style={{
                background: '#ef4444', border: 'none', color: '#fff',
                padding: '9px 16px', borderRadius: 'var(--radius-xs)',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'var(--font)', textDecoration: 'none',
              }}
            >
              Upgrade Plan
            </a>
          ) : (
            <button
              type="button"
              onClick={onConfirm}
              data-testid="audit-credit-confirm"
              style={{
                background: 'var(--primary)', border: 'none', color: '#fff',
                padding: '9px 16px', borderRadius: 'var(--radius-xs)',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
            >
              Confirm &amp; Run
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
