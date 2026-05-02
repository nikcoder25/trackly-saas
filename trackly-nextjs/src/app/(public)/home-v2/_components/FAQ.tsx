'use client';

import { useState } from 'react';

const faqs = [
  {
    q: 'What is generative engine optimization?',
    a: 'Generative engine optimization (GEO) is the practice of getting your brand cited and recommended inside AI assistant answers — ChatGPT, Perplexity, Claude, Gemini, and Grok. It is to LLMs what SEO is to Google.',
  },
  {
    q: 'How do I track my brand in ChatGPT?',
    a: 'Add your brand and the buyer prompts you care about. Livesov runs them daily inside ChatGPT (and the other LLMs) and shows you when, how, and what is said about your brand.',
  },
  {
    q: 'How is Livesov different from Profound, Peec AI, and Otterly?',
    a: 'Livesov tracks all six major AI platforms, includes GEO content audits, and starts free. Profound is enterprise-priced, Peec covers fewer platforms, and Otterly does not include sentiment or audits.',
  },
  {
    q: 'Do you support Claude and Gemini?',
    a: 'Yes — and Grok. We track ChatGPT, Perplexity, Claude, Gemini, Grok, and one more, on every paid plan above Starter.',
  },
  {
    q: 'How much does Livesov cost?',
    a: 'Free plan available. Starter is $9/mo, Pro is $29/mo, Agency is $89/mo. All plans include a free trial — no credit card required.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel from your dashboard with one click. We do not charge for unused months.',
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="hp-section" id="faq" aria-labelledby="hp-faq-title">
      <div className="hp-container">
        <span className="hp-eyebrow">FAQ</span>
        <h2 id="hp-faq-title" className="hp-section-title">
          Questions about AI visibility tracking.
        </h2>

        <div className="hp-faq" role="list">
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q} className="hp-faq-item" role="listitem">
                <button
                  type="button"
                  className="hp-faq-q"
                  aria-expanded={isOpen}
                  aria-controls={`hp-faq-${i}`}
                  onClick={() => setOpen(isOpen ? null : i)}
                >
                  <span>{f.q}</span>
                  <span className="hp-faq-toggle" aria-hidden="true">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && (
                  <div id={`hp-faq-${i}`} className="hp-faq-a">
                    {f.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
