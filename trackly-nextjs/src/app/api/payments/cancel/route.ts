import { auditLog, safeConnect } from '@/lib/db';
import { verifyRequestAuthLive } from '@/lib/auth';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { logError, serverError } from '@/lib/api-error';
import { logger } from '@/lib/logger';
import {
  planCancellationIdempotencyKey,
  sendPlanCancellationEmail,
  tryEnqueueRecoveredCancellationEmail,
} from '@/lib/email';
import { recordBillingEvent } from '@/lib/billing-events';
import { cancelDodoSubscription } from '@/lib/dodo-subscriptions';

// The Dodo PATCH lives in src/lib/dodo-subscriptions.ts. It treats
// 404/409/410 as cancellation-success: they're idempotent end-states, not
// real errors, and refusing to downgrade the user locally over them would
// strand them on a paid plan they cannot escape from.

export async function POST(request: Request) {
  const user = await verifyRequestAuthLive(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });

  const rl = await checkUserIpRateLimit('payments_cancel', user.id, getClientIp(request), {
    user: { max: 5, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  // Single SERIALIZABLE transaction wrapping both the Dodo PATCH and the
  // local DB update. Pre-fix, the route did `PATCH Dodo` then a separate
  // autocommit `UPDATE users` - if the UPDATE threw (pg blip, serialization
  // conflict, conn drop) Dodo had already cancelled but our DB still showed
  // the paid plan, and the user kept the premium UI without billing until
  // the webhook or 15-minute reconcile cron healed it.
  //
  // Order is: BEGIN -> SELECT FOR UPDATE -> PATCH Dodo -> UPDATE -> COMMIT.
  // The row lock serialises a concurrent double-click cancel; on the second
  // click the user is already on `free` and we return 200 idempotently
  // (with alreadyCancelled: true) after a best-effort recovery enqueue of
  // the confirmation email - without touching Dodo a second time.
  const client = await safeConnect();
  let postCommit: { email: string | null; previousPlan: string; previousSubscriptionId: string | null } | null = null;

  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    const result = await client.query(
      'SELECT email, plan, settings FROM users WHERE id = $1 FOR UPDATE',
      [user.id]
    );
    const row = result.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return Response.json({ error: 'User not found' }, { status: 404 });
    }
    if (row.plan === 'free') {
      // The cancellation already committed - either via the webhook,
      // an earlier call to this route, or the reconcile cron. Pre-fix
      // we 400'd here; that produced the bug where, if the prior path
      // failed to enqueue the confirmation email (e.g. webhook went
      // down the superseded_sub branch with subscription_id stripped),
      // the user got nothing AND the retry from this route also
      // dropped the email. Now we treat it as an idempotent success
      // and best-effort recover the email from audit history. The
      // email_outbox idempotency_key UNIQUE constraint collapses any
      // duplicate against whatever the prior path enqueued.
      await client.query('ROLLBACK');
      await tryEnqueueRecoveredCancellationEmail({
        userId: user.id,
        email: row.email,
        source: 'cancel_route_already_free',
      }).catch((err) => {
        logger.warn('cancel.recovery_enqueue_unexpected_throw', {
          userId: user.id,
          error: (err as Error).message,
        });
      });
      return Response.json({
        success: true,
        message: 'Subscription already cancelled. You are on the free plan.',
        alreadyCancelled: true,
      });
    }

    const subId = row.settings?.subscription_id;
    let dodoCancelledForAudit: string | null = null;

    // Owner and trial accounts have no subscription behind them. Without
    // this guard a stray "Cancel" click silently dropped an owner account
    // (or an active trial) to 'free'.
    if (!subId && (row.plan === 'owner' || row.plan === 'trial')) {
      await client.query('ROLLBACK');
      return Response.json({ error: 'There is no active subscription to cancel.' }, { status: 400 });
    }

    if (subId) {
      // PATCH Dodo *inside* the transaction. If anything below this point
      // fails we ROLLBACK so the local DB never claims to have cancelled a
      // subscription that Dodo never heard about. If Dodo fails, ROLLBACK
      // means we never claim it cancelled either - symmetric drift-free.
      const cancel = await cancelDodoSubscription(subId);
      if (!cancel.ok) {
        await client.query('ROLLBACK').catch(() => {});
        if (cancel.reason === 'not_configured') {
          return Response.json({ error: 'Payment system not configured' }, { status: 503 });
        }
        if (cancel.reason === 'network_error') {
          logger.error('payments.cancel.provider_network_error', {
            userId: user.id,
            error: cancel.error,
          });
          return serverError({
            message: 'Failed to cancel subscription with payment provider. Please try again.',
          });
        }
        logger.error('payments.cancel.provider_error', {
          userId: user.id,
          status: cancel.status,
          body_preview: cancel.bodyPreview,
        });
        return serverError({
          message: 'Failed to cancel subscription with payment provider. Please contact support or try again.',
        });
      }

      if (cancel.alreadyCancelled) {
        logger.info('payments.cancel.provider_already_cancelled', {
          userId: user.id,
          status: cancel.status,
        });
      }

      dodoCancelledForAudit = subId;
    }

    // DB UPDATE *inside* the transaction. A throw here means Dodo has
    // already accepted the cancellation but pg refused our write -
    // ROLLBACK leaves no half-written state locally, the route returns
    // 500, and the caller can retry. The eventual-consistency safety net
    // (webhook subscription.cancelled + the 15-min reconcile cron) heals
    // the Dodo-side cancellation if the client doesn't retry.
    try {
      await client.query(
        `UPDATE users SET plan = 'free', settings = settings - 'subscription_id' - 'dodo_customer_id' - 'dodo_product_id' || '{"subscription_status":"cancelled"}'::jsonb WHERE id = $1`,
        [user.id]
      );
    } catch (updateErr) {
      await client.query('ROLLBACK').catch(() => {});
      logger.error('payments.cancel.db_update_failed', {
        userId: user.id,
        dodo_cancelled: !!dodoCancelledForAudit,
        error: (updateErr as Error).message,
      });
      return serverError({ message: 'Failed to cancel subscription' });
    }

    // COMMIT is the last step that can fail. If it does AND we already
    // cancelled at Dodo, we have unrecoverable drift on this connection -
    // the transaction is gone and the client may be poisoned. Write a
    // high-priority audit row on a *fresh* connection (auditLog uses the
    // global pool, not this client) so ops/Sentry can chase the orphan.
    // The webhook + reconcile cron are still the eventual-consistency
    // safety net, but the audit row makes the rare event visible instead
    // of silent.
    try {
      await client.query('COMMIT');
    } catch (commitErr) {
      await client.query('ROLLBACK').catch(() => {});
      logger.error('payments.cancel.commit_failed_after_dodo_success', {
        userId: user.id,
        subId: dodoCancelledForAudit,
        error: (commitErr as Error).message,
      });
      auditLog(
        'system',
        'cancel_db_commit_failed_after_dodo_success',
        'user',
        user.id,
        {
          subscriptionId: dodoCancelledForAudit,
          previousPlan: row.plan,
          error: (commitErr as Error).message,
        },
        'cancel-route',
      ).catch(() => {});
      return serverError({ message: 'Failed to cancel subscription' });
    }

    postCommit = { email: row.email, previousPlan: row.plan, previousSubscriptionId: subId ?? null };
  } catch (e) {
    // Unexpected throw outside the labelled error windows above. Best-effort
    // ROLLBACK and let logError surface the cause.
    await client.query('ROLLBACK').catch(() => {});
    logError('payments.cancel.failed', e);
    return serverError({ message: 'Failed to cancel subscription' });
  } finally {
    client.release();
  }

  // Post-commit: audit + cancellation email enqueue. The webhook handler
  // also enqueues this email on subscription.cancelled with the SAME
  // idempotency key (plan_cancellation:userId:subscriptionId), so whichever
  // path inserts into email_outbox first wins and the other is a no-op via
  // ON CONFLICT (idempotency_key) DO NOTHING. Pre-fix, the email was owned
  // solely by the webhook - if Dodo's webhook delivery was dropped or
  // replayed out of order, the user got no cancellation email. Now the
  // user-initiated cancel path also enqueues, closing that race.
  auditLog(user.id, 'subscription_cancelled', 'user', user.id, {
    previousPlan: postCommit.previousPlan,
    previousSubscriptionId: postCommit.previousSubscriptionId,
  }, '').catch(() => {});

  // Record the user-visible billing event. Post-commit (the local pg
  // client has been released; recordBillingEvent uses the global pool).
  // No dodo_event_id - when the webhook subscription.cancelled later
  // arrives it goes down the superseded_sub case (2) branch (because
  // the cancel route stripped settings.subscription_id, so
  // cancellationMatchesActive is false) and that branch suppresses
  // its superseded_sub_cancelled row when previousPlan === 'free'.
  // Net: exactly one user-visible plan_cancelled row per logical
  // cancellation regardless of which path commits first.
  recordBillingEvent({
    userId: user.id,
    eventType: 'plan_cancelled',
    fromPlan: postCommit.previousPlan ?? null,
    toPlan: 'free',
    subscriptionId: postCommit.previousSubscriptionId,
    source: 'cancel_route',
    details: {},
  }).catch(() => {});

  // Enqueue the cancellation email whenever the user transitioned from
  // a paid plan to free. previousSubscriptionId is NOT a precondition:
  // if settings.subscription_id was already null when this request
  // arrived (a prior partial flow stripped it, or the user cancelled
  // before re-binding), the user still moved paid -> free and still
  // expects the email. The shared key helper produces 'no_sub' as a
  // stable third segment in that case so the webhook (which is also
  // updated to use the same helper) still dedupes against this row.
  if (postCommit.email && postCommit.previousPlan && postCommit.previousPlan !== 'free') {
    const idempotencyKey = planCancellationIdempotencyKey(user.id, postCommit.previousSubscriptionId);
    try {
      await sendPlanCancellationEmail(
        postCommit.email,
        { previousPlan: postCommit.previousPlan },
        idempotencyKey,
      );
    } catch (emailErr) {
      // The cancel itself committed successfully; an email-enqueue failure
      // must not roll that back. The audit row above remains the support
      // trail, and the webhook still has a chance to enqueue the email
      // independently under the same idempotency key.
      logger.error('cancel.email_enqueue_failed', {
        userId: user.id,
        subscriptionId: postCommit.previousSubscriptionId,
        error: (emailErr as Error).message,
      });
    }
  }

  return Response.json({
    success: true,
    message: 'Subscription cancelled. You are now on the free plan.',
  });
}
