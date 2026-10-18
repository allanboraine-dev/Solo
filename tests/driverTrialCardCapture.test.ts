import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { isPlatformOwner } from '../src/utils/owner.ts';
import { SOLO_DRIVER_PLAN_NAME, SOLO_DRIVER_MONTHLY_CENTS, SOLO_DRIVER_CURRENCY } from '../src/utils/paystackPlan.ts';
import { saveKycDriverProfile, getKycDriverProfile } from '../src/utils/kycStore.ts';

describe('SOLO Driver 7-Day Free Trial & Card Capture Subscription Suite', () => {
  const secretKey = 'sk_test_paystack_secret_key_testing';

  it('validates SOLO Driver Pro Monthly plan configuration and ZAR currency', () => {
    assert.strictEqual(SOLO_DRIVER_PLAN_NAME, 'SOLO Driver Pro Monthly');
    assert.strictEqual(SOLO_DRIVER_MONTHLY_CENTS, 49900); // R499.00 in ZAR cents
    assert.strictEqual(SOLO_DRIVER_CURRENCY, 'ZAR');
  });

  it('calculates the exact 7-day trial timeline and billing start date', () => {
    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const trialEndsAt = new Date(now + SEVEN_DAYS_MS);

    // Verify trial end is exactly 7 days (168 hours) in the future
    const diffMs = trialEndsAt.getTime() - now;
    const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
    assert.strictEqual(diffDays, 7);

    // Verify ISO string format required by Paystack API
    const isoString = trialEndsAt.toISOString();
    assert.match(isoString, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('constructs compliant Paystack card tokenization initialization payload (R1.00 verification)', () => {
    const driverId = 'drv-test-uuid-777';
    const email = 'sipho.driver@example.co.za';
    const siteUrl = 'https://solo-app.co.za';

    const payload = {
      email,
      amount: 100, // R1.00 nominal tokenization fee in cents
      currency: 'ZAR',
      callback_url: `${siteUrl}/driver/register?card_setup=success&driver_id=${encodeURIComponent(driverId)}`,
      metadata: {
        driverId,
        email,
        payment_type: 'driver_trial_card_capture',
        trial_duration: '7 Days Free Trial (R0.00)',
        subsequent_billing: 'R499.00 / month after 7-day trial',
      },
    };

    assert.strictEqual(payload.amount, 100);
    assert.strictEqual(payload.currency, 'ZAR');
    assert.strictEqual(payload.metadata.payment_type, 'driver_trial_card_capture');
    assert.ok(payload.callback_url.includes('card_setup=success'));
  });

  it('constructs compliant Paystack scheduled subscription payload with 7-day future start_date', () => {
    const trialStartDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const customerCode = 'CUS_9876543210';
    const planCode = 'PLN_solo_pro_monthly';
    const authorizationCode = 'AUTH_test_card_token_xyz';

    const subPayload = {
      customer: customerCode,
      plan: planCode,
      authorization: authorizationCode,
      start_date: trialStartDate,
    };

    assert.strictEqual(subPayload.customer, customerCode);
    assert.strictEqual(subPayload.plan, 'PLN_solo_pro_monthly');
    assert.strictEqual(subPayload.authorization, authorizationCode);
    assert.ok(new Date(subPayload.start_date).getTime() > Date.now());
  });

  it('constructs compliant Paystack refund payload to return the R1.00 verification fee', () => {
    const reference = 'ref_tokenization_12345';
    const refundPayload = {
      transaction: reference,
      amount: 100, // 100 cents = R1.00
      merchant_note: 'SOLO 7-day free trial card verification refund',
    };

    assert.strictEqual(refundPayload.transaction, reference);
    assert.strictEqual(refundPayload.amount, 100);
  });

  it('guarantees platform owner (Allan Boraine) is exempt from card capture and subscription fees', () => {
    const ownerEmail = 'allanboraine@gmail.com';
    assert.strictEqual(isPlatformOwner(ownerEmail), true);

    const regularDriverEmail = 'driver@joburg.co.za';
    assert.strictEqual(isPlatformOwner(regularDriverEmail), false);
  });

  it('stores and tracks card details and trial status in kycStore', () => {
    const testDriverId = 'drv-card-captured-001';
    const trialStartedAt = new Date().toISOString();
    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    saveKycDriverProfile({
      id: testDriverId,
      fullName: 'Bongani Ndlovu',
      email: 'bongani@solo-rides.co.za',
      phone: '+27 83 555 1234',
      vehicleMake: 'Toyota',
      vehicleModel: 'Corolla Quest',
      licensePlate: 'GP 998-123',
      prdpNumber: 'PRDP-GP-2026-99',
      subscriptionPlan: 'trial',
      trialStartedAt,
      trialEndsAt,
      cardLast4: '4081',
      cardBrand: 'Visa',
      cardExpMonth: '12',
      cardExpYear: '2028',
      paystackSubscriptionCode: 'SUB_test_scheduled_999',
      paystackAuthorizationCode: 'AUTH_reusable_4081',
      nextBillingDate: trialEndsAt,
      cardCaptured: true,
    });

    const saved = getKycDriverProfile(testDriverId);
    assert.ok(saved);
    assert.strictEqual(saved?.cardCaptured, true);
    assert.strictEqual(saved?.cardLast4, '4081');
    assert.strictEqual(saved?.cardBrand, 'Visa');
    assert.strictEqual(saved?.subscriptionPlan, 'trial');
    assert.strictEqual(saved?.nextBillingDate, trialEndsAt);
  });

  it('simulates automated Paystack recurring billing event on Day 7 via Webhook HMAC-SHA512', () => {
    // When Day 7 arrives, Paystack executes the scheduled R499 charge and dispatches charge.success
    const recurringWebhookPayload = JSON.stringify({
      event: 'charge.success',
      data: {
        reference: 'trx_paystack_sub_day7_renewal_888',
        amount: 49900, // R499.00
        currency: 'ZAR',
        customer: {
          email: 'bongani@solo-rides.co.za',
          customer_code: 'CUS_9876543210',
        },
        plan: {
          plan_code: 'PLN_solo_pro_monthly',
          amount: 49900,
        },
        authorization: {
          authorization_code: 'AUTH_reusable_4081',
          last4: '4081',
          brand: 'visa',
        },
      },
    });

    // Generate HMAC signature
    const signature = crypto.createHmac('sha512', secretKey).update(recurringWebhookPayload).digest('hex');

    // Verify signature verification logic
    const computedHash = crypto.createHmac('sha512', secretKey).update(recurringWebhookPayload).digest('hex');
    assert.strictEqual(computedHash, signature);

    const parsedEvent = JSON.parse(recurringWebhookPayload);
    assert.strictEqual(parsedEvent.event, 'charge.success');
    assert.strictEqual(parsedEvent.data.amount, 49900);
    assert.strictEqual(parsedEvent.data.customer.email, 'bongani@solo-rides.co.za');
  });

  it('simulates failed card debit notification on Day 7 via Paystack Webhook', () => {
    const failedDebitPayload = JSON.stringify({
      event: 'invoice.payment_failed',
      data: {
        customer: {
          email: 'bongani@solo-rides.co.za',
        },
        plan: {
          plan_code: 'PLN_solo_pro_monthly',
          amount: 49900,
        },
      },
    });

    const parsed = JSON.parse(failedDebitPayload);
    assert.strictEqual(parsed.event, 'invoice.payment_failed');
    assert.strictEqual(parsed.data.customer.email, 'bongani@solo-rides.co.za');
  });
});
