'use client';

import { useEffect, useState } from 'react';

const SURFACE = '#ffffff';
const SURFACE_BORDER = '#ececec';
const SURFACE_RADIUS = 14;
const TEXT_PRIMARY = '#161614';
const TEXT_SECONDARY = '#6b6b6b';
const TEXT_MUTED = '#9a9a9a';
const HAIRLINE = '#f1f1ef';
const TOGGLE_OFF = '#d4d4d4';
const TOGGLE_ON = '#161614';

interface UsageAlertsCardProps {
  email: string | null;
}

interface AlertPrefs {
  notify80: boolean;
  notify95: boolean;
  notifyOver: boolean;
}

const STORAGE_KEY = 'trackly:billing:usageAlerts';
const DEFAULT_PREFS: AlertPrefs = {
  notify80: true,
  notify95: true,
  notifyOver: false,
};

function readPrefs(): AlertPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<AlertPrefs>;
    return {
      notify80: typeof parsed.notify80 === 'boolean' ? parsed.notify80 : DEFAULT_PREFS.notify80,
      notify95: typeof parsed.notify95 === 'boolean' ? parsed.notify95 : DEFAULT_PREFS.notify95,
      notifyOver: typeof parsed.notifyOver === 'boolean' ? parsed.notifyOver : DEFAULT_PREFS.notifyOver,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export default function UsageAlertsCard({ email }: UsageAlertsCardProps) {
  // Hydrate from localStorage post-mount so SSR markup matches the
  // default state and the toggles flip on first render only.
  const [prefs, setPrefs] = useState<AlertPrefs>(DEFAULT_PREFS);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setPrefs(readPrefs());
    setHydrated(true);
  }, []);

  const update = (patch: Partial<AlertPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage may be unavailable in incognito or strict-cookie
      // browsers; the toggle still updates UI state for this session.
    }
  };

  return (
    <div
      style={{
        background: SURFACE,
        border: `1px solid ${SURFACE_BORDER}`,
        borderRadius: SURFACE_RADIUS,
        padding: '18px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        height: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY }}>
          Usage alerts
        </span>
        {email && (
          <span
            style={{
              fontSize: 12,
              color: TEXT_SECONDARY,
              wordBreak: 'break-all',
              maxWidth: '100%',
            }}
          >
            {email}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <ToggleRow
          label="Notify at 80% credit usage"
          checked={prefs.notify80}
          onChange={(v) => update({ notify80: v })}
          disabled={!hydrated}
        />
        <ToggleRow
          label="Notify at 95% credit usage"
          checked={prefs.notify95}
          onChange={(v) => update({ notify95: v })}
          disabled={!hydrated}
        />
        <ToggleRow
          label="Notify when over credit limit"
          checked={prefs.notifyOver}
          onChange={(v) => update({ notifyOver: v })}
          disabled={!hydrated}
          last
        />
      </div>

      <div
        style={{
          borderTop: `1px solid ${HAIRLINE}`,
          paddingTop: 10,
          fontSize: 11,
          color: TEXT_MUTED,
          lineHeight: 1.5,
        }}
      >
        Saved locally — server sync coming soon.
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  disabled,
  last,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 0',
        borderBottom: last ? 'none' : `1px solid ${HAIRLINE}`,
        gap: 12,
      }}
    >
      <span
        style={{
          fontSize: 13,
          color: disabled ? TEXT_MUTED : TEXT_PRIMARY,
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        style={{
          width: 36,
          height: 20,
          borderRadius: 999,
          border: 'none',
          background: checked ? TOGGLE_ON : TOGGLE_OFF,
          position: 'relative',
          cursor: disabled ? 'default' : 'pointer',
          padding: 0,
          transition: 'background 180ms ease',
          flexShrink: 0,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 18 : 2,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#ffffff',
            transition: 'left 180ms ease',
            boxShadow: '0 1px 3px rgba(0,0,0,.18)',
          }}
        />
      </button>
    </div>
  );
}
