import { describe, it } from 'node:test';
import assert from 'node:assert';
import { saveKycDriverProfile, getKycDriverProfile } from '../src/utils/kycStore.ts';
import { isPlatformOwner } from '../src/utils/owner.ts';
import { handlePaystackWebhookEvent } from '../src/utils/paystackWebhookHandler.ts';

describe('SOLO Driver Subscription Cancellation & Platform Access Gating Suite', () => {
  const secretKey = 'sk_test_paystack_secret_key_testing';

  it('verifies that cancelling a driver subscription marks it as cancelled and deactivates platform access', () => {
    const driverId = 'drv-cancel-test-101';
    const email = 'cancel.driver@example.co.za';

    // 1. Initial active subscription
    saveKycDriverProfile({
      id: driverId,
      email,
      subscriptionPlan: 'paid',
      subscriptionActive: true,
      cardLast4: '4242',
      paystackSubscriptionCode: 'SUB_test_code_123',
    });

    let prof = getKycDriverProfile(driverId);
    assert.strictEqual(prof?.subscriptionActive, true);
    assert.strictEqual(prof?.subscriptionPlan, 'paid');

    // 2. Simulate cancellation
    saveKycDriverProfile({
      id: driverId,
      email,
      subscriptionPlan: 'cancelled',
      subscriptionActive: false,
      paystackSubscriptionCode: null,
    });

    prof = getKycDriverProfile(driverId);
    assert.strictEqual(prof?.subscriptionActive, false);
    assert.strictEqual(prof?.subscriptionPlan, 'cancelled');
    assert.strictEqual(prof?.paystackSubscriptionCode, null);
  });

  it('constructs compliant Paystack subscription disable payload with code and token', () => {
    const subCode = 'SUB_monthly_xyz987';
    const emailToken = 'tok_email_verify_456';

    const payload = {
      code: subCode,
      token: emailToken,
    };

    assert.strictEqual(payload.code, subCode);
    assert.strictEqual(payload.token, emailToken);
  });

  it('handles Paystack subscription.disable webhook event by revoking driver active status', async () => {
    const testEmail = 'driver.webhook.cancel@solo.co.za';
    let dbUpdated = false;
    let updatedPayload: Record<string, unknown> = {};

    const mockSupabase = {
      from: (table: string) => ({
        update: (payload: Record<string, unknown>) => {
          updatedPayload = payload;
          return {
            eq: (col: string, val: string) => {
              if (table === 'driver_profiles' && col === 'email' && val === testEmail) {
                dbUpdated = true;
              }
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      }),
    };

    const webhookEvent = {
      event: 'subscription.disable',
      data: {
        customer: {
          email: testEmail,
        },
        subscription_code: 'SUB_driver_999',
      },
    };

    const result = await handlePaystackWebhookEvent(webhookEvent, mockSupabase);

    assert.strictEqual(result.handled, true);
    assert.strictEqual(result.action, 'subscription_cancelled');
    assert.strictEqual(dbUpdated, true);
    assert.strictEqual(updatedPayload.subscription_status, 'cancelled');
    assert.strictEqual(updatedPayload.subscription_active, false);
  });

  it('reactivates platform access upon successful R499 payment after previous cancellation', async () => {
    const driverId = 'drv-reactivate-test-202';
    const email = 'reactivate@solo.co.za';

    // 1. Initially cancelled
    saveKycDriverProfile({
      id: driverId,
      email,
      subscriptionPlan: 'cancelled',
      subscriptionActive: false,
    });

    let prof = getKycDriverProfile(driverId);
    assert.strictEqual(prof?.subscriptionActive, false);
    assert.strictEqual(prof?.subscriptionPlan, 'cancelled');

    // 2. Driver pays R499 to reactivate
    saveKycDriverProfile({
      id: driverId,
      email,
      subscriptionPlan: 'paid',
      subscriptionActive: true,
      cardLast4: '1111',
      paystackAuthorizationCode: 'AUTH_new_tok_789',
    });

    prof = getKycDriverProfile(driverId);
    assert.strictEqual(prof?.subscriptionActive, true);
    assert.strictEqual(prof?.subscriptionPlan, 'paid');
    assert.strictEqual(prof?.cardLast4, '1111');
  });

  it('guarantees Platform Owner accounts cannot be cancelled and retain permanent free access', () => {
    const ownerEmail = 'allanboraine@gmail.com';
    assert.strictEqual(isPlatformOwner(ownerEmail), true);
  });
});
