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
 * Channel B delivery: queue an instruction for the Connector plugin to pull
 * and apply.
 *
 * The queue IS the fixes row - listPendingConnectorInstructions selects
 * channel-B rows at status 'shipped' with connector_delivered_at NULL - so
 * "shipped" here has only ever meant QUEUED, never applied.
 *
 * That distinction used to be invisible, and with no Connector paired it was
 * a straight falsehood. This returned ok:true unconditionally, so a brand
 * with no plugin got a fix marked SHIPPED, a green tick, and a row queued
 * for a puller that does not exist. The change never reached the site and
 * nothing ever said so - the file-download route right next door documents
 * that such a brand has to upload the file by hand, which the user had no
 * reason to do while the card claimed the job was done.
 *
 * So a missing Connector is now a failed ship with an actionable reason.
 * The payload still comes back on the result, and `generated` is untouched,
 * so the Download-file fallback keeps working from the ATTENTION state.
 */
export async function queueConnectorInstruction(
  ctx: FixContext,
  fixId: string,
  instruction: { op: string; payload: Record<string, unknown> },
): Promise<ShipResult> {
  const conn = await getConnection(ctx.brand.id, 'connector');
  const connectorLive = !!conn && conn.status === 'active';

  await logFixEvent(fixId, ctx.brand.id, ctx.tenantId, 'connector.instruction.queued', {
    op: instruction.op,
    delivery: connectorLive ? 'connector_pull' : 'no_connector',
  });

  if (!connectorLive) {
    return {
      ok: false,
      detail: { channel: 'B', delivery: 'no_connector', op: instruction.op },
      after: instruction.payload,
      error: 'This change needs the Livesov Connector plugin to write to your site, and your site has not paired one. '
        + 'Either install it from Connect Site and ship again, or use Download file, upload it to your site, and hit Re-check - '
        + 'the live page is what resolves this fix.',
    };
  }

  return {
    ok: true,
    detail: { channel: 'B', delivery: 'connector_pull', op: instruction.op },
    after: instruction.payload,
  };
}

export function clamp(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…';
}
