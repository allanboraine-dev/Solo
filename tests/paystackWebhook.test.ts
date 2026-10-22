import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import {
  validatePaystackSignature,
  handlePaystackWebhookEvent,
} from '../src/utils/paystackWebhookHandler.ts';
import { saveKycDriverProfile, getKycDriverProfile } from '../src/utils/kycStore.ts';
import { registerFleetProfile, getFleetProfile } from '../src/utils/fleetStore.ts';

const TEST_SECRET = 'sk_test_paystack_webhook_secret_key_mock_123';

function signPayload(body: string, secret = TEST_SECRET): string {
  return crypto.createHmac('sha512', secret).update(body).digest('hex');
}

// Mock Supabase client for capturing DB calls
function createMockSupabase() {
  const updates: Array<{ table: string; payload: any; filters: any[] }> = [];
  const rpcs: Array<{ name: string; params: any }> = [];

  const client = {
    from: (table: string) => {
      let currentPayload: any = null;
      const filters: any[] = [];
      const queryBuilder = {
        update: (payload: any) => {
          currentPayload = payload;
          return queryBuilder;
        },
        eq: (col: string, val: any) => {
          filters.push({ col, op: 'eq', val });
          return queryBuilder;
        },
        then: (resolve: (val: any) => void) => {
          updates.push({ table, payload: currentPayload, filters });
          resolve({ data: null, error: null });
        },
      };
      return queryBuilder;
    },
    rpc: async (name: string, params: any) => {
      rpcs.push({ name, params });
      return { data: null, error: null };
    },
    _getUpdates: () => updates,
    _getRpcs: () => rpcs,
  };

  return client;
}

describe('Paystack Webhook Handler & Security Verification Suite', () => {
  describe('1. Timing-Safe Cryptographic Signature Verification', () => {
    it('returns error when secret key is missing', () => {
      const res = validatePaystackSignature('{}', 'some-sig', undefined);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.status, 500);
      assert.strictEqual(res.error, 'Server configuration error');
    });

    it('returns error when signature header is missing or empty', () => {
      const res = validatePaystackSignature('{}', null, TEST_SECRET);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.error, 'Missing signature');

      const resEmpty = validatePaystackSignature('{}', '', TEST_SECRET);
      assert.strictEqual(resEmpty.valid, false);
      assert.strictEqual(resEmpty.status, 400);
    });

    it('validates authentic Paystack HMAC SHA512 signature', () => {
      const body = JSON.stringify({ event: 'charge.success', data: { reference: 'ref_123' } });
      const validSig = signPayload(body, TEST_SECRET);

      const res = validatePaystackSignature(body, validSig, TEST_SECRET);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.status, 200);
    });

    it('rejects forged signature generated with an incorrect secret key', () => {
      const body = JSON.stringify({ event: 'charge.success', data: { reference: 'ref_123' } });
      const forgedSig = signPayload(body, 'attacker_secret_key');

      const res = validatePaystackSignature(body, forgedSig, TEST_SECRET);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.error, 'Invalid signature');
    });

    it('rejects tampered payload where body does not match the signature', () => {
      const originalBody = JSON.stringify({ event: 'charge.success', data: { amount: 49900 } });
      const validSig = signPayload(originalBody, TEST_SECRET);

      const tamperedBody = JSON.stringify({ event: 'charge.success', data: { amount: 100 } });
      const res = validatePaystackSignature(tamperedBody, validSig, TEST_SECRET);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.error, 'Invalid signature');
    });

    it('handles signature length mismatch without throwing Buffer RangeError', () => {
      const body = JSON.stringify({ event: 'charge.success' });
      const shortSig = 'abcdef1234'; // Far too short

      const res = validatePaystackSignature(body, shortSig, TEST_SECRET);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.error, 'Invalid signature');
    });
  });

  describe('2. charge.success Event Processing', () => {
    it('processes Driver Pro monthly subscription payment and upgrades status to paid', async () => {
      const driverId = 'drv-sub-test-' + Date.now();
      saveKycDriverProfile({
        id: driverId,
        fullName: 'Thabo Mbeki',
        email: 'thabo@solodriver.co.za',
        phone: '+27821234567',
        vehicleMake: 'Toyota',
        vehicleModel: 'Corolla',
        licensePlate: 'CA 123-456',
        prdpNumber: 'PRDP-1234',
        subscriptionPlan: 'trial',
      });

      const mockSupabase = createMockSupabase();

      const event = {
        event: 'charge.success',
        data: {
          reference: 'SOLO-DRV-SUB-001',
          amount: 49900,
          currency: 'ZAR',
          customer: { email: 'thabo@solodriver.co.za' },
          metadata: {
            payment_type: 'solo_saas_subscription',
            driverId,
          },
          authorization: {
            authorization_code: 'AUTH_thabo_sub_001',
            last4: '4081',
            brand: 'visa',
            exp_month: '12',
            exp_year: '2028',
          },
        },
      };

      const result = await handlePaystackWebhookEvent(event, mockSupabase);

      assert.strictEqual(result.handled, true);
      assert.strictEqual(result.action, 'driver_subscription_activated');
      assert.strictEqual(result.entityId, driverId);

      // Verify in-memory kyc driver profile
      const driver = getKycDriverProfile(driverId);
      assert.ok(driver);
      assert.strictEqual(driver.subscriptionPlan, 'paid');
      assert.strictEqual(driver.cardLast4, '4081');
      assert.strictEqual(driver.cardBrand, 'visa');
      assert.strictEqual(driver.paystackAuthorizationCode, 'AUTH_thabo_sub_001');

      // Verify Supabase update was recorded
      const updates = mockSupabase._getUpdates();
      assert.strictEqual(updates.length, 1);
      assert.strictEqual(updates[0].table, 'driver_profiles');
      assert.strictEqual(updates[0].payload.subscription_status, 'active');
      assert.strictEqual(updates[0].payload.subscription_plan, 'paid');
      assert.strictEqual(updates[0].payload.card_last4, '4081');
    });

    it('processes Driver 7-day free trial card capture and stores reusable authorization code', async () => {
      const driverId = 'drv-trial-test-' + Date.now();
      saveKycDriverProfile({
        id: driverId,
        fullName: 'Nandi Sithole',
        email: 'nandi@solodriver.co.za',
        phone: '+27839876543',
        vehicleMake: 'Volkswagen',
        vehicleModel: 'Polo Vivo',
        licensePlate: 'ND 789-012',
        prdpNumber: 'PRDP-5678',
        subscriptionPlan: 'trial',
      });

      const mockSupabase = createMockSupabase();

      const event = {
        event: 'charge.success',
        data: {
          reference: 'SOLO-TRL-CARD-002',
          amount: 100, // R1.00 nominal auth charge
          currency: 'ZAR',
          customer: { email: 'nandi@solodriver.co.za' },
          metadata: {
            payment_type: 'driver_trial_card_capture',
            driverId,
          },
          authorization: {
            authorization_code: 'AUTH_nandi_trial_999',
            last4: '5555',
            brand: 'mastercard',
            exp_month: '08',
            exp_year: '2029',
          },
        },
      };

      const result = await handlePaystackWebhookEvent(event, mockSupabase);

      assert.strictEqual(result.handled, true);
      assert.strictEqual(result.action, 'driver_trial_card_captured');

      const driver = getKycDriverProfile(driverId);
      assert.ok(driver);
      assert.strictEqual(driver.subscriptionPlan, 'trial');
      assert.strictEqual(driver.cardCaptured, true);
      assert.strictEqual(driver.cardLast4, '5555');
      assert.strictEqual(driver.paystackAuthorizationCode, 'AUTH_nandi_trial_999');

      const updates = mockSupabase._getUpdates();
      assert.strictEqual(updates.length, 1);
      assert.strictEqual(updates[0].table, 'driver_profiles');
      assert.strictEqual(updates[0].payload.subscription_status, 'trial');
      assert.strictEqual(updates[0].payload.card_captured, true);
    });

    it('processes Rider trip fare payment, triggers RPC and updates trip to completed', async () => {
      const tripId = 'trip-settle-' + Date.now();
      const mockSupabase = createMockSupabase();

      const event = {
        event: 'charge.success',
        data: {
          reference: 'SOLO-FARE-TRIP-999',
          amount: 14550, // R145.50
          currency: 'ZAR',
          metadata: {
            payment_type: 'solo_trip_fare',
            trip_id: tripId,
          },
        },
      };

      const result = await handlePaystackWebhookEvent(event, mockSupabase);

      assert.strictEqual(result.handled, true);
      assert.strictEqual(result.action, 'trip_fare_settled');
      assert.strictEqual(result.entityId, tripId);

      const rpcs = mockSupabase._getRpcs();
      assert.strictEqual(rpcs.length, 1);
      assert.strictEqual(rpcs[0].name, 'complete_trip');
      assert.strictEqual(rpcs[0].params.p_trip_id, tripId);

      const updates = mockSupabase._getUpdates();
      assert.strictEqual(updates.length, 1);
      assert.strictEqual(updates[0].table, 'trips');
      assert.strictEqual(updates[0].payload.payment_status, 'paid');
      assert.strictEqual(updates[0].payload.status, 'completed');
    });

    it('processes Fleet B2B subscription payment and activates fleet profile', async () => {
      const email = `fleet-webhook-${Date.now()}@capetowncabs.co.za`;
      const createdFleet = registerFleetProfile({
        companyName: 'Cape Town Prime Cabs',
        ownerEmail: email,
        ownerPhone: '+27825550199',
        operatingCity: 'Cape Town',
        contactPerson: 'Garth',
        estimatedVehicles: 5,
      });

      const mockSupabase = createMockSupabase();

      const event = {
        event: 'charge.success',
        data: {
          reference: 'SOLO-FLEET-TRX-101',
          amount: 375475, // R3,754.75 Option C monthly bill
          currency: 'ZAR',
          customer: { email },
          metadata: {
            payment_type: 'solo_fleet_subscription',
            fleetId: createdFleet.id,
          },
          authorization: {
            authorization_code: 'AUTH_fleet_card_789',
            last4: '9988',
            brand: 'visa',
          },
        },
      };

      const result = await handlePaystackWebhookEvent(event, mockSupabase);

      assert.strictEqual(result.handled, true);
      assert.strictEqual(result.action, 'fleet_subscription_activated');
      assert.strictEqual(result.entityId, createdFleet.id);

      const fleet = getFleetProfile(createdFleet.id);
      assert.ok(fleet);
      assert.strictEqual(fleet.subscriptionStatus, 'active');
      assert.strictEqual(fleet.lastPaymentReference, 'SOLO-FLEET-TRX-101');
      assert.strictEqual(fleet.cardLast4, '9988');

      const updates = mockSupabase._getUpdates();
      assert.strictEqual(updates.length, 1);
      assert.strictEqual(updates[0].table, 'fleets');
      assert.strictEqual(updates[0].payload.subscription_status, 'active');
    });
  });

  describe('3. charge.failed Event Processing', () => {
    it('handles trip fare payment decline and records gateway failure reason', async () => {
      const tripId = 'trip-fail-' + Date.now();
      const mockSupabase = createMockSupabase();

      const event = {
        event: 'charge.failed',
        data: {
          reference: 'SOLO-FARE-FAIL-404',
          amount: 12000,
          gateway_response: 'Insufficient funds in card account',
          message: 'Declined',
          metadata: {
            payment_type: 'solo_trip_fare',
            trip_id: tripId,
          },
        },
      };

      const result = await handlePaystackWebhookEvent(event, mockSupabase);

      assert.strictEqual(result.handled, true);
      assert.strictEqual(result.action, 'trip_fare_failed');
      assert.strictEqual(result.entityId, tripId);
      assert.strictEqual(result.error, 'Insufficient funds in card account');

      const updates = mockSupabase._getUpdates();
      assert.strictEqual(updates.length, 1);
      assert.strictEqual(updates[0].table, 'trips');
      assert.strictEqual(updates[0].payload.payment_status, 'failed');
      assert.strictEqual(updates[0].payload.payment_error, 'Insufficient funds in card account');
    });

    it('handles driver subscription payment failure and marks subscription past_due', async () => {
      const driverId = 'drv-fail-' + Date.now();
      const mockSupabase = createMockSupabase();

      const event = {
        event: 'charge.failed',
        data: {
          reference: 'SOLO-DRV-FAIL-500',
          gateway_response: 'Card expired or closed by issuer',
          customer: { email: 'driver-expired@soloride.co.za' },
          metadata: {
            payment_type: 'solo_saas_subscription',
            driverId,
          },
        },
      };

      const result = await handlePaystackWebhookEvent(event, mockSupabase);

      assert.strictEqual(result.handled, true);
      assert.strictEqual(result.action, 'driver_subscription_failed');
      assert.strictEqual(result.entityId, driverId);

      const updates = mockSupabase._getUpdates();
      assert.strictEqual(updates.length, 1);
      assert.strictEqual(updates[0].table, 'driver_profiles');
      assert.strictEqual(updates[0].payload.subscription_status, 'past_due');
    });

    it('handles fleet subscription payment failure and marks fleet past_due', async () => {
      const email = `fleet-fail-${Date.now()}@durbancabs.co.za`;
      const createdFleet = registerFleetProfile({
        companyName: 'Failed Payment Cabs',
        ownerEmail: email,
        ownerPhone: '+27829991122',
        operatingCity: 'Durban',
        contactPerson: 'David',
        estimatedVehicles: 3,
      });

      const mockSupabase = createMockSupabase();

      const event = {
        event: 'charge.failed',
        data: {
          reference: 'SOLO-FLEET-FAIL-777',
          gateway_response: 'Do not honor - card reported stolen',
          metadata: {
            payment_type: 'solo_fleet_subscription',
            fleetId: createdFleet.id,
          },
        },
      };

      const result = await handlePaystackWebhookEvent(event, mockSupabase);

      assert.strictEqual(result.handled, true);
      assert.strictEqual(result.action, 'fleet_subscription_failed');
      assert.strictEqual(result.entityId, createdFleet.id);

      const fleet = getFleetProfile(createdFleet.id);
      assert.ok(fleet);
      assert.strictEqual(fleet.subscriptionStatus, 'past_due');

      const updates = mockSupabase._getUpdates();
      assert.strictEqual(updates.length, 1);
      assert.strictEqual(updates[0].table, 'fleets');
      assert.strictEqual(updates[0].payload.subscription_status, 'past_due');
    });
  });

  describe('4. Subscription Lifecycle Events', () => {
    it('handles recurring invoice.payment_failed and sets driver status to past_due', async () => {
      const mockSupabase = createMockSupabase();
      const event = {
        event: 'invoice.payment_failed',
        data: {
          invoice_code: 'INV_rec_fail_01',
          customer: { email: 'recurring-failed-driver@soloride.co.za' },
        },
      };

      const result = await handlePaystackWebhookEvent(event, mockSupabase);

      assert.strictEqual(result.handled, true);
      assert.strictEqual(result.action, 'invoice_payment_failed');

      const updates = mockSupabase._getUpdates();
      assert.strictEqual(updates.length, 1);
      assert.strictEqual(updates[0].table, 'driver_profiles');
      assert.strictEqual(updates[0].payload.subscription_status, 'past_due');
    });

    it('handles subscription.disable and marks driver subscription as cancelled', async () => {
      const mockSupabase = createMockSupabase();
      const event = {
        event: 'subscription.disable',
        data: {
          subscription_code: 'SUB_cancel_01',
          customer: { email: 'cancelled-driver@soloride.co.za' },
        },
      };

      const result = await handlePaystackWebhookEvent(event, mockSupabase);

      assert.strictEqual(result.handled, true);
      assert.strictEqual(result.action, 'subscription_cancelled');

      const updates = mockSupabase._getUpdates();
      assert.strictEqual(updates.length, 1);
      assert.strictEqual(updates[0].table, 'driver_profiles');
      assert.strictEqual(updates[0].payload.subscription_status, 'cancelled');
      assert.strictEqual(updates[0].payload.subscription_active, false);
    });

    it('handles subscription.not_renew and marks driver subscription as cancelled', async () => {
      const mockSupabase = createMockSupabase();
      const event = {
        event: 'subscription.not_renew',
        data: {
          subscription_code: 'SUB_not_renew_01',
          customer: { email: 'not-renewing@soloride.co.za' },
        },
      };

      const result = await handlePaystackWebhookEvent(event, mockSupabase);

      assert.strictEqual(result.handled, true);
      assert.strictEqual(result.action, 'subscription_cancelled');

      const updates = mockSupabase._getUpdates();
      assert.strictEqual(updates.length, 1);
      assert.strictEqual(updates[0].table, 'driver_profiles');
      assert.strictEqual(updates[0].payload.subscription_status, 'cancelled');
    });
  });

  describe('5. High Throughput & Concurrency Stress Test', () => {
    it('processes 100 concurrent webhook events without errors or race conditions', async () => {
      const mockSupabase = createMockSupabase();

      const promises = Array.from({ length: 100 }, (_, i) => {
        const event = {
          event: i % 2 === 0 ? 'charge.success' : 'charge.failed',
          data: {
            reference: `RAPID-STRESS-${i}-${Date.now()}`,
            amount: 49900,
            gateway_response: i % 2 === 0 ? 'Approved' : 'Declined',
            metadata: {
              payment_type: 'solo_trip_fare',
              trip_id: `stress-trip-${i}`,
            },
          },
        };
        return handlePaystackWebhookEvent(event, mockSupabase);
      });

      const results = await Promise.all(promises);
      assert.strictEqual(results.length, 100);
      for (const res of results) {
        assert.strictEqual(res.handled, true);
        assert.ok(res.action === 'trip_fare_settled' || res.action === 'trip_fare_failed');
      }
    });
  });
});
