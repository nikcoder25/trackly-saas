'use client';

const ICONS: Record<string, string> = {
  chart: '📊', search: '🔍', data: '📈', alert: '🔔', shield: '🛡️',
  globe: '🌍', star: '⭐', query: '💬', brand: '🏷️', default: '📋',
};

interface EmptyStateProps {
  icon?: string;
  title: string;
  message: string;
  action?: { label: string; onClick: () => void };
}

export default function EmptyState({ icon = 'default', title, message, action }: EmptyStateProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', minHeight: 200 }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 14 }}>
        {ICONS[icon] || ICONS.default}
      </div>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6, textAlign: 'center' }}>{title}</h3>
      <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', maxWidth: 360, lineHeight: 1.5, margin: 0 }}>{message}</p>
      {action && (
        <button onClick={action.onClick} style={{
          marginTop: 16, padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer',
          transition: 'opacity .15s',
        }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
          {action.label}
        </button>
      )}
    </div>
  );
}
