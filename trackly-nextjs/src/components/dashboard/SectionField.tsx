'use client';

export default function SectionField({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string }) {
  return (
    <div className="form-group">
      <label className="flbl">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="finp" placeholder={placeholder} />
    </div>
  );
}
