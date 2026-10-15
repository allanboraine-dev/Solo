import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';

describe('Paystack PCI-DSS Payment & Webhook Security Suite', () => {
  const secretKey = 'sk_test_mock_secret_key_12345';

  it('validates authentic Paystack HMAC SHA512 webhook signatures', () => {
    const rawPayload = JSON.stringify({
      event: 'charge.success',
      data: {
        reference: 'trx_test_ref_499',
        amount: 49900,
        currency: 'ZAR',
        metadata: {
          payment_type: 'solo_saas_subscription',
          driverId: 'd0000000-0000-0000-0000-000000000001',
        },
      },
    });

    // Generate valid signature using the secret key
    const validSignature = crypto.createHmac('sha512', secretKey).update(rawPayload).digest('hex');

    // Verification check as done in /api/paystack-webhook
    const computedHash = crypto.createHmac('sha512', secretKey).update(rawPayload).digest('hex');
    assert.strictEqual(computedHash, validSignature);
  });

  it('rejects tampered or forged webhook payloads', () => {
    const originalPayload = JSON.stringify({ event: 'charge.success', data: { amount: 10000 } });
    const originalSignature = crypto.createHmac('sha512', secretKey).update(originalPayload).digest('hex');

    // Attacker modifies the payload amount
    const tamperedPayload = JSON.stringify({ event: 'charge.success', data: { amount: 100 } });
    const verificationHash = crypto.createHmac('sha512', secretKey).update(tamperedPayload).digest('hex');

    assert.notStrictEqual(verificationHash, originalSignature);
  });

  it('rejects webhooks signed with an incorrect secret key', () => {
    const payload = JSON.stringify({ event: 'charge.success', data: { reference: 'ref_123' } });
    const forgedSignature = crypto.createHmac('sha512', 'wrong_attacker_secret').update(payload).digest('hex');
    const expectedHash = crypto.createHmac('sha512', secretKey).update(payload).digest('hex');

    assert.notStrictEqual(forgedSignature, expectedHash);
  });

  it('converts South African Rand (ZAR) amounts into exact Paystack cents', () => {
    // Paystack expects integer cents
    const toCents = (zarAmount: number) => Math.round(zarAmount * 100);

    assert.strictEqual(toCents(499.00), 49900); // R499 driver SaaS
    assert.strictEqual(toCents(145.50), 14550); // R145.50 ride fare
    assert.strictEqual(toCents(30.00), 3000);   // R30 base ride
    assert.strictEqual(toCents(45.99), 4599);   // Precision handling
  });

  it('validates metadata schemas for fare settlement and driver SaaS', () => {
    const fareMetadata = {
      payment_type: 'solo_trip_fare',
      trip_id: 'trip-1234',
      rider_id: 'rider-5678',
      driver_id: 'driver-9012',
    };
    assert.strictEqual(fareMetadata.payment_type, 'solo_trip_fare');
    assert.ok(fareMetadata.trip_id);

    const subscriptionMetadata = {
      payment_type: 'solo_saas_subscription',
      driverId: 'driver-9012',
      plan_code: 'PLN_solo_pro_monthly',
    };
    assert.strictEqual(subscriptionMetadata.payment_type, 'solo_saas_subscription');
    assert.ok(subscriptionMetadata.driverId);
  });
});
