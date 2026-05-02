const platforms = ['ChatGPT', 'Perplexity', 'Claude', 'Gemini', 'Grok'];

export default function Logos() {
  return (
    <section className="hp-logos" aria-label="Supported AI platforms">
      <div className="hp-container">
        <div className="hp-logos-label">Track every major LLM platform</div>
        <div className="hp-logos-row">
          {platforms.map((p) => (
            <span key={p} className="hp-logo-pill">
              <span className="hp-logo-mark" aria-hidden="true" />
              {p}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
