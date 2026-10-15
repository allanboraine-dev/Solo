import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isWithinRadiusKm } from '../src/utils/geo.ts';
import { calculateFare } from '../src/utils/mapService.ts';

describe('End-to-End E-Hailing Trip & SaaS Subscription Lifecycle', () => {
  it('simulates the complete trip state machine from booking to Paystack completion', () => {
    // 1. Rider books ride
    const riderId = 'r-001';
    const pickup = { lat: -26.1046, lng: 28.0540, name: 'Sandton City' };
    const dropoff = { lat: -26.1467, lng: 28.0417, name: 'Rosebank Mall' };
    const distanceKm = 5.9;
    const fare = calculateFare(distanceKm); // R79
    const verificationPin = '4821';

    let trip = {
      id: 'trip-simulation-001',
      rider_id: riderId,
      driver_id: null as string | null,
      pickup_lat: pickup.lat,
      pickup_lng: pickup.lng,
      dropoff_lat: dropoff.lat,
      dropoff_lng: dropoff.lng,
      fare_amount: fare,
      status: 'requested',
      verification_pin: verificationPin,
      payment_status: 'pending',
      payment_method: 'in_app',
      completed_at: null as string | null,
    };

    assert.strictEqual(trip.status, 'requested');
    assert.strictEqual(trip.fare_amount, 79);

    // 2. Driver within 15km radar discovers the ride
    const driverCoords = { lat: -26.1200, lng: 28.0500 }; // ~2km from pickup
    const isNearby = isWithinRadiusKm(driverCoords.lat, driverCoords.lng, trip.pickup_lat, trip.pickup_lng, 15);
    assert.strictEqual(isNearby, true, 'Driver must be within 15km radius');

    // 3. Driver accepts trip
    const driverId = 'd-001';
    trip = {
      ...trip,
      driver_id: driverId,
      status: 'accepted',
    };
    assert.strictEqual(trip.status, 'accepted');
    assert.strictEqual(trip.driver_id, driverId);

    // 4. Driver arrives & verifies 4-digit PIN
    const enteredPin = '4821';
    assert.strictEqual(enteredPin, trip.verification_pin, 'PIN must match rider PIN');
    trip = {
      ...trip,
      status: 'in_progress',
    };
    assert.strictEqual(trip.status, 'in_progress');

    // 5. Driver reaches destination & requests in-app payment
    trip = {
      ...trip,
      status: 'payment_pending',
    };
    assert.strictEqual(trip.status, 'payment_pending');

    // 6. Rider settles fare via Paystack checkout
    const paymentSuccess = true;
    if (paymentSuccess) {
      trip = {
        ...trip,
        status: 'completed',
        payment_status: 'paid',
        completed_at: new Date().toISOString(),
      };
    }
    assert.strictEqual(trip.status, 'completed');
    assert.strictEqual(trip.payment_status, 'paid');
    assert.ok(trip.completed_at);

    // 7. Rider reviews driver with 5 stars & tags
    const rating = {
      trip_id: trip.id,
      driver_id: trip.driver_id,
      rider_id: trip.rider_id,
      stars: 5,
      tags: ['Smooth Driving', 'Clean Car', 'Great Music'],
      comment: 'Excellent trip, very courteous driver!',
    };
    assert.strictEqual(rating.stars, 5);
    assert.strictEqual(rating.tags.length, 3);
  });

  it('simulates driver 7-day trial progression and monthly subscription billing', () => {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    // Day 0: Driver signs up
    let driverProfile = {
      id: 'd-002',
      fullName: 'Bongani Ndlovu',
      subscriptionPlan: 'trial' as 'trial' | 'paid',
      subscriptionActive: true,
      trialStartedAt: now,
    };

    // Helper to evaluate trial expiry
    const checkExpiry = (profile: typeof driverProfile, currentTime: number) => {
      if (profile.subscriptionPlan === 'trial' && profile.trialStartedAt) {
        return (currentTime - profile.trialStartedAt) > SEVEN_DAYS_MS;
      }
      return false;
    };

    // Day 3: Should still be active trial
    const day3 = now + (3 * 24 * 60 * 60 * 1000);
    assert.strictEqual(checkExpiry(driverProfile, day3), false, 'Day 3 should not be expired');

    // Day 8: Free trial has elapsed
    const day8 = now + (8 * 24 * 60 * 60 * 1000);
    assert.strictEqual(checkExpiry(driverProfile, day8), true, 'Day 8 must be flagged as expired');

    // Driver authorizes Paystack R499/mo subscription
    driverProfile = {
      ...driverProfile,
      subscriptionPlan: 'paid',
      subscriptionActive: true,
    };

    // Day 15: Post-payment active subscription
    const day15 = now + (15 * 24 * 60 * 60 * 1000);
    assert.strictEqual(checkExpiry(driverProfile, day15), false, 'Paid subscription never expires on trial check');
    assert.strictEqual(driverProfile.subscriptionPlan, 'paid');
  });
});
