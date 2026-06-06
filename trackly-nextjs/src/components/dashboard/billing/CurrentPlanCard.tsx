'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BILLING_PORTAL_URL } from '@/lib/constants';
import { useAuth } from '@/contexts/AuthContext';

const SURFACE = '#ffffff';
const SURFACE_BORDER = '#ececec';
const SURFACE_RADIUS = 14;
const TEXT_PRIMARY = '#161614';
const TEXT_SECONDARY = '#6b6b6b';
const TEXT_MUTED = '#9a9a9a';
const ACCENT_LINK = '#4f46e5';
const PROGRESS_TRACK = '#ececec';
const PROGRESS_FILL = '#161614';

interface CurrentPlanCardProps {
  planLabel: string; // "Agency", "Free", "Owner", etc.
  priceLabel: string; // "$89/mo", "$0", "Custom"
  cycleSuffix: string; // "billed monthly", "free tier", etc.
  renewsOn: string | null; // ISO date for nextResetAt
  memberSince: string | null; // ISO date for user.createdAt
  daysIntoMonth: number;
  daysRemainingInMonth: number;
  onManagePlan: () => void;
}

function fmtFullDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtMonthYear(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function CurrentPlanCard({
  planLabel,
  priceLabel,
  cycleSuffix,
  renewsOn,
  memberSince,
  daysIntoMonth,
  daysRemainingInMonth,
  onManagePlan,
}: CurrentPlanCardProps) {
  const totalDays = Math.max(1, daysIntoMonth + daysRemainingInMonth);
  const dayOfPeriod = Math.min(totalDays, Math.max(1, daysIntoMonth));
  const progressPct = Math.min(100, (dayOfPeriod / totalDays) * 100);
  const daysLeftLabel =
    daysRemainingInMonth <= 0
      ? 'Renews today'
      : `${daysRemainingInMonth} day${daysRemainingInMonth === 1 ? '' : 's'} left`;

  const { refreshUser } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  // User-facing escape hatch when the webhook is delayed and the page
  // shows a stale plan. Hits /api/payments/refresh which pulls live
  // state from Dodo, reconciles the local DB, then we re-pull the
  // user record so this card and any other plan-driven view rerenders.
  async function handleRefreshStatus() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const res = await fetch('/api/payments/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRefreshMsg(data?.error || 'Could not refresh subscription. Try again shortly.');
        return;
      }
      await refreshUser();
      setRefreshMsg(data?.synced ? `Synced - now on ${data.plan}.` : 'Already up to date.');
    } catch {
      setRefreshMsg('Network error while refreshing subscription.');
    } finally {
      setRefreshing(false);
      setTimeout(() => setRefreshMsg(null), 6000);
    }
  }

  return (
    <div
      style={{
        background: SURFACE,
        border: `1px solid ${SURFACE_BORDER}`,
        borderRadius: SURFACE_RADIUS,
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      {/* Top row: plan + meta */}
      <div
        className="cpc-top"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.6fr) repeat(3, minmax(0, 1fr))',
          gap: 24,
          alignItems: 'flex-start',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              color: TEXT_MUTED,
              marginBottom: 6,
            }}
          >
            Current plan
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: TEXT_PRIMARY,
                lineHeight: 1.1,
                letterSpacing: -0.4,
              }}
            >
              {planLabel}
            </span>
            <span style={{ fontSize: 14, color: TEXT_SECONDARY, fontWeight: 500 }}>
              {priceLabel}
              {cycleSuffix && (
                <>
                  <span style={{ color: TEXT_MUTED, margin: '0 6px' }}>·</span>
                  {cycleSuffix}
                </>
              )}
            </span>
          </div>
        </div>

        <MetaCol label="Renews" value={fmtFullDate(renewsOn)} />
        <MetaCol
          label="Payment"
          value={
            <Link
              href={BILLING_PORTAL_URL}
              target="_blank"
              rel="noopener"
              style={{ color: TEXT_PRIMARY, textDecoration: 'none', fontWeight: 500 }}
            >
              Managed via Billing portal{' '}
              <span style={{ color: ACCENT_LINK, fontWeight: 600 }}>· Update →</span>
            </Link>
          }
        />
        <MetaCol label="Member since" value={fmtMonthYear(memberSince)} />
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link
          href={BILLING_PORTAL_URL}
          target="_blank"
          rel="noopener"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 16px',
            borderRadius: 10,
            background: SURFACE,
            border: `1px solid ${SURFACE_BORDER}`,
            color: TEXT_PRIMARY,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Billing portal
        </Link>
        <button
          onClick={onManagePlan}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 16px',
            borderRadius: 10,
            background: '#161614',
            border: '1px solid #161614',
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Manage plan
        </button>
        <button
          onClick={handleRefreshStatus}
          disabled={refreshing}
          title="Pull the latest subscription state from the payment provider"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 16px',
            borderRadius: 10,
            background: SURFACE,
            border: `1px solid ${SURFACE_BORDER}`,
            color: refreshing ? TEXT_MUTED : TEXT_PRIMARY,
            fontSize: 13,
            fontWeight: 600,
            cursor: refreshing ? 'not-allowed' : 'pointer',
          }}
        >
          {refreshing ? 'Refreshing…' : 'Refresh status'}
        </button>
        {refreshMsg && (
          <span style={{ fontSize: 12, color: TEXT_SECONDARY, alignSelf: 'center' }}>
            {refreshMsg}
          </span>
        )}
      </div>

      {/* Period progress */}
      <div>
        <div
          style={{
            height: 4,
            borderRadius: 999,
            background: PROGRESS_TRACK,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progressPct}%`,
              background: PROGRESS_FILL,
              borderRadius: 999,
              transition: 'width 1s cubic-bezier(.16,1,.3,1)',
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 8,
            fontSize: 12,
            color: TEXT_SECONDARY,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span>
            Day {dayOfPeriod} of {totalDays}
          </span>
          <span>{daysLeftLabel}</span>
        </div>
      </div>

      <style>{`
        @media (max-width: 880px) {
          .cpc-top { grid-template-columns: 1fr 1fr !important; row-gap: 16px !important; }
        }
        @media (max-width: 560px) {
          .cpc-top { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function MetaCol({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 12,
          color: TEXT_MUTED,
          fontWeight: 500,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: TEXT_PRIMARY,
          fontWeight: 500,
          lineHeight: 1.4,
          wordBreak: 'break-word',
        }}
      >
        {value}
      </div>
    </div>
  );
}
