'use client';

interface Props {
  promptsCount: number;
  modelsCount: number;
  mentionsCount: number;
  /** Fraction in [0, 1], or null when there's no usable rate (e.g.,
   *  zero successful calls). The card renders "-" instead of "0.0%"
   *  in that case so the empty state is honest. */
  mentionRate: number | null;
}

export default function DrillDownKpiCards({
  promptsCount, modelsCount, mentionsCount, mentionRate,
}: Props) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 12,
        marginBottom: 16,
      }}
    >
      <Card label="Prompts" value={promptsCount.toLocaleString()} />
      <Card label="Models" value={modelsCount.toLocaleString()} />
      <Card label="Mentions" value={mentionsCount.toLocaleString()} />
      <Card
        label="Mention rate"
        value={mentionRate == null ? '-' : `${(mentionRate * 100).toFixed(1)}%`}
        valueColor={mentionRate == null ? 'var(--muted)' : 'var(--green)'}
      />
    </div>
  );
}

function Card({
  label, value, valueColor,
}: { label: string; value: string; valueColor?: string }) {
  return (
    <div
      className="card"
      style={{
        padding: '14px 16px',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 11, fontWeight: 700, color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums',
          fontSize: 22, fontWeight: 700,
          color: valueColor ?? 'var(--text)',
          letterSpacing: -0.4, lineHeight: 1.1,
        }}
      >
        {value}
      </div>
    </div>
  );
}
