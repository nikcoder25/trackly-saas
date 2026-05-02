const rows = [
  { feature: 'AI brand tracking',     trackly: '6 platforms', profound: '4 platforms', peec: '3 platforms', otterly: '3 platforms' },
  { feature: 'Free plan',              trackly: 'check', profound: 'cross', peec: 'cross', otterly: 'cross' },
  { feature: 'Starting price',         trackly: '$9/mo', profound: '$499/mo', peec: '$89/mo', otterly: '$59/mo' },
  { feature: 'Sentiment analysis',     trackly: 'check', profound: 'check', peec: 'check', otterly: 'cross' },
  { feature: 'Citation tracking',      trackly: 'check', profound: 'check', peec: 'cross', otterly: 'cross' },
  { feature: 'GEO content audits',     trackly: 'check', profound: 'cross', peec: 'cross', otterly: 'cross' },
  { feature: 'CSV / API export',       trackly: 'check', profound: 'check', peec: 'check', otterly: 'cross' },
];

function Cell({ value }: { value: string }) {
  if (value === 'check') return <span className="hp-check" aria-label="included">✓</span>;
  if (value === 'cross') return <span className="hp-cross" aria-label="not included">—</span>;
  return <>{value}</>;
}

export default function Comparison() {
  return (
    <section className="hp-section" aria-labelledby="hp-compare-title">
      <div className="hp-container">
        <span className="hp-eyebrow">Compare</span>
        <h2 id="hp-compare-title" className="hp-section-title">
          A real Profound, Peec AI, and Otterly alternative.
        </h2>
        <p className="hp-section-sub">
          Same insights. Less price. Built for teams that don’t need a six-figure
          enterprise contract to start tracking AI visibility.
        </p>

        <div className="hp-compare">
          <table>
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col" className="hp-compare-us">Livesov</th>
                <th scope="col">Profound</th>
                <th scope="col">Peec AI</th>
                <th scope="col">Otterly</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.feature}>
                  <th scope="row" style={{ background: 'transparent', fontWeight: 500, color: 'var(--hp-text-2)' }}>{r.feature}</th>
                  <td className="hp-compare-us"><Cell value={r.trackly} /></td>
                  <td><Cell value={r.profound} /></td>
                  <td><Cell value={r.peec} /></td>
                  <td><Cell value={r.otterly} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
