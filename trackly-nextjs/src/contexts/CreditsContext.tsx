'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface CreditStatus {
  plan: string;
  label: string;
  remaining: number;
  monthlyCap: number;
  /** Committed spend (ledger-backed) - see lib/credits.ts. */
  monthlyUsed: number;
  /** In-flight reservations not yet dispatched. */
  reservedCredits: number;
  manualRemainingToday: number;
  manualDailyCap: number;
  cooldownSeconds: number;
  modelTier: 'economy' | 'premium';
  scheduledRuns: boolean;
  nextResetAt: string;
  nextDailyResetAt: string;
  lowBalance: boolean;
}

interface PreflightRequest {
  cost: number;
  label?: string;
  resolve: (proceed: boolean) => void;
}

interface CreditsContextType {
  status: CreditStatus | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /**
   * Opens the pre-flight confirmation modal. Resolves to `true` if
   * the user confirms, `false` if they cancel or the run is blocked
   * (zero credits, daily cap hit, etc.) - in the blocked case the
   * provider also surfaces an inline error in the modal so the user
   * sees why before clicking away.
   */
  confirmRun: (cost: number, label?: string) => Promise<boolean>;
}

const CreditsContext = createContext<CreditsContextType>({
  status: null,
  loading: true,
  refresh: async () => {},
  confirmRun: async () => true,
});

export function useCredits() {
  return useContext(CreditsContext);
}

const STATUS_TTL_MS = 8000;

export function CreditsProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<CreditStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [preflight, setPreflight] = useState<PreflightRequest | null>(null);
  const lastFetchRef = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/credits/status', { credentials: 'include' });
      if (!res.ok) {
        // Don't blow up the dashboard if the endpoint is down; the
        // banner / modal degrade to "unknown" state and the run
        // route will still enforce the cap server-side.
        setStatus(null);
        return;
      }
      const data = (await res.json()) as CreditStatus;
      setStatus(data);
      lastFetchRef.current = Date.now();
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    // Re-fetch after every run completes so the meter reflects the
    // freshly-spent credits without a manual reload.
    window.addEventListener('livesov:run-complete', handler);
    // Periodic refresh - captures cron-driven spend and the
    // monthly/daily rollover boundaries even if the user leaves the
    // tab open overnight.
    const id = setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener('livesov:run-complete', handler);
      clearInterval(id);
    };
  }, [refresh]);

  const confirmRun = useCallback(
    async (cost: number, label?: string): Promise<boolean> => {
      // Pull a fresh copy if the cached one is stale, so the modal
      // never shows yesterday's "remaining: 12" when the user
      // actually has 0 left today.
      if (Date.now() - lastFetchRef.current > STATUS_TTL_MS) {
        await refresh();
      }
      return new Promise((resolve) => {
        setPreflight({ cost, label, resolve });
      });
    },
    [refresh],
  );

  const value = useMemo(
    () => ({ status, loading, refresh, confirmRun }),
    [status, loading, refresh, confirmRun],
  );

  return (
    <CreditsContext.Provider value={value}>
      {children}
      {preflight && (
        <PreflightModal
          status={status}
          cost={preflight.cost}
          label={preflight.label}
          onCancel={() => {
            preflight.resolve(false);
            setPreflight(null);
          }}
          onConfirm={() => {
            preflight.resolve(true);
            setPreflight(null);
          }}
        />
      )}
    </CreditsContext.Provider>
  );
}

function PreflightModal({
  status,
  cost,
  label,
  onCancel,
  onConfirm,
}: {
  status: CreditStatus | null;
  cost: number;
  label?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const remaining = status?.remaining ?? 0;
  const monthlyCap = status?.monthlyCap ?? 0;
  const dailyRemaining = status?.manualRemainingToday ?? 0;
  const dailyCap = status?.manualDailyCap ?? 0;
  // Display the daily counter as USED/cap (not remaining/cap). For a user who
  // has run nothing today this is 0/cap - previously we rendered remaining/cap
  // here, which showed a brand-new user "30/30" and read like "all used up".
  const manualUsedToday = Math.max(0, dailyCap - dailyRemaining);
  const blocked =
    !status ||
    remaining < cost ||
    dailyRemaining < cost ||
    !status?.scheduledRuns && false; // scheduledRuns is for auto only - manual is always allowed if credits exist

  // One user-facing unit: a "scan" = one prompt checked on one AI engine,
  // which maps 1:1 to an internal credit. We keep the credit ledger internally
  // but always say "scans" in the UI so the dialog matches the trial banner.
  const blockReason = !status
    ? 'Could not verify your scan balance - try again in a moment.'
    : remaining < cost
      ? `Not enough monthly scans (${remaining.toLocaleString()} remaining, this run needs ${cost.toLocaleString()}).`
      : dailyRemaining < cost
        // The block here means the run's cost exceeds what's left of the daily
        // manual allowance - which, for a fresh user, is because one full scan
        // (queries × platforms) is larger than the daily cap, NOT because they
        // used it up. Say that explicitly with used/cap so it isn't misread.
        ? `This run needs ${cost.toLocaleString()} scan${cost === 1 ? '' : 's'}, but your daily manual limit is ${dailyCap} (${manualUsedToday} used today, ${dailyRemaining} left). Resets at midnight UTC.`
        : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm run"
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 20,
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
          {label ? `Run ${label}` : 'Run query'}
        </h2>
        <p style={{ margin: '0 0 16px 0', color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>
          This run will use{' '}
          <strong style={{ color: 'var(--text)' }}>
            {cost.toLocaleString()} scan{cost === 1 ? '' : 's'}
          </strong>
          {monthlyCap > 0 && (
            <> of your <strong>{remaining.toLocaleString()} / {monthlyCap.toLocaleString()}</strong> remaining this month.</>
          )}
        </p>
        {dailyCap > 0 && dailyCap < 9999 && (
          <p style={{ margin: '0 0 16px 0', color: 'var(--muted)', fontSize: 12 }}>
            Manual today: <strong>{manualUsedToday}/{dailyCap}</strong> used
          </p>
        )}
        {blocked && blockReason && (
          <div style={{
            background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.25)',
            borderRadius: 'var(--radius-xs)', padding: '10px 12px',
            color: '#ef4444', fontSize: 12, marginBottom: 16,
          }}>
            {blockReason}
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
              style={{
                background: 'var(--primary)', border: 'none', color: '#fff',
                padding: '9px 16px', borderRadius: 'var(--radius-xs)',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
            >
              Run now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
