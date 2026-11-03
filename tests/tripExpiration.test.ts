import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isStaleRequestedTrip, isTripExpired, TRIP_EXPIRATION_MS } from '../src/utils/tripExpiration.ts';

interface MockTrip {
  id: string;
  rider_id: string;
  driver_id?: string;
  pickup_location: string;
  dropoff_location: string;
  fare_amount: number;
  status: 'requested' | 'accepted' | 'arrived' | 'in_progress' | 'payment_pending' | 'completed' | 'cancelled';
  created_at: string;
  scheduled_time?: string | null;
}

describe('1-Hour Unclaimed Trip Expiration Suite', () => {
  it('confirms TRIP_EXPIRATION_MS is exactly 1 hour (3,600,000 ms)', () => {
    assert.strictEqual(TRIP_EXPIRATION_MS, 60 * 60 * 1000);
  });

  it('keeps requests active if less than 1 hour old and unclaimed', () => {
    const freshTrip: MockTrip = {
      id: 'trip-recent-001',
      rider_id: 'rider-1',
      pickup_location: 'V&A Waterfront',
      dropoff_location: 'Camps Bay',
      fare_amount: 140,
      status: 'requested',
      created_at: new Date(Date.now() - 35 * 60 * 1000).toISOString(), // 35 minutes ago
    };

    assert.strictEqual(isStaleRequestedTrip(freshTrip), false, 'Trip under 1 hour must remain active and claimable');
    assert.strictEqual(isTripExpired(freshTrip), false);
  });

  it('expires unclaimed trip requests when they reach 1 hour (60+ minutes old)', () => {
    const expiredTrip: MockTrip = {
      id: 'trip-expired-001',
      rider_id: 'rider-2',
      pickup_location: 'Rosebank Mall, Johannesburg',
      dropoff_location: 'Sandton City',
      fare_amount: 95,
      status: 'requested',
      created_at: new Date(Date.now() - 61 * 60 * 1000).toISOString(), // 61 minutes ago
    };

    assert.strictEqual(isStaleRequestedTrip(expiredTrip), true, 'Trip unclaimed after 1 hour must expire');
    assert.strictEqual(isTripExpired(expiredTrip), true);
  });

  it('never expires trips that have already been accepted, arrived, or in progress regardless of age', () => {
    const claimedTrip: MockTrip = {
      id: 'trip-claimed-old',
      rider_id: 'rider-3',
      driver_id: 'driver-uuid-4',
      pickup_location: 'Durban Beachfront',
      dropoff_location: 'Umhlanga',
      fare_amount: 180,
      status: 'in_progress',
      created_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(), // 90 minutes ago
    };

    assert.strictEqual(isStaleRequestedTrip(claimedTrip), false, 'In-progress trips must never expire');
  });

  it('correctly handles scheduled trips: future rides stay valid, rides scheduled >1hr ago expire', () => {
    const futureScheduledTrip: MockTrip = {
      id: 'trip-sched-future',
      rider_id: 'rider-4',
      pickup_location: 'Menlyn, Pretoria',
      dropoff_location: 'Hatfield',
      fare_amount: 110,
      status: 'requested',
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      scheduled_time: new Date(Date.now() + 45 * 60 * 1000).toISOString(), // 45m in future
    };

    assert.strictEqual(isStaleRequestedTrip(futureScheduledTrip), false, 'Future scheduled rides must not expire');

    const pastScheduledTrip: MockTrip = {
      id: 'trip-sched-past',
      rider_id: 'rider-5',
      pickup_location: 'Menlyn, Pretoria',
      dropoff_location: 'Hatfield',
      fare_amount: 110,
      status: 'requested',
      created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      scheduled_time: new Date(Date.now() - 65 * 60 * 1000).toISOString(), // Scheduled 65m ago and unclaimed
    };

    assert.strictEqual(isStaleRequestedTrip(pastScheduledTrip), true, 'Unclaimed rides scheduled >1hr ago must expire');
  });

  it('filters expired trips out of driver discovery so drivers only see valid unclaimed requests', () => {
    const pool: MockTrip[] = [
      {
        id: 'trip-active-1',
        rider_id: 'r-1',
        pickup_location: 'Point A',
        dropoff_location: 'Point B',
        fare_amount: 100,
        status: 'requested',
        created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(), // 20m old
      },
      {
        id: 'trip-expired-2',
        rider_id: 'r-2',
        pickup_location: 'Point C',
        dropoff_location: 'Point D',
        fare_amount: 120,
        status: 'requested',
        created_at: new Date(Date.now() - 65 * 60 * 1000).toISOString(), // 65m old
      },
    ];

    const availableForDrivers = pool.filter((t) => t.status === 'requested' && !t.driver_id && !isStaleRequestedTrip(t));
    assert.strictEqual(availableForDrivers.length, 1);
    assert.strictEqual(availableForDrivers[0].id, 'trip-active-1');
  });

  it('simulates rider portal handling: clears expired trip, alerts rider to book again', () => {
    let activeRiderTrip: MockTrip | null = {
      id: 'rider-unclaimed-trip',
      rider_id: 'rider-johan',
      pickup_location: 'Centurion Mall',
      dropoff_location: 'Midrand',
      fare_amount: 150,
      status: 'requested',
      created_at: new Date(Date.now() - 62 * 60 * 1000).toISOString(), // 62 minutes ago
    };
    let riderNotice: string | null = null;
    let storedActiveTripId: string | null = 'rider-unclaimed-trip';

    // Verification check runs during trip loading or polling
    if (activeRiderTrip && activeRiderTrip.status === 'requested' && isStaleRequestedTrip(activeRiderTrip)) {
      activeRiderTrip = null;
      storedActiveTripId = null;
      riderNotice = 'Your ride request was not claimed by drivers within 1 hour and has expired. Please book again.';
    }

    assert.strictEqual(activeRiderTrip, null, 'Active trip must be cleared on expiration');
    assert.strictEqual(storedActiveTripId, null, 'Persisted active trip pointer must be cleared');
    assert.match(riderNotice || '', /expired.*book again/i, 'Rider must be instructed to book again');
  });
});
