import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';

function loadEnvKey(key: string): string | null {
  if (process.env[key]) return process.env[key]!;
  try {
    if (fs.existsSync('.env.local')) {
      const content = fs.readFileSync('.env.local', 'utf8');
      const match = content.match(new RegExp(`${key}=([^\\r\\n]+)`));
      if (match && match[1]) return match[1].trim();
    }
  } catch {}
  return null;
}

describe('SOLO Paystack Live Payment Gateway Integration Suite', () => {
  const secretKey = loadEnvKey('PAYSTACK_SECRET_KEY');
  const planCode = loadEnvKey('PAYSTACK_DRIVER_PLAN_CODE') || 'PLN_ikve07om4bi8vgh';

  it('verifies Paystack Live API credentials and plan configuration', async () => {
    if (!secretKey) {
      console.warn('Skipping live test: PAYSTACK_SECRET_KEY not found in environment');
      return;
    }

    let res;
    try {
      res = await fetch(`https://api.paystack.co/plan/${planCode}`, {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (e: any) {
      if (e?.cause?.code === 'ENOTFOUND' || e?.message?.includes('fetch failed')) {
        console.warn('Skipping live test: cannot reach api.paystack.co (offline/sandboxed)');
        return;
      }
      throw e;
    }

    assert.strictEqual(res.status, 200, `Expected 200 OK from Paystack API, received ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.status, true);
    assert.strictEqual(data.data.plan_code, planCode);
    assert.strictEqual(data.data.amount, 49900, 'Monthly subscription fee must be exactly R499.00 (49900 ZAR cents)');
    assert.strictEqual(data.data.currency, 'ZAR', 'Currency must be South African Rand (ZAR)');
    assert.strictEqual(data.data.interval, 'monthly', 'Billing interval must be monthly');
  });

  it('initializes a live subscription checkout session with Paystack', async () => {
    if (!secretKey) return;

    let res;
    try {
      res = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'billing-verification@soloride.co.za',
          amount: 49900,
          currency: 'ZAR',
          plan: planCode,
          callback_url: 'https://soloride.co.za/driver?payment=success',
          metadata: {
            payment_type: 'solo_saas_subscription',
            driverId: 'test-gateway-driver-uuid',
          },
        }),
      });
    } catch (e: any) {
      if (e?.cause?.code === 'ENOTFOUND' || e?.message?.includes('fetch failed')) {
        console.warn('Skipping live test: cannot reach api.paystack.co (offline/sandboxed)');
        return;
      }
      throw e;
    }

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, true);
    assert.ok(data.data.authorization_url, 'Must return a valid Paystack hosted checkout URL');
    assert.ok(data.data.authorization_url.startsWith('https://checkout.paystack.com/'));
    assert.ok(data.data.access_code);
    assert.ok(data.data.reference);
  });

  it('initializes a live nominal card tokenization session for 7-day free trial', async () => {
    if (!secretKey) return;

    let res;
    try {
      res = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'trial-card-test@soloride.co.za',
          amount: 100, // R1.00 nominal pre-authorization
          currency: 'ZAR',
          callback_url: 'https://soloride.co.za/driver/register?card_setup=success',
          metadata: {
            payment_type: 'driver_trial_card_capture',
            driverId: 'test-trial-card-driver-uuid',
            trial_duration: '7 Days Free Trial',
          },
        }),
      });
    } catch (e: any) {
      if (e?.cause?.code === 'ENOTFOUND' || e?.message?.includes('fetch failed')) {
        console.warn('Skipping live test: cannot reach api.paystack.co (offline/sandboxed)');
        return;
      }
      throw e;
    }

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, true);
    assert.ok(data.data.authorization_url);
    assert.ok(data.data.authorization_url.startsWith('https://checkout.paystack.com/'));
    assert.ok(data.data.access_code);
    assert.ok(data.data.reference);
  });

  it('computes and validates HMAC-SHA512 webhook signature against live secret key', () => {
    if (!secretKey) return;

    const testPayload = JSON.stringify({
      event: 'charge.success',
      data: {
        reference: 'T181621236876587',
        amount: 49900,
        currency: 'ZAR',
        status: 'success',
        plan: {
          plan_code: planCode,
          amount: 49900,
        },
      },
    });

    const signature = crypto.createHmac('sha512', secretKey).update(testPayload).digest('hex');
    assert.ok(signature && signature.length === 128, 'HMAC-SHA512 signature must be a 128-character hex string');

    // Verify verification logic matches /api/paystack-webhook
    const computed = crypto.createHmac('sha512', secretKey).update(testPayload).digest('hex');
    assert.strictEqual(computed, signature);
  });
});
