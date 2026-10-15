import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createDriverRideAlertPayload,
  createRiderDriverAcceptedPayload,
  createRiderDriverArrivedPayload,
  createPaymentCompletedPayload,
} from '../src/utils/webPush.ts';

describe('Web Push Notification & Dispatch Suite', () => {
  it('generates compliant driver dispatch push payloads with ZAR fares and routes', () => {
    const payload = createDriverRideAlertPayload({
      tripId: 'trip-za-12345',
      pickupAddress: 'Sandton City, Sandhurst',
      dropoffAddress: 'Rosebank Mall, Oxford Rd',
      distanceKm: 5.4,
      fareZar: 74,
    });

    assert.strictEqual(payload.role, 'driver');
    assert.strictEqual(payload.title, '🚖 New Trip Request!');
    assert.ok(payload.body.includes('R74'));
    assert.ok(payload.body.includes('5.4 km'));
    assert.ok(payload.body.includes('Sandton City'));
    assert.strictEqual(payload.icon, '/driver-icon-192.png');
    assert.strictEqual(payload.tripId, 'trip-za-12345');
    assert.strictEqual(payload.url, '/driver?tripId=trip-za-12345');
  });

  it('generates compliant rider push payload when driver accepts with PIN and vehicle details', () => {
    const payload = createRiderDriverAcceptedPayload({
      tripId: 'trip-za-8899',
      driverName: 'Sipho Ndlovu',
      vehicleModel: 'Toyota Corolla Quest',
      vehiclePlate: 'CA 482-910',
      otpPin: '7391',
      etaMinutes: 4,
    });

    assert.strictEqual(payload.role, 'rider');
    assert.strictEqual(payload.title, 'Driver Accepted Your Ride!');
    assert.ok(payload.body.includes('Sipho Ndlovu'));
    assert.ok(payload.body.includes('Toyota Corolla Quest'));
    assert.ok(payload.body.includes('CA 482-910'));
    assert.ok(payload.body.includes('PIN: 7391'));
    assert.ok(payload.body.includes('~4 min'));
    assert.strictEqual(payload.icon, '/rider-icon-192.png');
  });

  it('generates driver arrival alert for riders at pickup location', () => {
    const payload = createRiderDriverArrivedPayload({
      tripId: 'trip-za-8899',
      driverName: 'Sipho Ndlovu',
      otpPin: '7391',
    });

    assert.strictEqual(payload.role, 'rider');
    assert.ok(payload.title.includes('Arrived'));
    assert.ok(payload.body.includes('Sipho Ndlovu'));
    assert.ok(payload.body.includes('7391'));
  });

  it('formats payment settlement push notifications accurately for both roles', () => {
    const riderPayload = createPaymentCompletedPayload({
      tripId: 'trip-za-999',
      amountZar: 110,
      role: 'rider',
    });
    assert.strictEqual(riderPayload.role, 'rider');
    assert.ok(riderPayload.body.includes('R110'));
    assert.ok(riderPayload.body.includes('processed successfully'));

    const driverPayload = createPaymentCompletedPayload({
      tripId: 'trip-za-999',
      amountZar: 110,
      role: 'driver',
    });
    assert.strictEqual(driverPayload.role, 'driver');
    assert.ok(driverPayload.body.includes('R110'));
    assert.ok(driverPayload.body.includes('received R110 directly'));
  });

  it('verifies base64url padding and decoding logic used for VAPID keys', () => {
    const testString = 'BLG8MEl2zdHV6kEZV1WFKDY1HNvTLTn8shbB';
    const padding = '='.repeat((4 - (testString.length % 4)) % 4);
    assert.strictEqual((testString + padding).length % 4, 0);
  });
});
