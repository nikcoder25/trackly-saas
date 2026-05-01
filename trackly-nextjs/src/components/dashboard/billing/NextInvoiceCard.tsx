'use client';

const SURFACE = '#ffffff';
const SURFACE_BORDER = '#ececec';
const SURFACE_RADIUS = 14;
const TEXT_PRIMARY = '#161614';
const TEXT_SECONDARY = '#6b6b6b';
const TEXT_MUTED = '#9a9a9a';
const HAIRLINE = '#f1f1ef';

interface NextInvoiceCardProps {
  /** ISO date string of when the next invoice runs (uses creditStatus.nextResetAt). */
  nextInvoiceAt: string | null;
  /** Plan label, e.g. "Agency". Used for the line item. */
  planLabel: string;
  /** Numeric amount in USD. Hardcoded to USD per current scope. */
  amountUsd: number;
  /** True for plans with no recurring charge (free / owner / enterprise-custom). */
  noChargeReason: 'free' | 'owner' | 'custom' | null;
}

function fmtFullDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export default function NextInvoiceCard({
  nextInvoiceAt,
  planLabel,
  amountUsd,
  noChargeReason,
}: NextInvoiceCardProps) {
  const tax = 0;
  const total = amountUsd + tax;

  return (
    <div
      style={{
        background: SURFACE,
        border: `1px solid ${SURFACE_BORDER}`,
        borderRadius: SURFACE_RADIUS,
        padding: '18px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        height: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY }}>
          Next invoice
        </span>
        <span style={{ fontSize: 13, color: TEXT_SECONDARY }}>
          {noChargeReason ? '—' : fmtFullDate(nextInvoiceAt)}
        </span>
      </div>

      {noChargeReason === 'free' && (
        <NoChargeBlock
          headline="No upcoming charge"
          sub="You're on the Free tier — upgrade for higher caps and scheduled runs."
        />
      )}
      {noChargeReason === 'owner' && (
        <NoChargeBlock headline="—" sub="Owner accounts have no recurring billing." />
      )}
      {noChargeReason === 'custom' && (
        <NoChargeBlock
          headline="Custom"
          sub="Enterprise plans are billed via your account contact."
        />
      )}

      {!noChargeReason && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: TEXT_PRIMARY,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: -0.5,
                lineHeight: 1,
              }}
            >
              {fmtUsd(total)}
            </span>
            <span style={{ fontSize: 13, color: TEXT_MUTED, fontWeight: 500 }}>USD</span>
          </div>

          <div
            style={{
              borderTop: `1px solid ${HAIRLINE}`,
              paddingTop: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <LineItem
              label={`${planLabel} plan, monthly`}
              value={fmtUsd(amountUsd)}
            />
            <LineItem label="Tax" value={fmtUsd(tax)} />
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
            Estimate. Actual amount may vary based on usage and add-ons.
          </div>
        </>
      )}
    </div>
  );
}

function LineItem({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        fontSize: 13,
      }}
    >
      <span style={{ color: TEXT_SECONDARY }}>{label}</span>
      <span style={{ color: TEXT_PRIMARY, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
        {value}
      </span>
    </div>
  );
}

function NoChargeBlock({ headline, sub }: { headline: string; sub: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: TEXT_PRIMARY,
          letterSpacing: -0.4,
          lineHeight: 1.1,
        }}
      >
        {headline}
      </span>
      <span style={{ fontSize: 12, color: TEXT_SECONDARY, lineHeight: 1.5 }}>{sub}</span>
    </div>
  );
}
