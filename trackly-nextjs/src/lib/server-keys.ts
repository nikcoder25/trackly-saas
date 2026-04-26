/**
 * Read AI provider API keys from environment.
 *
 * Single source of truth so the Next.js request handler and the BullMQ
 * worker share one parsing implementation. Server-side keys are never
 * shipped through Redis job payloads - both the request handler and
 * worker re-read from env on demand.
 */

function parseKeys(envVar: string): string[] {
  const keys: string[] = [];
  const raw = (process.env[envVar] || '').trim();
  if (raw) raw.split(',').map(k => k.trim()).filter(Boolean).forEach(k => keys.push(k));
  for (let i = 1; i <= 10; i++) {
    const numbered = (process.env[envVar + '_' + i] || '').trim();
    if (numbered) numbered.split(',').map(k => k.trim()).filter(Boolean).forEach(k => keys.push(k));
  }
  return [...new Set(keys)];
}

// Merge keys from multiple env-var names. Order is preserved; duplicates
// are de-deduplicated. Used for providers with more than one accepted
// secret name (e.g. xAI is named both GROK_API_KEY and XAI_API_KEY in
// the wild; accepting both removes a silent-drop footgun where a brand
// has Grok enabled but the operator named the DO secret XAI_API_KEY and
// the platform was filtered out before any task ran).
function parseKeysMulti(...envVars: string[]): string[] {
  const all: string[] = [];
  for (const v of envVars) all.push(...parseKeys(v));
  return [...new Set(all)];
}

export function getServerKeys(): Record<string, string[]> {
  return {
    openai: parseKeys('OPENAI_API_KEY'),
    perplexity: parseKeys('PERPLEXITY_API_KEY'),
    gemini: parseKeys('GEMINI_API_KEY'),
    claude: parseKeys('CLAUDE_API_KEY'),
    grok: parseKeysMulti('GROK_API_KEY', 'XAI_API_KEY'),
  };
}
