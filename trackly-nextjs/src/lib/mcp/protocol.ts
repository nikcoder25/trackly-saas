/**
 * Minimal Model Context Protocol server over Streamable HTTP (stateless).
 *
 * Each POST to /api/mcp carries one JSON-RPC message (or, for older clients,
 * a batch). Requests get a JSON response; notifications and client responses
 * get 202 with no body. No sessions and no server-to-client streaming are
 * needed: every tool here answers in a single round trip.
 *
 * Pure: the transport (route handler) passes in the tool registry and a
 * context, so this module unit-tests without Next or a database.
 */

export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

export const SERVER_INFO = { name: 'livesov', title: 'Livesov', version: '1.0.0' };

export const SERVER_INSTRUCTIONS =
  'Livesov tracks how often AI engines (ChatGPT, Claude, Gemini, Perplexity, Grok) name a brand when people ask buying questions. ' +
  'Start with list_brands, then pass a brand_id to the other tools (it can be left out when the account has one brand). ' +
  'Share of voice (SOV) is the percent of AI answers in the latest scan that named the brand. ' +
  'start_scan spends the account\'s scan credits, so only call it when the user asks for a fresh scan.';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface ToolResult {
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface ToolDef<Ctx> {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  handler: (args: Record<string, unknown>, ctx: Ctx) => Promise<ToolResult>;
}

/** A tool failure the model should see and recover from (bad brand id, plan limit). */
export class ToolError extends Error {}

export const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

function rpcError(id: JsonRpcRequest['id'], code: number, message: string) {
  return { jsonrpc: '2.0' as const, id: id ?? null, error: { code, message } };
}

function rpcResult(id: JsonRpcRequest['id'], result: unknown) {
  return { jsonrpc: '2.0' as const, id: id ?? null, result };
}

export function negotiateVersion(requested: unknown): string {
  return typeof requested === 'string' && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : LATEST_PROTOCOL_VERSION;
}

/** Tool text helper: a short human summary plus the same data as structured JSON. */
export function textResult(text: string, data?: Record<string, unknown>): ToolResult {
  return data ? { content: [{ type: 'text', text }], structuredContent: data } : { content: [{ type: 'text', text }] };
}

export function errorResult(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/**
 * Handles one JSON-RPC message. Returns the response object, or null when the
 * message needs no response (a notification or a client response).
 */
export async function handleMessage<Ctx>(
  msg: unknown,
  tools: ToolDef<Ctx>[],
  ctx: Ctx,
): Promise<Record<string, unknown> | null> {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return rpcError(null, RPC.INVALID_REQUEST, 'Invalid request');
  const m = msg as Partial<JsonRpcRequest> & { result?: unknown; error?: unknown };
  if (m.jsonrpc !== '2.0') return rpcError(m.id, RPC.INVALID_REQUEST, 'Invalid request: jsonrpc must be "2.0"');
  // A response from the client (we never send requests, but tolerate them).
  if (typeof m.method !== 'string') return 'result' in m || 'error' in m ? null : rpcError(m.id, RPC.INVALID_REQUEST, 'Invalid request');
  const isNotification = m.id === undefined;
  if (isNotification) return null;

  const params = (m.params && typeof m.params === 'object' ? m.params : {}) as Record<string, unknown>;
  switch (m.method) {
    case 'initialize':
      return rpcResult(m.id, {
        protocolVersion: negotiateVersion(params.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: SERVER_INSTRUCTIONS,
      });
    case 'ping':
      return rpcResult(m.id, {});
    case 'tools/list':
      return rpcResult(m.id, {
        tools: tools.map(t => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, ...(t.annotations ? { annotations: t.annotations } : {}) })),
      });
    case 'tools/call': {
      const name = params.name;
      const tool = tools.find(t => t.name === name);
      if (!tool) return rpcError(m.id, RPC.INVALID_PARAMS, `Unknown tool: ${String(name)}`);
      const args = params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments)
        ? (params.arguments as Record<string, unknown>) : {};
      try {
        return rpcResult(m.id, await tool.handler(args, ctx));
      } catch (e) {
        if (e instanceof ToolError) return rpcResult(m.id, errorResult(e.message));
        return rpcResult(m.id, errorResult('Something went wrong on the Livesov side. Try again in a moment.'));
      }
    }
    // Capabilities we do not offer: answer with empty lists so clients that
    // probe them do not log errors.
    case 'resources/list':
      return rpcResult(m.id, { resources: [] });
    case 'prompts/list':
      return rpcResult(m.id, { prompts: [] });
    default:
      return rpcError(m.id, RPC.METHOD_NOT_FOUND, `Method not found: ${m.method}`);
  }
}

/**
 * Handles a parsed POST body (a single message or a batch). Returns the JSON
 * to send back, or null for 202 Accepted.
 */
export async function handleBody<Ctx>(body: unknown, tools: ToolDef<Ctx>[], ctx: Ctx): Promise<unknown | null> {
  if (Array.isArray(body)) {
    if (body.length === 0) return rpcError(null, RPC.INVALID_REQUEST, 'Empty batch');
    const out = (await Promise.all(body.map(msg => handleMessage(msg, tools, ctx)))).filter(Boolean);
    return out.length ? out : null;
  }
  return handleMessage(body, tools, ctx);
}

export function parseError() {
  return rpcError(null, RPC.PARSE_ERROR, 'Parse error: body must be JSON');
}
