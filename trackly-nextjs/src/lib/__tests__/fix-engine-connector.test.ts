/**
 * Fix Engine - Connector (Channel B) tests: signing, path allow-list,
 * wire-instruction validation, and the robots-ai-access module.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FixContext } from '@/lib/fix-engine/types';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  signInstruction, isAllowedFilePath, toWireInstruction, sha256Hex,
  connectorOnline, CONNECTOR_MAX_ATTEMPTS, CONNECTOR_STALE_MS,
} from '@/lib/fix-engine/connector';

describe('connector health + retry policy', () => {
  it('treats a recent poll as online and a stale one as offline', () => {
    const now = Date.now();
    expect(connectorOnline(new Date(now - 60_000).toISOString(), now)).toBe(true);
    expect(connectorOnline(new Date(now - CONNECTOR_STALE_MS - 1000).toISOString(), now)).toBe(false);
    expect(connectorOnline(null, now)).toBe(false);
    expect(connectorOnline('not-a-date', now)).toBe(false);
  });
  it('has a sane retry cap', () => {
    expect(CONNECTOR_MAX_ATTEMPTS).toBeGreaterThanOrEqual(3);
  });
});

describe('connector signing + allow-list', () => {
  it('signature is stable and verifiable', () => {
    const sig = signInstruction('secret', 'id1', 'write_file', 'hello');
    const expected = signInstruction('secret', 'id1', 'write_file', 'hello');
    expect(sig).toBe(expected);
    expect(sig).toHaveLength(64); // hex sha256
  });

  it('allows only root-file allow-list paths', () => {
    expect(isAllowedFilePath('/llms.txt')).toBe(true);
    expect(isAllowedFilePath('/robots.txt')).toBe(true);
    expect(isAllowedFilePath('/.well-known/ai.txt')).toBe(true);
    expect(isAllowedFilePath('/wp-config.php')).toBe(false);
    expect(isAllowedFilePath('/../etc/passwd')).toBe(false);
    expect(isAllowedFilePath('llms.txt')).toBe(false);
    expect(isAllowedFilePath(42)).toBe(false);
  });

  it('rejects a write_file instruction to a disallowed path', () => {
    const row = { id: 'x', moduleKey: 'm', op: 'write_file', payload: { path: '/wp-config.php', content: 'x' }, createdAt: 'now' };
    expect(toWireInstruction(row, 'secret', 'now')).toBeNull();
  });

  it('signs a valid write_file instruction with content hash', () => {
    const row = { id: 'x', moduleKey: 'm', op: 'write_file', payload: { path: '/llms.txt', content: 'hi' }, createdAt: 'now' };
    const wire = toWireInstruction(row, 'secret', 'now')!;
    expect(wire.contentSha).toBe(sha256Hex('hi'));
    expect(wire.sig).toBe(signInstruction('secret', 'x', 'write_file', 'hi'));
  });
});

// ── robots-ai-access module ──
const fetchState = vi.hoisted(() => ({ status: 200, text: '' }));
vi.mock('@/lib/safe-fetch', () => ({
  safeFetch: vi.fn(async () => ({ status: fetchState.status, ok: fetchState.status === 200, text: async () => fetchState.text })),
  SSRFError: class extends Error {},
}));
vi.mock('@/lib/fix-engine/modules/_shared', () => ({
  queueConnectorInstruction: vi.fn(async (_ctx: unknown, _id: string, ins: { op: string; payload: any }) => ({ ok: true, detail: { channel: 'B', op: ins.op }, after: ins.payload })),
}));

import { robotsAiAccessModule } from '@/lib/fix-engine/modules/robots-ai-access';

const ctx = { brand: { id: 'b1', userId: 'u1', website: 'https://acme.test' }, tenantId: 'u1', userKeysLegacy: {} } as unknown as FixContext;

beforeEach(() => { fetchState.status = 200; fetchState.text = ''; vi.clearAllMocks(); });
afterEach(() => vi.clearAllMocks());

describe('robots-ai-access', () => {
  it('flags when AI crawlers are not explicitly allowed', async () => {
    fetchState.text = 'User-agent: *\nAllow: /';
    const issues = await robotsAiAccessModule.detect(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].summary).toMatch(/not explicitly allowed/);
  });

  it('flags a missing robots.txt', async () => {
    fetchState.status = 404; fetchState.text = '';
    const issues = await robotsAiAccessModule.detect(ctx);
    expect(issues[0].summary).toMatch(/No robots\.txt/);
  });

  it('passes when all AI agents are already allowed', async () => {
    fetchState.text = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-Web', 'PerplexityBot', 'Perplexity-User', 'Google-Extended']
      .map((a) => `User-agent: ${a}\nAllow: /`).join('\n');
    expect(await robotsAiAccessModule.detect(ctx)).toEqual([]);
  });

  it('generates directives deterministically (no credit) and ships via connector', async () => {
    const draft = await robotsAiAccessModule.generate();
    expect(draft.creditsUsed).toBe(0);
    expect(String(draft.generated.directives)).toContain('GPTBot');
    const issue = { key: 'https://acme.test', targetUrl: 'https://acme.test/robots.txt', severity: 'medium' as const, summary: '', detected: { origin: 'https://acme.test' } };
    const res = await robotsAiAccessModule.ship(issue, draft, ctx);
    expect(res.ok).toBe(true);
    expect((res.detail as any).op).toBe('patch_robots');
  });
});
