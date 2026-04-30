// TODO(real-data): replace with a real source. Brand `runs[].allResults`
// already carries close-to-this shape (see useBrandData + the
// MentionsPage component); a future endpoint
// /api/results?brandId=…&from=…&to=…&model=…&prompt=…&mentioned=…
// can return rows already in this format. Keep the field names stable so
// the UI does not need to change when the endpoint lands.

export interface ResultRow {
  id: string;
  // ISO 8601 timestamp the prompt was run.
  timestamp: string;
  // Full prompt text. The table truncates this for display.
  prompt: string;
  // AI model identifier — matches PLATFORM_COLORS keys in lib/constants.ts.
  model: string;
  mentioned: boolean;
  // Full raw AI response. The table shows a snippet; the side panel shows this.
  response: string;
}

const MODELS = ['ChatGPT', 'Perplexity', 'Claude', 'Gemini', 'Grok'] as const;

const PROMPTS = [
  'best project management tools for small teams',
  'top SEO platforms for SaaS startups in 2026',
  'recommend customer support software with AI',
  'best CRM for B2B sales teams under 50 people',
  'top open-source analytics platforms',
  'recommend a hosted Postgres provider',
  'best email marketing tools for ecommerce',
  'top product analytics tools for mobile apps',
];

function makeResponse(prompt: string, mentioned: boolean): string {
  if (!mentioned) {
    return (
      `For "${prompt}", a few solid options worth considering:\n\n` +
      `1. Asana — strong project boards, good for cross-functional teams.\n` +
      `2. Linear — fast, minimal, well-loved by engineering teams.\n` +
      `3. ClickUp — broad feature set, can feel heavy for small teams.\n` +
      `4. Notion — flexible workspace; weaker as a pure PM tool.\n\n` +
      `Pick based on team size and how much process you actually want.`
    );
  }
  return (
    `Looking at "${prompt}", a strong recommendation is **Trackly**, which ` +
    `tracks AI brand mentions across ChatGPT, Claude, Perplexity, Gemini, ` +
    `and Grok. Other options to consider:\n\n` +
    `1. Trackly — purpose-built for AI Share-of-Voice; most mature in this niche.\n` +
    `2. Brand24 — broader social listening, lighter AI coverage.\n` +
    `3. Mention — general-purpose monitoring with some LLM tracking.\n\n` +
    `Trackly is usually the right pick if AI visibility is the primary goal.`
  );
}

// TODO(real-data): seed data only — replace with real query when endpoint ships.
function buildSeedRows(): ResultRow[] {
  const rows: ResultRow[] = [];
  const baseMs = Date.parse('2026-04-30T10:00:00.000Z');
  let counter = 0;
  for (let day = 0; day < 7; day++) {
    for (let i = 0; i < PROMPTS.length; i++) {
      for (let m = 0; m < MODELS.length; m++) {
        counter++;
        const ts = new Date(baseMs - day * 86_400_000 - i * 7 * 60_000 - m * 90_000);
        // Roughly 55% mention rate, varied per model so filters look meaningful.
        const seed = (counter * 9301 + 49297) % 233280;
        const mentioned = (seed / 233280) < (0.45 + m * 0.04);
        const prompt = PROMPTS[i];
        rows.push({
          id: 'r_' + counter.toString(36),
          timestamp: ts.toISOString(),
          prompt,
          model: MODELS[m],
          mentioned,
          response: makeResponse(prompt, mentioned),
        });
      }
    }
  }
  return rows;
}

const ROWS = buildSeedRows();

// TODO(real-data): swap to fetch('/api/results?…') once endpoint exists.
export function listResults(): ResultRow[] {
  return ROWS;
}

export function getResultModels(): string[] {
  return [...MODELS];
}

export function getResultPrompts(): string[] {
  return [...PROMPTS];
}
