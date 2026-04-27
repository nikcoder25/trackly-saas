/**
 * Provider request specs - shared between boot-time probes (env keys) and
 * the per-tenant key validator (`key-validator.ts`). One spec per upstream
 * provider so the URL/header/auth quirks live in exactly one place.
 *
 * The boot probes in `ai-platforms.ts` originally inlined this list; it
 * moved here so the per-tenant validator added in #409 can run the same
 * cheap GET against the provider's `/models` endpoint without copy-pasting
 * the headers (Anthropic's `x-api-key` + `anthropic-version`, Gemini's
 * query-string auth, etc).
 */

export type PlatformId = 'ChatGPT' | 'Claude' | 'Gemini' | 'Grok' | 'Perplexity';

export interface ProviderSpec {
  /** Canonical platform name as used by `ai-platforms.queryAI`. */
  platform: PlatformId;
  /** Lowercase tag used in log prefixes (`[chatgpt.boot]`). */
  logTag: string;
  /** Env-var name pattern matching every accepted key for this provider. */
  envPattern: RegExp;
  /** Opt-out env var for the boot probe (set to `false` to disable). */
  disableEnv: string;
  /**
   * Logical key in `getServerKeys()` / per-tenant key map.
   * Mirrors the `PLATFORM_KEY_MAP` used by `brands/[id]/run`.
   */
  keyName: 'openai' | 'claude' | 'gemini' | 'grok' | 'perplexity';
  /** Validation URL — should be cheap (≤1 round-trip, no large body). */
  buildUrl: (key: string) => string;
  /** Headers required for auth. Auth-via-querystring providers return {}. */
  buildHeaders: (key: string) => Record<string, string>;
}

export const PROVIDER_SPECS: ProviderSpec[] = [
  {
    platform: 'ChatGPT',
    logTag: 'chatgpt',
    envPattern: /^OPENAI_API_KEY(_\d+)?$/,
    disableEnv: 'AI_CHATGPT_BOOT_PROBE',
    keyName: 'openai',
    buildUrl: () => 'https://api.openai.com/v1/models',
    buildHeaders: k => ({ Authorization: `Bearer ${k}` }),
  },
  {
    platform: 'Claude',
    logTag: 'claude',
    envPattern: /^CLAUDE_API_KEY(_\d+)?$/,
    disableEnv: 'AI_CLAUDE_BOOT_PROBE',
    keyName: 'claude',
    buildUrl: () => 'https://api.anthropic.com/v1/models',
    buildHeaders: k => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01' }),
  },
  {
    platform: 'Perplexity',
    logTag: 'perplexity',
    // Perplexity has no public /models listing; a HEAD on chat/completions
    // returns 405 cheaply and still proves the route + TLS handshake.
    envPattern: /^PERPLEXITY_API_KEY(_\d+)?$/,
    disableEnv: 'AI_PERPLEXITY_BOOT_PROBE',
    keyName: 'perplexity',
    buildUrl: () => 'https://api.perplexity.ai/chat/completions',
    buildHeaders: k => ({ Authorization: `Bearer ${k}` }),
  },
  {
    platform: 'Grok',
    logTag: 'grok',
    envPattern: /^(GROK_API_KEY|XAI_API_KEY)(_\d+)?$/,
    disableEnv: 'AI_GROK_BOOT_PROBE',
    keyName: 'grok',
    buildUrl: () => 'https://api.x.ai/v1/models',
    buildHeaders: k => ({ Authorization: `Bearer ${k}` }),
  },
  {
    platform: 'Gemini',
    logTag: 'gemini',
    envPattern: /^GEMINI_API_KEY(_\d+)?$/,
    disableEnv: 'AI_GEMINI_BOOT_PROBE',
    keyName: 'gemini',
    // Gemini auth is via query string, not header.
    buildUrl: k => `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(k)}`,
    buildHeaders: () => ({}),
  },
];

export function getProviderSpec(platform: string): ProviderSpec | undefined {
  return PROVIDER_SPECS.find(s => s.platform === platform);
}

export function getProviderSpecByKeyName(keyName: string): ProviderSpec | undefined {
  return PROVIDER_SPECS.find(s => s.keyName === keyName);
}

/** Names the per-tenant table understands (`openai`, `claude`, ...). */
export const TENANT_KEY_NAMES = PROVIDER_SPECS.map(s => s.keyName);
