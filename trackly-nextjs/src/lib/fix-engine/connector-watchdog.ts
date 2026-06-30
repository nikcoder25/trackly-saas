/**
 * Fix Engine - Connector watchdog.
 *
 * Webhooks/pulls can't tell us when a Connector silently stops applying
 * fixes. This watchdog finds Channel-B fixes that shipped but were never
 * delivered after a grace window, records a one-time `connector.stuck`
 * event on each (with whether the connector looks offline), so the issue
 * surfaces in the fix history + can drive alerting. Idempotent: each fix
 * is flagged at most once.
 */

import { logger } from '@/lib/logger';
import { findStuckConnectorInstructions, hasFixEvent, logFixEvent } from './schema';
import { getConnection } from './connections';
import { connectorOnline } from './connector';

const DEFAULT_GRACE_MINUTES = 120; // ~24 missed 5-min polls

export async function runConnectorWatchdog(graceMinutes = DEFAULT_GRACE_MINUTES, limit = 50): Promise<{ stuck: number; flagged: number }> {
  const stuck = await findStuckConnectorInstructions(graceMinutes, limit);
  let flagged = 0;
  // Cache connector online-state per brand within a tick.
  const onlineByBrand = new Map<string, boolean>();

  for (const s of stuck) {
    try {
      if (await hasFixEvent(s.id, 'connector.stuck')) continue; // already flagged
      let online = onlineByBrand.get(s.brandId);
      if (online === undefined) {
        const conn = await getConnection(s.brandId, 'connector');
        online = connectorOnline(conn?.lastSeenAt ?? null);
        onlineByBrand.set(s.brandId, online);
      }
      const hoursStuck = Math.round((Date.now() - Date.parse(s.createdAt)) / 3_600_000);
      await logFixEvent(s.id, s.brandId, null, 'connector.stuck', { hoursStuck, connectorOnline: online });
      flagged++;
    } catch (e) {
      logger.warn('fix_engine.watchdog_flag_failed', { fixId: s.id, err: (e as Error).message });
    }
  }
  if (stuck.length) logger.info('fix_engine.connector_watchdog', { stuck: stuck.length, flagged });
  return { stuck: stuck.length, flagged };
}
