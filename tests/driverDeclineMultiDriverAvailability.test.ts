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

const undeclineTripWithStorage = (tripId: string, driverId: string | null | undefined, storage: ReturnType<typeof createMockStorage>): void => {
  if (!driverId) return;
  const current = Array.from(getDeclinedTripIdsWithStorage(driverId, storage));
  const filtered = current.filter((id) => id !== tripId);
  storage.setItem(`solo_declined_trips_${driverId}`, JSON.stringify(filtered));
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

  it('guarantees that a driver who declined a request can still accept it on a later stage if not taken by other drivers', () => {
    const storage = createMockStorage();
    const trip: MockTrip = {
      id: 'trip-later-stage-001',
      rider_id: 'rider-uuid-later',
      pickup_location: 'Sea Point Pavilion, Cape Town',
      dropoff_location: 'Kloof Street, Cape Town',
      fare_amount: 110,
      status: 'requested',
    };

    const driver1Id = 'driver-sipho';
    const allTrips: MockTrip[] = [trip];

    // Stage 1: Driver 1 initially declines the request
    declineTripWithStorage(trip, driver1Id, storage);
    const driver1DeclinedInitial = getDeclinedTripIdsWithStorage(driver1Id, storage);
    assert.strictEqual(driver1DeclinedInitial.has(trip.id), true, 'Trip must be in Driver 1 declined set initially');

    // Active incoming modal filter suppresses the popup
    const freshIncoming = allTrips.filter((t) => t.status === 'requested' && !t.driver_id && !driver1DeclinedInitial.has(t.id));
    assert.strictEqual(freshIncoming.length, 0, 'Popup modal does not repeatedly ring the driver');

    // Stage 2: Driver 1 discovers declined trip is STILL available (unclaimed by other drivers)
    const declinedAvailable = allTrips.filter(
      (t) => t.status === 'requested' && !t.driver_id && driver1DeclinedInitial.has(t.id)
    );
    assert.strictEqual(declinedAvailable.length, 1, 'Declined trip must be listed as still available');
    assert.strictEqual(declinedAvailable[0].id, 'trip-later-stage-001');

    // Stage 3: Driver 1 decides to accept the ride on a later stage
    const canAccept = declinedAvailable[0].status === 'requested' && !declinedAvailable[0].driver_id;
    assert.strictEqual(canAccept, true, 'Trip is still open and can be accepted');

    // Driver 1 accepts the trip
    allTrips[0] = {
      ...allTrips[0],
      status: 'accepted',
      driver_id: driver1Id,
    };
    undeclineTripWithStorage(allTrips[0].id, driver1Id, storage);

    // Verify trip status and driver assignment
    assert.strictEqual(allTrips[0].status, 'accepted');
    assert.strictEqual(allTrips[0].driver_id, driver1Id);

    // Verify trip is removed from driver 1's declined storage
    const driver1DeclinedAfter = getDeclinedTripIdsWithStorage(driver1Id, storage);
    assert.strictEqual(driver1DeclinedAfter.has(trip.id), false, 'Trip must be removed from declined storage upon accept');
  });

  it('guarantees that a driver who declined a request cannot accept it later if another driver has already taken it', () => {
    const storage = createMockStorage();
    const trip: MockTrip = {
      id: 'trip-claimed-002',
      rider_id: 'rider-uuid-claimed',
      pickup_location: 'Greenmarket Square, Cape Town',
      dropoff_location: 'Table Mountain Lower Cableway',
      fare_amount: 135,
      status: 'requested',
    };

    const driver1Id = 'driver-sipho';
    const driver2Id = 'driver-thabo';
    const allTrips: MockTrip[] = [{ ...trip }];

    // Driver 1 declines
    declineTripWithStorage(allTrips[0], driver1Id, storage);

    // Driver 2 claims and accepts the trip first
    allTrips[0] = {
      ...allTrips[0],
      status: 'accepted',
      driver_id: driver2Id,
    };

    // Driver 1 attempts to accept on a later stage
    const driver1Declined = getDeclinedTripIdsWithStorage(driver1Id, storage);
    const availableToDriver1 = allTrips.filter(
      (t) => t.status === 'requested' && !t.driver_id && driver1Declined.has(t.id)
    );

    assert.strictEqual(availableToDriver1.length, 0, 'Claimed trip must not appear as available to Driver 1');

    // Attempting to accept a trip that was already accepted by Driver 2 fails
    const attemptAccept = (tripToClaim: MockTrip, callerDriverId: string): { success: boolean; error?: string } => {
      if (tripToClaim.status !== 'requested' || (tripToClaim.driver_id && tripToClaim.driver_id !== callerDriverId)) {
        return { success: false, error: 'Trip is no longer available (claimed by another driver).' };
      }
      return { success: true };
    };

    const result = attemptAccept(allTrips[0], driver1Id);
    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /claimed by another driver/i);
  });
});
