import crypto from 'node:crypto';
import { saveKycDriverProfile } from './kycStore.ts';
import { activateFleetSubscription, updateFleetSubscriptionStatus } from './fleetStore.ts';

export interface SignatureValidationResult {
  valid: boolean;
  error?: string;
  status: number;
}

export interface WebhookProcessResult {
  handled: boolean;
  action: string;
  eventType: string;
  reference?: string | null;
  paymentType?: string;
  entityId?: string | null;
  error?: string;
}

/**
 * Validates the Paystack HMAC SHA512 signature in constant time.
 * Prevents timing attacks and handles length mismatches gracefully.
 */
export function validatePaystackSignature(
  body: string,
  signature: string | null,
  secret: string | undefined = process.env.PAYSTACK_SECRET_KEY
): SignatureValidationResult {
  if (!secret) {
    return { valid: false, error: 'Server configuration error', status: 500 };
  }

  if (!signature) {
    return { valid: false, error: 'Missing signature', status: 400 };
  }

  try {
    const hash = crypto.createHmac('sha512', secret).update(body).digest('hex');
    const hashBuffer = Buffer.from(hash, 'utf8');
    const sigBuffer = Buffer.from(signature, 'utf8');

    if (hashBuffer.length !== sigBuffer.length || !crypto.timingSafeEqual(hashBuffer, sigBuffer)) {
      return { valid: false, error: 'Invalid signature', status: 400 };
    }

    return { valid: true, status: 200 };
  } catch (err: unknown) {
    return { valid: false, error: 'Invalid signature', status: 400 };
  }
}

/**
 * Core processor for Paystack webhook events:
 *  - charge.success: Driver subscriptions, 7-day free trial card captures, trip fares, fleet subscriptions
 *  - charge.failed: Records card decline reasons for trip fares, driver subscriptions, and fleet billing
 *  - invoice.payment_failed: Marks recurring subscriptions as past_due
 *  - subscription.disable & subscription.not_renew: Updates subscription status to cancelled
 */
export async function handlePaystackWebhookEvent(
  event: any,
  supabaseClient?: any
): Promise<WebhookProcessResult> {
  const eventType = event?.event || 'unknown';
  const data = event?.data || {};
  const metadata = data?.metadata || {};
  const paymentType = metadata?.payment_type;
  const reference = data?.reference || null;

  // ---------------------------------------------------------------------------
  // 1. EVENT: CHARGE.SUCCESS
  // ---------------------------------------------------------------------------
  if (eventType === 'charge.success') {
    const auth = data.authorization || {};
    const cardLast4 = auth.last4 || null;
    const cardBrand = auth.brand || auth.card_type || null;
    const authCode = auth.authorization_code || null;
    const cardExpMonth = auth.exp_month ? String(auth.exp_month) : null;
    const cardExpYear = auth.exp_year ? String(auth.exp_year) : null;

    // A. Driver SaaS Subscription & 7-Day Trial Card Tokenization
    const isDriverSub =
      paymentType === 'solo_saas_subscription' ||
      paymentType === 'driver_trial_card_capture' ||
      metadata.driverId ||
      metadata.driver_id ||
      (data.plan && data.plan.amount === 49900) ||
      (data.amount === 49900 && paymentType !== 'solo_trip_fare');

    if (isDriverSub && paymentType !== 'solo_trip_fare') {
      const driverId = metadata.driverId || metadata.driver_id;
      const customerEmail = data.customer?.email;
      const isTrialCapture = paymentType === 'driver_trial_card_capture';

      const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      try {
        if (isTrialCapture) {
          // Driver completed nominal R1.00 card authorization for 7-day trial
          if (driverId) {
            saveKycDriverProfile({
              id: driverId,
              email: customerEmail,
              subscriptionPlan: 'trial',
              trialStartedAt: new Date().toISOString(),
              trialEndsAt: sevenDaysFromNow,
              cardLast4,
              cardBrand,
              cardExpMonth,
              cardExpYear,
              paystackAuthorizationCode: authCode,
              nextBillingDate: sevenDaysFromNow,
              cardCaptured: true,
            });
          }

          if (supabaseClient) {
            const updatePayload: Record<string, unknown> = {
              subscription_plan: 'trial',
              subscription_status: 'trial',
              subscription_active: true,
              trial_started_at: new Date().toISOString(),
              trial_ends_at: sevenDaysFromNow,
              next_billing_date: sevenDaysFromNow,
              card_captured: true,
              updated_at: new Date().toISOString(),
            };
            if (cardLast4) updatePayload.card_last4 = cardLast4;
            if (cardBrand) updatePayload.card_brand = cardBrand;
            if (cardExpMonth) updatePayload.card_exp_month = cardExpMonth;
            if (cardExpYear) updatePayload.card_exp_year = cardExpYear;
            if (authCode) updatePayload.paystack_authorization_code = authCode;

            let query = supabaseClient.from('driver_profiles').update(updatePayload);
            if (driverId) query = query.eq('id', driverId);
            else if (customerEmail) query = query.eq('email', customerEmail);
            await query;
          }

          return {
            handled: true,
            action: 'driver_trial_card_captured',
            eventType,
            reference,
            paymentType,
            entityId: driverId || customerEmail,
          };
        } else {
          // Driver Pro paid upgrade or recurring renewal
          if (driverId) {
            saveKycDriverProfile({
              id: driverId,
              email: customerEmail,
              subscriptionPlan: 'paid',
              cardLast4,
              cardBrand,
              cardExpMonth,
              cardExpYear,
              paystackAuthorizationCode: authCode,
              nextBillingDate: thirtyDaysFromNow,
              cardCaptured: true,
            });
          }

          if (supabaseClient) {
            const updatePayload: Record<string, unknown> = {
              subscription_plan: 'paid',
              subscription_status: 'active',
              subscription_active: true,
              subscription_expires_at: thirtyDaysFromNow,
              next_billing_date: thirtyDaysFromNow,
              updated_at: new Date().toISOString(),
            };
            if (cardLast4) updatePayload.card_last4 = cardLast4;
            if (cardBrand) updatePayload.card_brand = cardBrand;
            if (cardExpMonth) updatePayload.card_exp_month = cardExpMonth;
            if (cardExpYear) updatePayload.card_exp_year = cardExpYear;
            if (authCode) updatePayload.paystack_authorization_code = authCode;

            let query = supabaseClient.from('driver_profiles').update(updatePayload);
            if (driverId) query = query.eq('id', driverId);
            else if (customerEmail) query = query.eq('email', customerEmail);
            await query;
          }

          return {
            handled: true,
            action: 'driver_subscription_activated',
            eventType,
            reference,
            paymentType,
            entityId: driverId || customerEmail,
          };
        }
      } catch (err: unknown) {
        console.warn('[Paystack Webhook] Driver DB update error:', err);
      }
    }

    // B. Rider Trip Fare Settlement
    if (paymentType === 'solo_trip_fare' || metadata.trip_id) {
      const tripId = metadata.trip_id;
      if (tripId && supabaseClient) {
        try {
          try {
            await supabaseClient.rpc('complete_trip', {
              p_trip_id: tripId,
              p_payment_method: 'in_app',
            });
          } catch {}

          await supabaseClient
            .from('trips')
            .update({
              status: 'completed',
              payment_status: 'paid',
              payment_method: 'in_app',
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', tripId);
        } catch (tripErr) {
          console.warn('[Paystack Webhook] Trip DB update error:', tripErr);
        }
      }

      return {
        handled: true,
        action: 'trip_fare_settled',
        eventType,
        reference,
        paymentType,
        entityId: tripId,
      };
    }

    // C. Fleet B2B Subscription Payment
    const isFleetSub =
      paymentType === 'solo_fleet_subscription' ||
      metadata.fleetId ||
      metadata.fleet_id;

    if (isFleetSub) {
      const fleetId = metadata.fleetId || metadata.fleet_id;
      const amountZar = (data.amount || 0) / 100;

      if (fleetId) {
        try {
          activateFleetSubscription(fleetId, {
            paymentReference: reference || undefined,
            amountZar,
            cardLast4,
            cardBrand,
          });
        } catch (storeErr) {
          console.warn('[Paystack Webhook] Fleet store update error:', storeErr);
        }

        if (supabaseClient) {
          try {
            const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            await supabaseClient
              .from('fleets')
              .update({
                subscription_status: 'active',
                subscription_renews_at: thirtyDaysFromNow,
                updated_at: new Date().toISOString(),
              })
              .eq('id', fleetId);
          } catch (fleetDbErr) {
            console.warn('[Paystack Webhook] Fleet DB update error:', fleetDbErr);
          }
        }
      }

      return {
        handled: true,
        action: 'fleet_subscription_activated',
        eventType,
        reference,
        paymentType,
        entityId: fleetId,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // 2. EVENT: CHARGE.FAILED
  // ---------------------------------------------------------------------------
  else if (eventType === 'charge.failed') {
    const failureReason = data.gateway_response || data.message || 'Payment declined by issuer';

    // A. Trip fare failure
    if (paymentType === 'solo_trip_fare' || metadata.trip_id) {
      const tripId = metadata.trip_id;
      if (tripId && supabaseClient) {
        try {
          await supabaseClient
            .from('trips')
            .update({
              payment_status: 'failed',
              payment_error: failureReason,
              updated_at: new Date().toISOString(),
            })
            .eq('id', tripId);
        } catch (tripErr) {
          console.warn('[Paystack Webhook] Trip failure DB error:', tripErr);
        }
      }

      return {
        handled: true,
        action: 'trip_fare_failed',
        eventType,
        reference,
        paymentType,
        entityId: tripId,
        error: failureReason,
      };
    }

    // B. Driver SaaS failure
    const isDriverSub =
      paymentType === 'solo_saas_subscription' ||
      paymentType === 'driver_trial_card_capture' ||
      metadata.driverId ||
      metadata.driver_id;

    if (isDriverSub && paymentType !== 'solo_trip_fare') {
      const driverId = metadata.driverId || metadata.driver_id;
      const customerEmail = data.customer?.email;

      if (supabaseClient) {
        try {
          let query = supabaseClient
            .from('driver_profiles')
            .update({
              subscription_status: 'past_due',
              updated_at: new Date().toISOString(),
            });

          if (driverId) query = query.eq('id', driverId);
          else if (customerEmail) query = query.eq('email', customerEmail);
          await query;
        } catch (drvErr) {
          console.warn('[Paystack Webhook] Driver failure DB error:', drvErr);
        }
      }

      return {
        handled: true,
        action: 'driver_subscription_failed',
        eventType,
        reference,
        paymentType,
        entityId: driverId || customerEmail,
        error: failureReason,
      };
    }

    // C. Fleet SaaS failure
    const isFleetSub =
      paymentType === 'solo_fleet_subscription' ||
      metadata.fleetId ||
      metadata.fleet_id;

    if (isFleetSub) {
      const fleetId = metadata.fleetId || metadata.fleet_id;
      if (fleetId) {
        try {
          updateFleetSubscriptionStatus(fleetId, 'past_due');
        } catch (storeErr) {
          console.warn('[Paystack Webhook] Fleet failure store error:', storeErr);
        }

        if (supabaseClient) {
          try {
            await supabaseClient
              .from('fleets')
              .update({
                subscription_status: 'past_due',
                updated_at: new Date().toISOString(),
              })
              .eq('id', fleetId);
          } catch (dbErr) {
            console.warn('[Paystack Webhook] Fleet failure DB error:', dbErr);
          }
        }
      }

      return {
        handled: true,
        action: 'fleet_subscription_failed',
        eventType,
        reference,
        paymentType,
        entityId: fleetId,
        error: failureReason,
      };
    }

    return {
      handled: true,
      action: 'charge_failed_recorded',
      eventType,
      reference,
      error: failureReason,
    };
  }

  // ---------------------------------------------------------------------------
  // 3. EVENT: INVOICE.PAYMENT_FAILED
  // ---------------------------------------------------------------------------
  else if (eventType === 'invoice.payment_failed') {
    const customerEmail = data?.customer?.email;
    if (customerEmail && supabaseClient) {
      try {
        await supabaseClient
          .from('driver_profiles')
          .update({
            subscription_status: 'past_due',
            updated_at: new Date().toISOString(),
          })
          .eq('email', customerEmail);
      } catch (subErr) {
        console.warn('[Paystack Webhook] Invoice failure DB error:', subErr);
      }
    }

    return {
      handled: true,
      action: 'invoice_payment_failed',
      eventType,
      reference,
      entityId: customerEmail,
    };
  }

  // ---------------------------------------------------------------------------
  // 4. EVENT: SUBSCRIPTION.DISABLE & SUBSCRIPTION.NOT_RENEW
  // ---------------------------------------------------------------------------
  else if (eventType === 'subscription.disable' || eventType === 'subscription.not_renew') {
    const customerEmail = data?.customer?.email;
    if (customerEmail && supabaseClient) {
      try {
        await supabaseClient
          .from('driver_profiles')
          .update({
            subscription_status: 'cancelled',
            subscription_active: false,
            updated_at: new Date().toISOString(),
          })
          .eq('email', customerEmail);
      } catch (subErr) {
        console.warn('[Paystack Webhook] Subscription cancellation DB error:', subErr);
      }
    }

    return {
      handled: true,
      action: 'subscription_cancelled',
      eventType,
      reference,
      entityId: customerEmail,
    };
  }

  // Any other Paystack event acknowledged with HTTP 200
  return {
    handled: true,
    action: 'event_acknowledged',
    eventType,
    reference,
  };
}
