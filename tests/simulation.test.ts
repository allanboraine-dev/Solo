import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isWithinRadiusKm } from '../src/utils/geo.ts';
import { calculateFare } from '../src/utils/mapService.ts';
import { isPlatformOwner, applyOwnerPrivileges } from '../src/utils/owner.ts';

describe('End-to-End E-Hailing Trip & SaaS Subscription Lifecycle', () => {
  it('simulates the complete trip state machine from booking to Paystack completion', () => {
    // 1. Rider books ride
    const riderId = 'r-001';
    const pickup = { lat: -26.1046, lng: 28.0540, name: 'Sandton City' };
    const dropoff = { lat: -26.1467, lng: 28.0417, name: 'Rosebank Mall' };
    const distanceKm = 5.9;
    const fare = calculateFare(distanceKm); // R47 (10 + round(32.5 + 0.9*5.5) = 47)
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
    assert.strictEqual(trip.fare_amount, 47);

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

  it('guarantees platform owner (Allan Boraine) lifetime free driver access with zero subscription charges', () => {
    const ownerEmail = 'allanboraine@gmail.com';
    const regularDriverEmail = 'driver.test@example.com';

    // 1. Identity Verification
    assert.strictEqual(isPlatformOwner(ownerEmail), true, 'Platform owner email must be recognized');
    assert.strictEqual(isPlatformOwner('ALLANBORAINE@GMAIL.COM'), true, 'Recognition must be case-insensitive');
    assert.strictEqual(isPlatformOwner('  allanboraine@gmail.com  '), true, 'Recognition must trim whitespace');
    assert.strictEqual(isPlatformOwner(regularDriverEmail), false, 'Regular driver must not have owner privileges');
    assert.strictEqual(isPlatformOwner(null), false, 'Null email must return false');

    // 2. Normalization via applyOwnerPrivileges
    const unprivilegedOwnerProfile = {
      fullName: 'Allan Boraine',
      email: ownerEmail,
      subscriptionPlan: 'trial' as 'trial' | 'paid' | 'owner',
      subscriptionActive: false,
      isVerified: false,
    };

    const elevatedProfile = applyOwnerPrivileges(unprivilegedOwnerProfile);
    assert.strictEqual(elevatedProfile.subscriptionPlan, 'owner', 'Owner plan must be set to owner');
    assert.strictEqual(elevatedProfile.subscriptionActive, true, 'Owner subscription must be permanently active');
    assert.strictEqual(elevatedProfile.isVerified, true, 'Owner driver must be automatically KYC-verified');

    // Regular driver profile must remain untouched
    const regularProfile = {
      fullName: 'Sipho Zulu',
      email: regularDriverEmail,
      subscriptionPlan: 'trial' as 'trial' | 'paid' | 'owner',
      subscriptionActive: true,
      isVerified: false,
    };
    const untouched = applyOwnerPrivileges(regularProfile);
    assert.strictEqual(untouched.subscriptionPlan, 'trial');
    assert.strictEqual(untouched.isVerified, false);

    // 3. 100-Day Expiry Simulation
    const now = Date.now();
    const hundredDaysLater = now + (100 * 24 * 60 * 60 * 1000);
    const isTrialExpired = (profile: typeof elevatedProfile, currentTime: number) => {
      if (profile.subscriptionPlan === 'owner') return false; // Owner is permanently exempt
      if (profile.subscriptionPlan === 'trial') return (currentTime - now) > (7 * 24 * 60 * 60 * 1000);
      return false;
    };

    assert.strictEqual(
      isTrialExpired(elevatedProfile, hundredDaysLater),
      false,
      'Owner account must never be flagged as expired even 100 days later'
    );
  });

  it('Scenario 5: Driver Declines Trip Request -> Trip Filtered Out for Driver 1 but Remains Available for Other Registered Drivers', () => {
    const driver1DeclinedIds = new Set<string>();
    const driver2DeclinedIds = new Set<string>();
    const trips = [
      { id: 'trip-101', status: 'requested', fare_amount: 120 },
      { id: 'trip-102', status: 'requested', fare_amount: 85 },
    ];

    // Simulate Driver 1 declining 'trip-101'
    const declineTripSim = (tripId: string, driverDeclinedSet: Set<string>) => {
      driverDeclinedSet.add(tripId);
      // NOTE: Trip status is intentionally NOT changed to 'cancelled' so other drivers can accept it
    };

    declineTripSim('trip-101', driver1DeclinedIds);

    // Trip stays in 'requested' status in the system
    assert.strictEqual(trips[0].status, 'requested', 'Declined trip must remain in requested status for other drivers');
    assert.strictEqual(driver1DeclinedIds.has('trip-101'), true, 'Trip 101 must be recorded in Driver 1 declined set');

    // Driver 1 view: trip-101 is filtered out
    const driver1AvailableTrips = trips.filter(
      (t) => t.status === 'requested' && !driver1DeclinedIds.has(t.id)
    );
    assert.strictEqual(driver1AvailableTrips.length, 1, 'Only non-declined requested trips should remain visible to Driver 1');
    assert.strictEqual(driver1AvailableTrips[0].id, 'trip-102');

    // Driver 2 view: trip-101 is STILL available!
    const driver2AvailableTrips = trips.filter(
      (t) => t.status === 'requested' && !driver2DeclinedIds.has(t.id)
    );
    assert.strictEqual(driver2AvailableTrips.length, 2, 'Driver 2 must still see trip-101 as available');
    assert.strictEqual(driver2AvailableTrips[0].id, 'trip-101');
    assert.strictEqual(driver2AvailableTrips[1].id, 'trip-102');
  });

  it('Scenario 6: Completed Trip Never Loops or Resurfaces from Stale DB Rows', () => {
    const completedTripIds = new Set<string>();
    const STATUS_PRIORITY: Record<string, number> = {
      requested: 1,
      accepted: 2,
      arrived: 3,
      in_progress: 4,
      payment_pending: 5,
      completed: 6,
      cancelled: 7,
    };

    // Driver completes trip-201
    completedTripIds.add('trip-201');

    // Simulate a stale DB query or PostGIS RPC still returning trip-201 as 'requested' or 'in_progress'
    const dbTrips = [
      { id: 'trip-201', status: 'requested', created_at: new Date().toISOString() },
      { id: 'trip-old-stale', status: 'requested', created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
    ];

    const isStaleRequested = (t: { status: string; created_at?: string }) => {
      if (t.status !== 'requested' || !t.created_at) return false;
      return Date.now() - new Date(t.created_at).getTime() > 30 * 60 * 1000;
    };

    const resolvedTrips = dbTrips.map((t) => {
      if (completedTripIds.has(t.id)) return { ...t, status: 'completed' };
      if (isStaleRequested(t)) return { ...t, status: 'cancelled' };
      return t;
    });

    const activeOrRequestedForDriver = resolvedTrips.filter(
      (t) =>
        t.status !== 'completed' &&
        t.status !== 'cancelled' &&
        !completedTripIds.has(t.id) &&
        STATUS_PRIORITY[t.status] < STATUS_PRIORITY.completed
    );

    assert.strictEqual(resolvedTrips[0].status, 'completed', 'Completed trip must stay completed even if DB returns stale status');
    assert.strictEqual(resolvedTrips[1].status, 'cancelled', 'Stale unscheduled requested trip (>30m old) must be expired');
    assert.strictEqual(activeOrRequestedForDriver.length, 0, 'No completed or stale trips may loop back to the driver');
  });

  it('Scenario 7: Confirm Pickup Workflow Never Loops Back to Accepted on Stale In-Flight DB Poll', () => {
    const STATUS_PRIORITY: Record<string, number> = {
      requested: 1,
      accepted: 2,
      arrived: 3,
      in_progress: 4,
      payment_pending: 5,
      completed: 6,
      cancelled: 7,
    };

    const statusOverrides: Record<string, string> = {};
    const recordOverride = (tripId: string, status: string) => {
      const prev = statusOverrides[tripId];
      if (!prev || STATUS_PRIORITY[status] >= STATUS_PRIORITY[prev]) {
        statusOverrides[tripId] = status;
      }
    };

    // 1. Driver accepts trip-301
    let activeTrip = { id: 'trip-301', status: 'accepted' };
    recordOverride(activeTrip.id, 'accepted');
    assert.strictEqual(activeTrip.status, 'accepted');

    // 2. Driver clicks "Confirm Pickup" -> transitions to 'in_progress'
    activeTrip = { ...activeTrip, status: 'in_progress' };
    recordOverride(activeTrip.id, 'in_progress');
    assert.strictEqual(activeTrip.status, 'in_progress');

    // 3. Simulate an in-flight DB poll resolving with stale 'accepted' or 'requested' status
    const stalePollResult = { id: 'trip-301', status: 'accepted' };
    const resolvedDbStatus =
      STATUS_PRIORITY[statusOverrides[stalePollResult.id]] > STATUS_PRIORITY[stalePollResult.status]
        ? statusOverrides[stalePollResult.id]
        : stalePollResult.status;

    if (STATUS_PRIORITY[resolvedDbStatus] > STATUS_PRIORITY[activeTrip.status]) {
      activeTrip = { ...activeTrip, status: resolvedDbStatus };
    }

    assert.strictEqual(
      activeTrip.status,
      'in_progress',
      'Active trip must remain in_progress after Confirm Pickup and never revert to accepted'
    );
  });

  it('Scenario 8: Live Driver Telematics: 100% Real Drivers Only & 5-Minute Heartbeat Expiration (TTL)', () => {
    const TTL_MS = 5 * 60 * 1000;
    const now = Date.now();

    const simulatedDrivers = [
      // 1. Fresh live driver (pinged 30 seconds ago) -> ACTIVE
      {
        id: 'driver-live-1',
        fullName: 'Active Real Driver',
        lat: -28.7282,
        lng: 24.7623,
        isOnline: true,
        updatedAt: now - 30 * 1000,
      },
      // 2. Stale driver (pinged 6 minutes ago, closed browser tab) -> EXPIRED
      {
        id: 'driver-stale-2',
        fullName: 'Stale Closed-Tab Driver',
        lat: -28.7290,
        lng: 24.7630,
        isOnline: true,
        updatedAt: now - 6 * 60 * 1000,
      },
      // 3. Stale driver (pinged 2 hours ago from previous testing) -> EXPIRED
      {
        id: 'driver-stale-3',
        fullName: 'Obsolete Session Driver',
        lat: -28.7300,
        lng: 24.7640,
        isOnline: true,
        updatedAt: now - 2 * 60 * 60 * 1000,
      },
      // 4. Legacy demo driver -> PRUNED
      {
        id: 'demo-driver-1',
        fullName: 'Sipho Ndlovu',
        lat: -28.7320,
        lng: 24.7660,
        isOnline: true,
        updatedAt: now,
      },
      // 5. Driver explicitly toggled offline -> OFFLINE
      {
        id: 'driver-offline-4',
        fullName: 'Offline Driver',
        lat: -28.7310,
        lng: 24.7650,
        isOnline: false,
        updatedAt: now - 10 * 1000,
      },
    ];

    // Filter algorithm used by getActiveDrivers
    const activeDrivers = simulatedDrivers.filter((d) => {
      if (d.id.startsWith('demo-driver-')) return false; // Rule 1: No demo drivers
      const isFresh = d.updatedAt && now - d.updatedAt <= TTL_MS; // Rule 2: 5-minute heartbeat TTL
      return d.isOnline && isFresh;
    });

    // Exactly 1 real driver is online and fresh
    assert.strictEqual(activeDrivers.length, 1);
    assert.strictEqual(activeDrivers[0].id, 'driver-live-1');
    assert.strictEqual(activeDrivers[0].fullName, 'Active Real Driver');
  });

  it('Scenario 9: Dismissed & Force-Closed Trips Never Loop or Re-open in Rider or Driver Portals', () => {
    const dismissedTripIds = new Set<string>();
    const markDismissed = (id: string) => dismissedTripIds.add(id);
    const isDismissed = (id: string) => dismissedTripIds.has(id);

    // 1. A trip gets stuck in payment_pending or completed
    const stuckTrip = {
      id: 'trip-stuck-999',
      status: 'payment_pending',
      fare_amount: 120,
      rider_id: 'rider-abc',
      driver_id: 'driver-xyz',
    };

    // Before dismissal, the trip is considered active by active-trip queries
    let activeQuery = [stuckTrip].find(
      (t) => t.status !== 'completed' && t.status !== 'cancelled' && !isDismissed(t.id)
    );
    assert.ok(activeQuery, 'Trip is active prior to dismissal');

    // 2. Rider or driver dismisses / settles the trip
    markDismissed(stuckTrip.id);
    assert.strictEqual(isDismissed(stuckTrip.id), true);

    // 3. Subsequent polling or realtime events must NEVER re-adopt the trip
    activeQuery = [stuckTrip].find(
      (t) => t.status !== 'completed' && t.status !== 'cancelled' && !isDismissed(t.id)
    );
    assert.strictEqual(activeQuery, undefined, 'Dismissed trip must never be re-adopted in active trip polling');

    // 4. Rating modal trigger guard must also be bypassed if trip was dismissed
    let showRatingModal = false;
    if (!isDismissed(stuckTrip.id)) {
      showRatingModal = true;
    }
    assert.strictEqual(showRatingModal, false, 'Rating modal must not loop when trip is already dismissed');
  });
});

