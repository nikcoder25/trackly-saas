/**
 * Shared Dodo Payments subscription cancel call.
 *
 * Used by /api/payments/cancel (user-initiated cancel) and by account
 * deletion (src/lib/delete-user.ts), so both paths speak to Dodo the same
 * way and agree on what counts as "already cancelled".
 */

// Dodo statuses that mean "already cancelled / not found at provider".
// They are idempotent end-states, not real errors: treat them as success.
export const ALREADY_CANCELLED_STATUSES = new Set([404, 409, 410]);

export type DodoCancelResult =
  | { ok: true; status: number; alreadyCancelled: boolean }
  | { ok: false; reason: 'not_configured' }
  | { ok: false; reason: 'network_error'; error: string }
  | { ok: false; reason: 'provider_error'; status: number; bodyPreview: string };

export function dodoBaseUrl(): string {
  const env = process.env.DODO_PAYMENTS_ENVIRONMENT || 'test_mode';
  return env === 'live_mode'
    ? 'https://live.dodopayments.com'
    : 'https://test.dodopayments.com';
}

/** PATCH /subscriptions/{id} with status='cancelled'. Never throws. */
export async function cancelDodoSubscription(subscriptionId: string): Promise<DodoCancelResult> {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  if (!apiKey) return { ok: false, reason: 'not_configured' };

  let resp: Response;
  try {
    resp = await fetch(`${dodoBaseUrl()}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
  } catch (e) {
    return { ok: false, reason: 'network_error', error: (e as Error).message };
  }

  if (resp.ok) return { ok: true, status: resp.status, alreadyCancelled: false };
  if (ALREADY_CANCELLED_STATUSES.has(resp.status)) {
    return { ok: true, status: resp.status, alreadyCancelled: true };
  }
  const text = await resp.text().catch(() => '');
  return { ok: false, reason: 'provider_error', status: resp.status, bodyPreview: text.slice(0, 200) };
}
