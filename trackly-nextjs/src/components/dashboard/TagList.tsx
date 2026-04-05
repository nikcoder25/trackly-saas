'use client';

export default function TagList({ items, onRemove }: { items: string[]; onRemove: (i: number) => void }) {
  if (!items.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 28 }}>
      {items.map((item, i) => (
        <span key={`${item}-${i}`} className="query-tag">
          {item}
          <button type="button" onClick={() => onRemove(i)}>&times;</button>
        </span>
      ))}
    </div>
  );
}
