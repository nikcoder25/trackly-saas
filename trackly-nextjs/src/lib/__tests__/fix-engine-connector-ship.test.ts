/**
 * Fix Engine - Channel B delivery honesty.
 *
 * Channel B fixes (robots.txt, llms.txt, head blocks) are written by the
 * Connector plugin running on the customer's own site. The "queue" is the
 * fixes row itself: listPendingConnectorInstructions selects channel-B rows
 * at status 'shipped' with connector_delivered_at NULL.
 *
 * So 'shipped' has only ever meant QUEUED here. With no Connector paired it
 * did not even mean that - the row was queued for a puller that does not
 * exist, the card showed a green SHIPPED, and the site was never touched.
 * A user checking robots.txt found the old file and had no way to tell why.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const conn = vi.hoisted(() => ({ connector: null as null | { status: string } }));

vi.mock('@/lib/fix-engine/connections', () => ({
  getConnection: vi.fn(async (_brandId: string, provider: string) =>
    (provider === 'connector' ? conn.connector : null)),
}));
vi.mock('@/lib/fix-engine/cms', () => ({ getCmsAdapter: () => null }));
vi.mock('@/lib/fix-engine/schema', () => ({ logFixEvent: vi.fn(async () => {}) }));

import { queueConnectorInstruction } from '@/lib/fix-engine/modules/_shared';
import type { FixContext } from '@/lib/fix-engine/types';

const ctx = {
  brand: { id: 'b1', userId: 'u1', name: 'Acme', website: 'https://acme.test' },
  tenantId: 'u1', userKeysLegacy: {},
} as unknown as FixContext;

const instruction = { op: 'patch_robots', payload: { content: 'User-agent: GPTBot\nAllow: /' } };

beforeEach(() => { conn.connector = null; vi.clearAllMocks(); });

describe('queueConnectorInstruction', () => {
  it('fails the ship when no Connector is paired, instead of claiming success', async () => {
    // The exact reported bug: robots.txt read SHIPPED while the live file
    // still had none of the directives.
    const r = await queueConnectorInstruction(ctx, 'fix1', instruction);
    expect(r.ok).toBe(false);
    expect(r.detail.delivery).toBe('no_connector');
  });

  it('tells the user both ways out, since neither is guessable', async () => {
    const r = await queueConnectorInstruction(ctx, 'fix1', instruction);
    expect(r.error).toMatch(/Connect Site|install/i);   // pair the plugin
    expect(r.error).toMatch(/Download file/i);           // or do it by hand
    expect(r.error).toMatch(/Re-check/i);                // and how it resolves
  });

  it('still returns the payload when it fails, so Download file keeps working', async () => {
    // A failed ship must not strand the generated content: the file route
    // is the only way a brand without the plugin can ever publish this.
    const r = await queueConnectorInstruction(ctx, 'fix1', instruction);
    expect(r.after).toEqual(instruction.payload);
  });

  it('does not treat an inactive Connector as a live one', async () => {
    conn.connector = { status: 'revoked' };
    const r = await queueConnectorInstruction(ctx, 'fix1', instruction);
    expect(r.ok).toBe(false);
  });

  it('queues for real when the Connector is active', async () => {
    conn.connector = { status: 'active' };
    const r = await queueConnectorInstruction(ctx, 'fix1', instruction);
    expect(r.ok).toBe(true);
    expect(r.detail.delivery).toBe('connector_pull');
    expect(r.after).toEqual(instruction.payload);
  });
});
