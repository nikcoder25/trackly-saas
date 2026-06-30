/**
 * Fix Engine - outbound notifications.
 *
 * Posts a message to the brand's configured webhook (brands.data.webhookUrl
 * — the same HTTPS, SSRF-validated field Settings already exposes). The
 * payload is Slack-incoming-webhook compatible ({ text }), which also works
 * with Zapier/Make catch-hooks → Slack/Linear/Jira/etc.
 */

import { pool } from '@/lib/db';
import { safeFetch } from '@/lib/safe-fetch';

export type NotifyResult = { ok: true } | { ok: false; reason: 'no_webhook' | 'send_failed'; detail?: string };

export async function sendBrandWebhook(brandId: string, text: string): Promise<NotifyResult> {
  let webhookUrl: string | undefined;
  try {
    const res = await pool.query(`SELECT data FROM brands WHERE id = $1 LIMIT 1`, [brandId]);
    webhookUrl = (res.rows[0]?.data as { webhookUrl?: string } | undefined)?.webhookUrl;
  } catch {
    return { ok: false, reason: 'send_failed', detail: 'brand lookup failed' };
  }
  if (!webhookUrl) return { ok: false, reason: 'no_webhook' };
  try {
    const res = await safeFetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      timeoutMs: 8000,
    });
    return res.ok ? { ok: true } : { ok: false, reason: 'send_failed', detail: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, reason: 'send_failed', detail: (e as Error).message };
  }
}
