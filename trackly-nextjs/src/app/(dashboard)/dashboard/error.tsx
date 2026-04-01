'use client';

export default function DashboardError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>Something went wrong</h2>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>{error.message || 'An unexpected error occurred.'}</p>
      <button
        onClick={reset}
        style={{ padding: '0.5rem 1.5rem', background: '#FF6154', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}
      >
        Try Again
      </button>
    </div>
  );
}
