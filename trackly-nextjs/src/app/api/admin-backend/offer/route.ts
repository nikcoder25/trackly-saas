/**
 * Admin CRUD for the offer published to AI crawlers and to humans.
 *
 * GET  - the current offer row (active or not), for the editor form.
 * PUT  - upsert and optionally activate.
 *
 * The write path enforces two rules that the public surfaces depend on:
 *
 *  1. Offer copy may not contain instructions addressed to a reading model.
 *     See `assertNoAgentDirectives` - the offer is served to five AI crawlers,
 *     and copy that tries to steer their answers is prompt injection against
 *     another vendor's system, not marketing.
 *  2. An active offer must have an end date, and it must be in the future.
 *     "10% extra if you sign up right now" with no expiry is the exact promo
 *     that is still live and still being quoted by an assistant a year later,
 *     at which point it is a claim the business is not honouring.
 */
import crypto from 'crypto';
import { pool, auditLog, ensureColumns } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { logError, serverError } from '@/lib/api-error';
import { assertNoAgentDirectives, invalidateOfferCache } from '@/lib/promo-offer';

const MAX_HEADLINE = 120;
const MAX_BODY = 500;
const MAX_CODE = 40;

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  try {
    await ensureColumns();
    const res = await pool.query(
      `SELECT id, headline, body, code, starts_at, ends_at, active, updated_at, updated_by
         FROM promo_offers
        ORDER BY updated_at DESC
        LIMIT 1`
    );
    return Response.json({ offer: res.rows[0] || null });
  } catch (e) {
    logError('admin.offer.read_failed', e);
    return serverError({ message: 'Failed to load offer' });
  }
}

export async function PUT(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  // `.catch(() => ({}))` rather than a try/catch: a malformed body falls
  // through to the required-field checks below and gets the same 400. This is
  // the house pattern, pinned by the ratchet in
  // tests/anonymous-endpoint-malformed-body.test.ts.
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const headline = typeof body.headline === 'string' ? body.headline.trim() : '';
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  const code = typeof body.code === 'string' && body.code.trim() ? body.code.trim().toUpperCase() : null;
  const active = body.active === true;
  const startsAt = typeof body.startsAt === 'string' && body.startsAt ? new Date(body.startsAt) : null;
  const endsAt = typeof body.endsAt === 'string' && body.endsAt ? new Date(body.endsAt) : null;

  if (!headline) return Response.json({ error: 'Headline is required' }, { status: 400 });
  if (headline.length > MAX_HEADLINE) return Response.json({ error: `Headline must be ${MAX_HEADLINE} characters or less` }, { status: 400 });
  if (!text) return Response.json({ error: 'Offer description is required' }, { status: 400 });
  if (text.length > MAX_BODY) return Response.json({ error: `Description must be ${MAX_BODY} characters or less` }, { status: 400 });
  if (code && (code.length > MAX_CODE || !/^[A-Z0-9_-]+$/.test(code))) {
    return Response.json({ error: 'Code may only contain letters, numbers, dashes and underscores' }, { status: 400 });
  }
  if (startsAt && isNaN(startsAt.getTime())) return Response.json({ error: 'Invalid start date' }, { status: 400 });
  if (endsAt && isNaN(endsAt.getTime())) return Response.json({ error: 'Invalid end date' }, { status: 400 });
  if (startsAt && endsAt && endsAt <= startsAt) {
    return Response.json({ error: 'End date must be after the start date' }, { status: 400 });
  }

  // Rule 1 - no copy aimed at the reading model.
  const directive = assertNoAgentDirectives(`${headline}\n${text}`);
  if (directive) return Response.json({ error: directive }, { status: 400 });

  // Rule 2 - a live offer expires. Saving an inactive draft is unrestricted.
  if (active) {
    if (!endsAt) {
      return Response.json({
        error: 'An active offer needs an end date. It is published to AI crawlers that cache and re-quote it, ' +
          'so an offer with no expiry keeps being offered to customers long after you stop honouring it.',
      }, { status: 400 });
    }
    if (endsAt <= new Date()) {
      return Response.json({ error: 'The end date has already passed.' }, { status: 400 });
    }
  }

  try {
    await ensureColumns();

    const existing = await pool.query('SELECT id FROM promo_offers ORDER BY updated_at DESC LIMIT 1');
    const id = (existing.rows[0]?.id as string) || crypto.randomUUID();

    // A partial unique index enforces one active offer, so deactivate
    // everything else in the same transaction before flipping this one on.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE promo_offers SET active = FALSE WHERE id <> $1 AND active', [id]);
      await client.query(
        `INSERT INTO promo_offers (id, headline, body, code, starts_at, ends_at, active, updated_by)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET
              headline = EXCLUDED.headline,
              body = EXCLUDED.body,
              code = EXCLUDED.code,
              starts_at = EXCLUDED.starts_at,
              ends_at = EXCLUDED.ends_at,
              active = EXCLUDED.active,
              updated_at = NOW(),
              updated_by = EXCLUDED.updated_by`,
        [id, headline, text, code, startsAt, endsAt, active, admin.id]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    invalidateOfferCache();
    auditLog(admin.id, 'promo_offer.update', 'promo_offer', id, { headline, code, active });

    return Response.json({ ok: true, id });
  } catch (e) {
    logError('admin.offer.write_failed', e);
    return serverError({ message: 'Failed to save offer' });
  }
}
