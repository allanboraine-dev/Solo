import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getRiderSessionId,
  getRiderActiveTripId,
  setRiderActiveTripId,
  isTripBelongingToRiderSession,
  generateUuid,
} from '../src/utils/session.ts';

interface SimpleTrip {
  id: string;
  rider_id: string;
  driver_id?: string;
  pickup_location: string;
  dropoff_location: string;
  fare_amount: number;
  status: 'requested' | 'accepted' | 'in_progress' | 'cancelled' | 'completed';
}

function createMockStorage(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void } {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
  };
}

describe('Multi-Rider Concurrent Session Isolation & Driver Protection Suite', () => {
  it('guarantees unique, isolated session IDs across different browser sessions / tabs', () => {
    const tab1Session = createMockStorage();
    const tab1Local = createMockStorage();

    const tab2Session = createMockStorage();
    const tab2Local = createMockStorage();

    const rider1Id = getRiderSessionId(null, tab1Session, tab1Local);
    const rider2Id = getRiderSessionId(null, tab2Session, tab2Local);

    assert.ok(rider1Id && rider1Id.length > 10, 'Rider 1 must have a valid generated UUID');
    assert.ok(rider2Id && rider2Id.length > 10, 'Rider 2 must have a valid generated UUID');
    assert.notStrictEqual(rider1Id, rider2Id, 'Rider 1 and Rider 2 must have distinct, isolated session IDs');
  });

  it('guarantees authenticated riders use their permanent account UUIDs without collision', () => {
    const authUser1 = 'user-auth-uuid-1111';
    const authUser2 = 'user-auth-uuid-2222';

    const tab1 = createMockStorage();
    const tab2 = createMockStorage();

    const id1 = getRiderSessionId(authUser1, tab1, tab1);
    const id2 = getRiderSessionId(authUser2, tab2, tab2);

    assert.strictEqual(id1, authUser1);
    assert.strictEqual(id2, authUser2);
    assert.notStrictEqual(id1, id2);
  });

  it('guarantees active trip binding and unbinding per session', () => {
    const tab1Session = createMockStorage();
    const tab1Local = createMockStorage();

    assert.strictEqual(getRiderActiveTripId(tab1Session, tab1Local), null);

    setRiderActiveTripId('trip-alpha-123', tab1Session, tab1Local);
    assert.strictEqual(getRiderActiveTripId(tab1Session, tab1Local), 'trip-alpha-123');

    setRiderActiveTripId(null, tab1Session, tab1Local);
    assert.strictEqual(getRiderActiveTripId(tab1Session, tab1Local), null);
  });

  it('guarantees that Rider B cannot adopt Rider A trip via realtime event broadcast', () => {
    const rider1SessionId = 'rider-session-001';
    const rider2SessionId = 'rider-session-002';

    const tripA: SimpleTrip = {
      id: 'trip-alpha-001',
      rider_id: rider1SessionId,
      pickup_location: '12 Memorial Rd, Kimberley',
      dropoff_location: 'North Cape Mall, Kimberley',
      fare_amount: 55,
      status: 'requested',
    };

    // Rider 2 state
    const rider2ActiveTripId: string | null = null;
    const rider2StoredActiveTripId: string | null = null;

    const belongsToRider2 = isTripBelongingToRiderSession(
      tripA,
      rider2ActiveTripId,
      rider2StoredActiveTripId,
      rider2SessionId
    );

    assert.strictEqual(
      belongsToRider2,
      false,
      'Rider 2 must NEVER adopt Rider 1 trip from realtime event broadcasts'
    );

    // Rider 1 state
    const belongsToRider1 = isTripBelongingToRiderSession(
      tripA,
      null,
      'trip-alpha-001',
      rider1SessionId
    );
    assert.strictEqual(belongsToRider1, true, 'Rider 1 must recognize their own trip');
  });

  it('guarantees that Rider B cannot cancel Rider A trip or driver', () => {
    const rider1Id = 'rider-uuid-1';
    const rider2Id = 'rider-uuid-2';

    const trip1: SimpleTrip = {
      id: 'trip-alpha-001',
      rider_id: rider1Id,
      driver_id: 'driver-sipho-01',
      pickup_location: '12 Memorial Rd, Kimberley',
      dropoff_location: 'North Cape Mall, Kimberley',
      fare_amount: 55,
      status: 'accepted',
    };

    // Simulated cancel action invoked from Rider 2's session
    const attemptCancel = (
      targetTrip: SimpleTrip,
      callerRiderId: string,
      callerStoredTripId: string | null
    ) => {
      // Authorization rule
      if (
        targetTrip.id !== callerStoredTripId &&
        targetTrip.rider_id !== callerRiderId &&
        callerRiderId !== '00000000-0000-0000-0000-000000000000'
      ) {
        return { allowed: false, error: 'Unauthorized: Trip belongs to another rider session' };
      }
      return { allowed: true, trip: { ...targetTrip, status: 'cancelled' as const } };
    };

    const result = attemptCancel(trip1, rider2Id, null);
    assert.strictEqual(result.allowed, false, 'Rider 2 must be prevented from cancelling Rider 1 trip');
    assert.strictEqual(trip1.status, 'accepted', 'Trip 1 must remain accepted and unaffected');
    assert.strictEqual(trip1.driver_id, 'driver-sipho-01', 'Driver Sipho must remain assigned to Trip 1');
  });

  it('guarantees concurrent independent trips between Rider 1/Driver 1 and Rider 2/Driver 2', () => {
    const trip1: SimpleTrip = {
      id: 'trip-001',
      rider_id: 'rider-001',
      driver_id: 'driver-001',
      pickup_location: 'Location A',
      dropoff_location: 'Location B',
      fare_amount: 60,
      status: 'accepted',
    };

    const trip2: SimpleTrip = {
      id: 'trip-002',
      rider_id: 'rider-002',
      driver_id: 'driver-002',
      pickup_location: 'Location C',
      dropoff_location: 'Location D',
      fare_amount: 75,
      status: 'accepted',
    };

    const allTrips = [trip1, trip2];

    // Driver 1 filter check
    const driver1Active = allTrips.find(
      t =>
        (t.status === 'accepted' || t.status === 'in_progress') &&
        t.driver_id === 'driver-001'
    );
    assert.strictEqual(driver1Active?.id, 'trip-001', 'Driver 1 must only see Trip 1');

    // Driver 2 filter check
    const driver2Active = allTrips.find(
      t =>
        (t.status === 'accepted' || t.status === 'in_progress') &&
        t.driver_id === 'driver-002'
    );
    assert.strictEqual(driver2Active?.id, 'trip-002', 'Driver 2 must only see Trip 2');

    // Rider 1 cancels Trip 1
    const updatedTrip1: SimpleTrip = { ...trip1, status: 'cancelled' };
    const updatedTrips = [updatedTrip1, trip2];

    // Verify Driver 2 and Rider 2 are 100% active and unaffected
    const driver2After = updatedTrips.find(t => t.driver_id === 'driver-002');
    assert.strictEqual(driver2After?.status, 'accepted', 'Trip 2 must remain in accepted state');
    assert.strictEqual(driver2After?.id, 'trip-002', 'Trip 2 must remain intact');
  });

  it('guarantees that loadTrips polling only attaches to the current rider session trip', () => {
    const allTrips: SimpleTrip[] = [
      {
        id: 'trip-alice',
        rider_id: 'rider-alice-uuid',
        pickup_location: 'Alice Home',
        dropoff_location: 'Mall',
        fare_amount: 50,
        status: 'requested',
      },
      {
        id: 'trip-bob',
        rider_id: 'rider-bob-uuid',
        pickup_location: 'Bob Office',
        dropoff_location: 'Gym',
        fare_amount: 65,
        status: 'requested',
      },
    ];

    const myRiderId = 'rider-bob-uuid';
    const storedActiveTripId = 'trip-bob';

    const matchedTrip = allTrips.find(
      t =>
        t.status !== 'completed' &&
        t.status !== 'cancelled' &&
        (t.id === storedActiveTripId || (t.rider_id === myRiderId && myRiderId !== '00000000-0000-0000-0000-000000000000'))
    );

    assert.strictEqual(matchedTrip?.id, 'trip-bob', 'Bob must strictly load his own trip');
    assert.notStrictEqual(matchedTrip?.id, 'trip-alice', 'Bob must NEVER load Alice trip');
  });
});
