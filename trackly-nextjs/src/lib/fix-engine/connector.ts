/**
 * Fix Engine - Connector (Channel B) protocol helpers.
 *
 * The Connector plugin runs on the customer's site, PULLS pending
 * instructions, applies them, and ACKs. Security model (see
 * docs/FIX-ENGINE.md):
 *   - Bearer token, hashed at rest, per-brand, revocable.
 *   - Each instruction is HMAC-signed (per-connection secret) over
 *     id|op|sha256(content) so a relay can't tamper with payloads.
 *   - write_file is restricted to a small root-file allow-list (no
 *     traversal).
 */

import crypto from 'crypto';
import type { ConnectorInstructionRow } from './schema';

export const CONNECTOR_OPS = ['write_file', 'set_header_block', 'patch_robots'] as const;
export type ConnectorOp = typeof CONNECTOR_OPS[number];

/** Re-deliver a failing instruction up to this many times before failing it. */
export const CONNECTOR_MAX_ATTEMPTS = 5;
/** A connector that hasn't polled within this window is considered offline. */
export const CONNECTOR_STALE_MS = 12 * 60_000;

/** True when the connector last polled recently enough to be "online". */
export function connectorOnline(lastSeenAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastSeenAt) return false;
  const t = Date.parse(lastSeenAt);
  return Number.isFinite(t) && now - t <= CONNECTOR_STALE_MS;
}

export function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/** Sign an instruction so the plugin can verify it wasn't tampered with. */
export function signInstruction(secret: string, id: string, op: string, content: string): string {
  return crypto.createHmac('sha256', secret).update(`${id}|${op}|${sha256Hex(content)}`).digest('hex');
}

/**
 * Root-relative file paths the Connector is allowed to write. Anything
 * else (or any traversal/absolute path) is rejected server-side before
 * the instruction is ever handed out.
 */
export function isAllowedFilePath(path: unknown): path is string {
  if (typeof path !== 'string') return false;
  if (!path.startsWith('/')) return false;
  if (path.includes('..') || path.includes('\\') || path.includes('\0')) return false;
  if (path === '/llms.txt' || path === '/robots.txt') return true;
  if (/^\/\.well-known\/[A-Za-z0-9._-]+$/.test(path)) return true;
  return false;
}

export interface WireInstruction {
  id: string;
  op: string;
  payload: Record<string, unknown>;
  contentSha: string;
  sig: string;
  issuedAt: string;
}

/**
 * Convert a queued instruction row into the signed wire object the plugin
 * receives. Returns null if the payload fails validation (e.g. a
 * write_file to a disallowed path) so a bad instruction is never served.
 */
export function toWireInstruction(
  row: ConnectorInstructionRow,
  secret: string | null,
  issuedAt: string,
): WireInstruction | null {
  const content = typeof row.payload.content === 'string' ? row.payload.content : JSON.stringify(row.payload);
  if (row.op === 'write_file' && !isAllowedFilePath(row.payload.path)) return null;
  if (row.op === 'patch_robots' && typeof row.payload.content !== 'string') return null;
  const contentSha = sha256Hex(content);
  const sig = secret ? signInstruction(secret, row.id, row.op, content) : '';
  return { id: row.id, op: row.op, payload: row.payload, contentSha, sig, issuedAt };
}
