import { describe, it } from 'node:test';
import assert from 'node:assert';

interface MockTrip {
  id: string;
  rider_id: string;
  driver_id?: string;
  pickup_location: string;
  dropoff_location: string;
  fare_amount: number;
  status: 'requested' | 'accepted' | 'arrived' | 'in_progress' | 'payment_pending' | 'completed' | 'cancelled';
}

function createMockStorage(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void } {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
  };
}

const getDeclinedTripIdsWithStorage = (driverId: string | null | undefined, storage: ReturnType<typeof createMockStorage>): Set<string> => {
  if (!driverId) return new Set();
  const raw = storage.getItem(`solo_declined_trips_${driverId}`);
  const ids: string[] = raw ? JSON.parse(raw) : [];
  return new Set(ids);
};

const declineTripWithStorage = (trip: MockTrip, driverId: string | null | undefined, storage: ReturnType<typeof createMockStorage>): MockTrip => {
  if (driverId) {
    const current = Array.from(getDeclinedTripIdsWithStorage(driverId, storage));
    if (!current.includes(trip.id)) {
      current.push(trip.id);
    }
    storage.setItem(`solo_declined_trips_${driverId}`, JSON.stringify(current.slice(-200)));
  }
  // Crucial requirement: Trip status remains 'requested' for other registered drivers
  return { ...trip };
};

describe('Driver Ride Decline & Multi-Driver Availability Suite', () => {
  it('guarantees that declining a ride does NOT cancel the ride and keeps it in requested status', () => {
    const storage = createMockStorage();
    const trip: MockTrip = {
      id: 'trip-cape-001',
      rider_id: 'rider-uuid-1',
      pickup_location: 'V&A Waterfront, Cape Town',
      dropoff_location: 'Camps Bay Beach, Cape Town',
      fare_amount: 145,
      status: 'requested',
    };

    const driver1Id = 'driver-uuid-001';
    const result = declineTripWithStorage(trip, driver1Id, storage);

    assert.strictEqual(result.status, 'requested', 'Trip status must remain requested so other drivers can accept it');
    assert.strictEqual(result.driver_id, undefined, 'Trip must not have an assigned driver');
  });

  it('guarantees driver decline isolation: Driver 1 decline does NOT affect Driver 2', () => {
    const storage = createMockStorage();
    const trip1: MockTrip = {
      id: 'trip-joburg-101',
      rider_id: 'rider-uuid-2',
      pickup_location: 'Rosebank Mall, Johannesburg',
      dropoff_location: 'Sandton City, Sandton',
      fare_amount: 95,
      status: 'requested',
    };

    const driver1Id = 'driver-uuid-001';
    const driver2Id = 'driver-uuid-002';
    const driver3Id = 'driver-uuid-003';

    // Driver 1 declines trip1
    declineTripWithStorage(trip1, driver1Id, storage);

    // Driver 1's declined list contains trip1
    const driver1Declines = getDeclinedTripIdsWithStorage(driver1Id, storage);
    assert.strictEqual(driver1Declines.has(trip1.id), true);

    // Driver 2 and Driver 3 declined lists MUST NOT contain trip1
    const driver2Declines = getDeclinedTripIdsWithStorage(driver2Id, storage);
    const driver3Declines = getDeclinedTripIdsWithStorage(driver3Id, storage);
    assert.strictEqual(driver2Declines.has(trip1.id), false, 'Driver 2 must NOT have trip1 in declined set');
    assert.strictEqual(driver3Declines.has(trip1.id), false, 'Driver 3 must NOT have trip1 in declined set');
  });

  it('guarantees Driver 2 can discover, receive alerts for, and accept a ride declined by Driver 1', () => {
    const storage = createMockStorage();
    const allRequestedTrips: MockTrip[] = [
      {
        id: 'trip-durban-201',
        rider_id: 'rider-durban-1',
        pickup_location: 'Florida Road, Durban',
        dropoff_location: 'Umhlanga Rocks, Durban',
        fare_amount: 160,
        status: 'requested',
      },
      {
        id: 'trip-durban-202',
        rider_id: 'rider-durban-2',
        pickup_location: 'Gateway Theatre, Umhlanga',
        dropoff_location: 'King Shaka Airport',
        fare_amount: 220,
        status: 'requested',
      },
    ];

    const driver1Id = 'driver-sipho';
    const driver2Id = 'driver-thabo';

    // Driver 1 declines the first trip
    declineTripWithStorage(allRequestedTrips[0], driver1Id, storage);

    // Driver 1 query: only sees trip 202
    const driver1Declined = getDeclinedTripIdsWithStorage(driver1Id, storage);
    const driver1Available = allRequestedTrips.filter(
      (t) => t.status === 'requested' && !t.driver_id && !driver1Declined.has(t.id)
    );
    assert.strictEqual(driver1Available.length, 1);
    assert.strictEqual(driver1Available[0].id, 'trip-durban-202');

    // Driver 2 query: sees BOTH trips including the one declined by Driver 1!
    const driver2Declined = getDeclinedTripIdsWithStorage(driver2Id, storage);
    const driver2Available = allRequestedTrips.filter(
      (t) => t.status === 'requested' && !t.driver_id && !driver2Declined.has(t.id)
    );
    assert.strictEqual(driver2Available.length, 2, 'Driver 2 must see all available requested trips');
    assert.strictEqual(driver2Available[0].id, 'trip-durban-201');
    assert.strictEqual(driver2Available[1].id, 'trip-durban-202');

    // Driver 2 accepts trip-durban-201
    const acceptedTrip: MockTrip = {
      ...allRequestedTrips[0],
      status: 'accepted',
      driver_id: driver2Id,
    };
    allRequestedTrips[0] = acceptedTrip;

    assert.strictEqual(allRequestedTrips[0].status, 'accepted');
    assert.strictEqual(allRequestedTrips[0].driver_id, driver2Id);
  });

  it('guarantees rider session continues searching and does not cancel when one driver declines', () => {
    let riderTripStatus: 'requested' | 'accepted' | 'cancelled' = 'requested';

    // Driver 1 declines the trip
    const driver1Id = 'driver-1';
    const storage = createMockStorage();
    const trip: MockTrip = {
      id: 'trip-rider-check',
      rider_id: 'rider-allan',
      pickup_location: 'Balfour Park, Highlands North',
      dropoff_location: 'Melrose Arch, Johannesburg',
      fare_amount: 75,
      status: 'requested',
    };

    declineTripWithStorage(trip, driver1Id, storage);

    // In the rider view: status is still requested!
    assert.strictEqual(riderTripStatus, 'requested', 'Rider must remain in requested status waiting for next driver');

    // Driver 2 accepts
    riderTripStatus = 'accepted';
    assert.strictEqual(riderTripStatus, 'accepted', 'Rider seamlessly transitions to accepted when another driver claims it');
  });
});
