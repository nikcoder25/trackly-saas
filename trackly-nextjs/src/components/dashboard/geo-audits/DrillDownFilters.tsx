'use client';

export type ModelFilter = 'all' | 'ChatGPT' | 'Perplexity' | 'Gemini' | 'Claude' | 'Grok';
export type StateFilter = 'all' | 'mentioned' | 'not_mentioned';

const MODEL_OPTIONS: { value: ModelFilter; label: string }[] = [
  { value: 'all',         label: 'All models' },
  { value: 'ChatGPT',     label: 'ChatGPT' },
  { value: 'Perplexity',  label: 'Perplexity' },
  { value: 'Gemini',      label: 'Gemini' },
  { value: 'Claude',      label: 'Claude' },
  { value: 'Grok',        label: 'Grok' },
];

const STATE_OPTIONS: { value: StateFilter; label: string }[] = [
  { value: 'all',           label: 'All prompts' },
  { value: 'mentioned',     label: 'Mentioned' },
  { value: 'not_mentioned', label: 'Not mentioned' },
];

interface Props {
  model: ModelFilter;
  onModelChange: (next: ModelFilter) => void;
  stateFilter: StateFilter;
  onStateChange: (next: StateFilter) => void;
}

export default function DrillDownFilters({
  model, onModelChange, stateFilter, onStateChange,
}: Props) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        marginBottom: 14,
      }}
    >
      <PillRow
        ariaLabel="Filter by model"
        options={MODEL_OPTIONS}
        active={model}
        onChange={(v) => onModelChange(v as ModelFilter)}
      />
      <PillRow
        ariaLabel="Filter by mention state"
        options={STATE_OPTIONS}
        active={stateFilter}
        onChange={(v) => onStateChange(v as StateFilter)}
      />
    </div>
  );
}

function PillRow({
  ariaLabel, options, active, onChange,
}: {
  ariaLabel: string;
  options: { value: string; label: string }[];
  active: string;
  onChange: (next: string) => void;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => {
        const isActive = active === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(o.value)}
            style={{
              padding: '5px 11px',
              fontSize: 12, fontWeight: 600,
              fontFamily: 'var(--font)',
              background: isActive ? 'var(--primary)' : 'var(--bg)',
              color: isActive ? '#fff' : 'var(--text)',
              border: '1px solid',
              borderColor: isActive ? 'var(--primary)' : 'var(--border)',
              borderRadius: 'var(--radius-full)',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
