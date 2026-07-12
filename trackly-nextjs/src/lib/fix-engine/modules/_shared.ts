/**
 * Fix Engine - shared helpers for module ship steps.
 *
 * Channel A: resolve the brand's CMS connection and hand the module a
 * ready-to-use adapter + decrypted creds. Channel B: queue a Connector
 * instruction (the Connector plugin pulls these; see docs/FIX-ENGINE.md).
 */

import { getConnection } from '../connections';
import { getCmsAdapter, type CmsAdapter, type CmsCreds } from '../cms';
import { logFixEvent } from '../schema';
import type { FixContext, ShipResult } from '../types';

export interface ResolvedCms {
  adapter: CmsAdapter;
  creds: CmsCreds;
  siteUrl: string;
}

/**
 * Resolve the CMS adapter + creds for a brand, or return a ShipResult
 * describing why we can't ship (no connection / unsupported CMS). The
 * engine surfaces that to the UI as "connect your CMS to ship".
 */
export async function resolveCmsForBrand(
  ctx: FixContext,
): Promise<ResolvedCms | { error: ShipResult }> {
  const conn = await getConnection(ctx.brand.id, 'cms');
  if (!conn || conn.status !== 'active' || !conn.creds) {
    return {
      error: {
        ok: false,
        detail: { reason: 'no_cms_connection' },
        error: 'No active CMS connection for this brand. Connect a CMS to ship Channel-A fixes.',
      },
    };
  }
  const adapter = getCmsAdapter(conn.cmsType);
  if (!adapter) {
    return {
      error: {
        ok: false,
        detail: { reason: 'unsupported_cms', cmsType: conn.cmsType },
        error: `CMS type '${conn.cmsType}' is not supported yet.`,
      },
    };
  }
  return { adapter, creds: conn.creds as CmsCreds, siteUrl: conn.siteUrl || ctx.brand.website || '' };
}

/**
 * Channel B delivery: persist a Connector instruction the plugin will
 * pull and apply. Until the Connector is live this records the intent +
 * payload so the content is never lost; the UI can also offer it as a
 * manual download. The returned ShipResult is treated as "shipped".
 */
export async function queueConnectorInstruction(
  ctx: FixContext,
  fixId: string,
  instruction: { op: string; payload: Record<string, unknown> },
): Promise<ShipResult> {
  const conn = await getConnection(ctx.brand.id, 'connector');
  const delivery = conn && conn.status === 'active' ? 'connector_pull' : 'pending_connector';
  await logFixEvent(fixId, ctx.brand.id, ctx.tenantId, 'connector.instruction.queued', {
    op: instruction.op,
    delivery,
  });
  return {
    ok: true,
    detail: { channel: 'B', delivery, op: instruction.op },
    after: instruction.payload,
  };
}

export function clamp(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…';
}
