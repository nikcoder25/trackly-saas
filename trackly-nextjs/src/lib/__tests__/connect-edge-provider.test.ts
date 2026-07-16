/**
 * Edge Pro — provider selection + mock determinism.
 *
 * The real Cloudflare provider is selected ONLY when all four env creds are
 * present; otherwise the deterministic mock is used. `edgeProAvailable` gates
 * whether the flow is offered at all.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getEdgeProvider, edgeCredsConfigured, edgeProAvailable,
  MockCloudflareEdgeProvider, LiveCloudflareEdgeProvider,
} from '@/lib/connect/edge-provider';

const KEYS = ['CF_API_TOKEN', 'CF_ACCOUNT_ID', 'CF_ZONE_ID', 'CF_DISPATCH_NAMESPACE', 'EDGE_PRO_PREVIEW'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => { for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

function setLiveCreds() {
  process.env.CF_API_TOKEN = 'tok';
  process.env.CF_ACCOUNT_ID = 'acc';
  process.env.CF_ZONE_ID = 'zone';
  process.env.CF_DISPATCH_NAMESPACE = 'ns';
}

describe('provider selection', () => {
  it('uses the mock provider when no creds are configured', () => {
    const { provider, mode } = getEdgeProvider();
    expect(mode).toBe('mock');
    expect(provider).toBeInstanceOf(MockCloudflareEdgeProvider);
    expect(edgeCredsConfigured()).toBe(false);
  });

  it('uses the live provider only when ALL four creds are present', () => {
    setLiveCreds();
    const { provider, mode } = getEdgeProvider();
    expect(mode).toBe('live');
    expect(provider).toBeInstanceOf(LiveCloudflareEdgeProvider);
    expect(edgeCredsConfigured()).toBe(true);
  });

  it('falls back to mock when creds are only partially set (all-or-nothing)', () => {
    process.env.CF_API_TOKEN = 'tok';
    process.env.CF_ACCOUNT_ID = 'acc';
    process.env.CF_ZONE_ID = 'zone';
    // CF_DISPATCH_NAMESPACE missing
    expect(edgeCredsConfigured()).toBe(false);
    expect(getEdgeProvider().mode).toBe('mock');
  });
});

describe('edgeProAvailable', () => {
  it('is false with no creds and no preview flag', () => {
    expect(edgeProAvailable()).toBe(false);
  });
  it('is true when the preview flag is set (mock provider still)', () => {
    process.env.EDGE_PRO_PREVIEW = '1';
    expect(edgeProAvailable()).toBe(true);
    expect(getEdgeProvider().mode).toBe('mock');
  });
  it('is true when live creds are configured', () => {
    setLiveCreds();
    expect(edgeProAvailable()).toBe(true);
  });
});

describe('MockCloudflareEdgeProvider (deterministic)', () => {
  const mock = new MockCloudflareEdgeProvider();

  it('mints a stable custom hostname id + cname target + dcv record', async () => {
    const a = await mock.createCustomHostname('www.acme.test');
    const b = await mock.createCustomHostname('www.acme.test');
    expect(a).toEqual(b); // deterministic
    expect(a.id).toBe('mock-ch-www-acme-test');
    expect(a.cnameTarget).toBe('edge.livesov.com');
    expect(a.dcvRecord).toEqual({ name: '_cf-custom-hostname.www.acme.test', type: 'TXT', value: 'mock-dcv-www-acme-test' });
  });

  it('dispatch/delete operations succeed without touching real infra', async () => {
    expect(await mock.dispatchWorker('s', 'script')).toEqual({ ok: true });
    expect(await mock.deleteWorker('s')).toEqual({ ok: true });
    expect(await mock.deleteCustomHostname('id')).toEqual({ ok: true });
  });
});
