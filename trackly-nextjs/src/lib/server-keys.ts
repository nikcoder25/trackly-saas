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

export function getServerKeys(): Record<string, string[]> {
  return {
    openai: parseKeys('OPENAI_API_KEY'),
    perplexity: parseKeys('PERPLEXITY_API_KEY'),
    gemini: parseKeys('GEMINI_API_KEY'),
    claude: parseKeys('CLAUDE_API_KEY'),
    grok: parseKeys('GROK_API_KEY'),
  };
}
