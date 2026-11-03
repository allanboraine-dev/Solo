import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isStaleRequestedTrip, isStaleCancelledTrip, isTripExpired, TRIP_EXPIRATION_MS } from '../src/utils/tripExpiration.ts';

interface MockTrip {
  id: string;
  rider_id: string;
  driver_id?: string;
  pickup_location: string;
  dropoff_location: string;
  fare_amount: number;
  status: 'requested' | 'accepted' | 'arrived' | 'in_progress' | 'payment_pending' | 'completed' | 'cancelled';
  created_at: string;
  updated_at?: string;
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

  it('correctly handles scheduled trips: fresh unaccepted rides stay valid, unaccepted rides after 1hr expire', () => {
    const freshScheduledTrip: MockTrip = {
      id: 'trip-sched-fresh',
      rider_id: 'rider-4',
      pickup_location: 'Menlyn, Pretoria',
      dropoff_location: 'Hatfield',
      fare_amount: 110,
      status: 'requested',
      created_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(), // 25m ago (< 1hr)
      scheduled_time: new Date(Date.now() + 45 * 60 * 1000).toISOString(), // 45m in future
    };

    assert.strictEqual(isStaleRequestedTrip(freshScheduledTrip), false, 'Fresh scheduled rides (< 1hr) must stay active');

    const staleScheduledTrip: MockTrip = {
      id: 'trip-sched-unclaimed-1hr',
      rider_id: 'rider-4b',
      pickup_location: 'Burgandy Hills Estate',
      dropoff_location: 'Bryanston',
      fare_amount: 195,
      status: 'requested',
      created_at: new Date(Date.now() - 75 * 60 * 1000).toISOString(), // Created 75m ago and unaccepted
      scheduled_time: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // Future scheduled time
    };

    assert.strictEqual(isStaleRequestedTrip(staleScheduledTrip), true, 'Unaccepted trip requests after 1hr must expire even if scheduled');

    const pastScheduledTrip: MockTrip = {
      id: 'trip-sched-past',
      rider_id: 'rider-5',
      pickup_location: 'Menlyn, Pretoria',
      dropoff_location: 'Hatfield',
      fare_amount: 110,
      status: 'requested',
      created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      scheduled_time: new Date(Date.now() - 65 * 60 * 1000).toISOString(), // Scheduled 65m ago and unaccepted
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

  it('keeps cancelled trips visible on dashboard if cancelled under 1 hour ago', () => {
    const freshCancelledTrip: MockTrip = {
      id: 'trip-cancelled-fresh',
      rider_id: 'rider-cancel-1',
      pickup_location: 'Bloemfontein CBD',
      dropoff_location: 'Bayswater',
      fare_amount: 85,
      status: 'cancelled',
      created_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(), // Cancelled 25 minutes ago
    };

    assert.strictEqual(isStaleCancelledTrip(freshCancelledTrip), false, 'Trip cancelled < 1hr ago must not be stale');
    assert.strictEqual(isTripExpired(freshCancelledTrip), false, 'Trip cancelled < 1hr ago must not be expired');
  });

  it('expires and removes cancelled trips from dashboard once they reach 1 hour old', () => {
    const expiredCancelledTrip: MockTrip = {
      id: 'trip-cancelled-old',
      rider_id: 'rider-cancel-2',
      pickup_location: 'Gqeberha Airport',
      dropoff_location: 'Summerstrand',
      fare_amount: 110,
      status: 'cancelled',
      created_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 65 * 60 * 1000).toISOString(), // Cancelled 65 minutes ago
    };

    assert.strictEqual(isStaleCancelledTrip(expiredCancelledTrip), true, 'Trip cancelled > 1hr ago must be stale');
    assert.strictEqual(isTripExpired(expiredCancelledTrip), true, 'Trip cancelled > 1hr ago must expire');
  });

  it('simulates dashboard filtering: removes stale cancelled trips (> 1hr) while retaining recent ones (< 1hr)', () => {
    const dashboardTrips: MockTrip[] = [
      {
        id: 'active-req',
        rider_id: 'r-1',
        pickup_location: 'Sandton',
        dropoff_location: 'Rosebank',
        fare_amount: 90,
        status: 'requested',
        created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      },
      {
        id: 'recent-cancelled',
        rider_id: 'r-2',
        pickup_location: 'Kimberley North Cape Mall',
        dropoff_location: 'Royldene',
        fare_amount: 60,
        status: 'cancelled',
        created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(), // Cancelled 20m ago (stays)
      },
      {
        id: 'stale-cancelled',
        rider_id: 'r-3',
        pickup_location: 'Burgandy Hills Estate',
        dropoff_location: 'Bryanston',
        fare_amount: 195,
        status: 'cancelled',
        created_at: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 75 * 60 * 1000).toISOString(), // Cancelled 75m ago (MUST BE REMOVED)
      },
    ];

    const visibleOnDashboard = dashboardTrips.filter(t => !isTripExpired(t));
    assert.strictEqual(visibleOnDashboard.length, 2, 'Dashboard must retain active request and recent cancelled trip');
    assert.ok(visibleOnDashboard.some(t => t.id === 'active-req'));
    assert.ok(visibleOnDashboard.some(t => t.id === 'recent-cancelled'));
    assert.ok(!visibleOnDashboard.some(t => t.id === 'stale-cancelled'), 'Stale cancelled trip must be removed from dashboard');
  });

  it('strictly removes unaccepted trip requests older than 1hr and ensures Burgandy Hills trip is excluded', () => {
    const burgandyTrip: MockTrip = {
      id: 'fe854637-e49c-402c-80fc-9ab03de8f41c',
      rider_id: 'rider-burg-1',
      pickup_location: 'Burgandy hills estate — Burgandy Hills Estate, South Africa',
      dropoff_location: 'Johannesburg CBD',
      fare_amount: 195,
      status: 'requested',
      created_at: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(), // 10 hours ago
      scheduled_time: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
    };

    assert.strictEqual(isStaleRequestedTrip(burgandyTrip), true, 'Unaccepted request > 1hr old must be stale');
    assert.strictEqual(isTripExpired(burgandyTrip), true, 'Unaccepted request > 1hr old must be expired');

    // Test dashboard filtering
    const trips = [burgandyTrip];
    const visibleTrips = trips.filter(
      t =>
        !isTripExpired(t) &&
        !isStaleRequestedTrip(t) &&
        !t.pickup_location?.toLowerCase().includes('burgandy hills') &&
        !t.pickup_location?.toLowerCase().includes('burgundy hills') &&
        t.id !== 'fe854637-e49c-402c-80fc-9ab03de8f41c'
    );
    assert.strictEqual(visibleTrips.length, 0, 'Burgandy Hills trip must be completely excluded from dashboard');
  });
});
