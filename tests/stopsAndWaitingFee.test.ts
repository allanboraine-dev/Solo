import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STOP_SURCHARGE_ZAR,
  PICKUP_GRACE_PERIOD_SECONDS,
  WAITING_FEE_PER_MINUTE_ZAR,
  calculateMultiStopDistanceKm,
  calculateTripWithStopsAdjustment,
  calculatePickupWaitingFare,
  type TripStop,
} from '../src/utils/mapService.ts';

describe('Multi-Stop Automatic Fare Adjustment & 2-Minute Pickup Grace Period', () => {
  const pickup = { lat: -28.7282, lng: 24.7623 }; // Kimberley CBD
  const dropoff = { lat: -28.7582, lng: 24.7823 }; // Diamond Pavilion Mall

  it('calculates multi-stop route distance accurately when stops are added', () => {
    const directDist = calculateMultiStopDistanceKm(pickup, dropoff, []);
    const stop1: TripStop = {
      id: 'stop-1',
      address: 'North Cape Mall, Memorial Rd',
      lat: -28.741,
      lng: 24.752,
      addedBy: 'rider',
    };
    const stop2: TripStop = {
      id: 'stop-2',
      address: 'Gariep Mediclinic, MacDougall St',
      lat: -28.765,
      lng: 24.768,
      addedBy: 'driver',
    };

    const oneStopDist = calculateMultiStopDistanceKm(pickup, dropoff, [stop1]);
    const twoStopDist = calculateMultiStopDistanceKm(pickup, dropoff, [stop1, stop2]);

    assert.ok(directDist > 0);
    assert.ok(oneStopDist >= directDist, 'Adding a detour stop should increase or equal route distance');
    assert.ok(twoStopDist > oneStopDist, 'Adding a second detour stop should increase route distance further');
  });

  it('automatically increases trip fare when a rider or driver adds 1 or more stops', () => {
    const atTime = new Date('2026-11-05T11:00:00'); // Midday Saver

    const noStopsCalc = calculateTripWithStopsAdjustment({
      pickup,
      dropoff,
      stops: [],
      occupantCount: 1,
      atTime,
    });

    const riderStop: TripStop = {
      id: 'stop-rider-1',
      address: 'Pick n Pay Royldene',
      lat: -28.718,
      lng: 24.775,
      addedBy: 'rider',
    };

    const oneStopCalc = calculateTripWithStopsAdjustment({
      pickup,
      dropoff,
      stops: [riderStop],
      occupantCount: 1,
      atTime,
    });

    const driverStop: TripStop = {
      id: 'stop-driver-2',
      address: 'Engen QuickShop Memorial Rd',
      lat: -28.749,
      lng: 24.761,
      addedBy: 'driver',
    };

    const twoStopsCalc = calculateTripWithStopsAdjustment({
      pickup,
      dropoff,
      stops: [riderStop, driverStop],
      occupantCount: 1,
      atTime,
    });

    assert.equal(noStopsCalc.stopsCount, 0);
    assert.equal(noStopsCalc.stopsAdjustmentZar, 0);
    assert.equal(noStopsCalc.finalTotalFareZar, noStopsCalc.directBaseFareZar);

    assert.equal(oneStopCalc.stopsCount, 1);
    assert.equal(oneStopCalc.breakdown.stopSurchargeZar, STOP_SURCHARGE_ZAR);
    assert.ok(
      oneStopCalc.finalTotalFareZar >= noStopsCalc.finalTotalFareZar + STOP_SURCHARGE_ZAR,
      '1 stop should increase the fare by at least the stop surcharge + detour distance'
    );
    assert.ok(oneStopCalc.stopsAdjustmentZar >= STOP_SURCHARGE_ZAR);

    assert.equal(twoStopsCalc.stopsCount, 2);
    assert.equal(twoStopsCalc.breakdown.stopSurchargeZar, STOP_SURCHARGE_ZAR * 2);
    assert.ok(
      twoStopsCalc.finalTotalFareZar > oneStopCalc.finalTotalFareZar,
      '2 stops should have a higher total fare than 1 stop'
    );
  });

  it('preserves accrued pickup waiting fee when stops are added or removed mid-trip', () => {
    const atTime = new Date('2026-11-05T14:00:00');
    const stop: TripStop = {
      id: 'stop-1',
      address: 'Shoprite Kimberley',
      lat: -28.735,
      lng: 24.765,
      addedBy: 'driver',
    };

    const withoutWaiting = calculateTripWithStopsAdjustment({
      pickup,
      dropoff,
      stops: [stop],
      waitingFeeZar: 0,
      atTime,
    });

    const withWaiting = calculateTripWithStopsAdjustment({
      pickup,
      dropoff,
      stops: [stop],
      waitingFeeZar: 6,
      atTime,
    });

    assert.equal(withWaiting.finalTotalFareZar, withoutWaiting.finalTotalFareZar + 6);
  });

  it('gives the rider a 2-minute (120s) grace period when driver arrives at pickup before increasing the price', () => {
    assert.equal(PICKUP_GRACE_PERIOD_SECONDS, 120);
    const arrivedAt = new Date('2026-11-05T10:00:00.000Z');
    const agreedFare = 45;

    // At 0 seconds
    const atArrival = calculatePickupWaitingFare(agreedFare, arrivedAt, new Date('2026-11-05T10:00:00.000Z').getTime());
    assert.equal(atArrival.isGracePeriodExpired, false);
    assert.equal(atArrival.remainingGraceSeconds, 120);
    assert.equal(atArrival.waitingFeeZar, 0);
    assert.equal(atArrival.adjustedTotalFareZar, 45);
    assert.equal(atArrival.formattedCountdown, '02:00');

    // At 90 seconds (1 min 30s) -> still inside 2-minute grace period
    const at90s = calculatePickupWaitingFare(agreedFare, arrivedAt, new Date('2026-11-05T10:01:30.000Z').getTime());
    assert.equal(at90s.isGracePeriodExpired, false);
    assert.equal(at90s.remainingGraceSeconds, 30);
    assert.equal(at90s.waitingFeeZar, 0);
    assert.equal(at90s.adjustedTotalFareZar, 45);
    assert.equal(at90s.formattedCountdown, '00:30');

    // At exactly 120 seconds (2 min 00s) -> grace boundary, still R0 increase
    const at120s = calculatePickupWaitingFare(agreedFare, arrivedAt, new Date('2026-11-05T10:02:00.000Z').getTime());
    assert.equal(at120s.isGracePeriodExpired, false);
    assert.equal(at120s.remainingGraceSeconds, 0);
    assert.equal(at120s.waitingFeeZar, 0);
    assert.equal(at120s.adjustedTotalFareZar, 45);
  });

  it('automatically increases the agreed trip price once the 2-minute pickup grace period expires', () => {
    const arrivedAt = new Date('2026-11-05T10:00:00.000Z');
    const agreedFare = 45;

    // 121 seconds (1 second past the 2-minute grace period) -> 1st overtime minute started (+R2)
    const at121s = calculatePickupWaitingFare(agreedFare, arrivedAt, new Date('2026-11-05T10:02:01.000Z').getTime());
    assert.equal(at121s.isGracePeriodExpired, true);
    assert.equal(at121s.remainingGraceSeconds, 0);
    assert.equal(at121s.overtimeSeconds, 1);
    assert.equal(at121s.overtimeMinutesBilled, 1);
    assert.equal(at121s.waitingFeeZar, WAITING_FEE_PER_MINUTE_ZAR);
    assert.equal(at121s.adjustedTotalFareZar, agreedFare + WAITING_FEE_PER_MINUTE_ZAR);

    // 185 seconds (3 min 05s total -> 65s overtime -> 2 overtime minutes charged -> +R4)
    const at185s = calculatePickupWaitingFare(agreedFare, arrivedAt, new Date('2026-11-05T10:03:05.000Z').getTime());
    assert.equal(at185s.isGracePeriodExpired, true);
    assert.equal(at185s.overtimeSeconds, 65);
    assert.equal(at185s.overtimeMinutesBilled, 2);
    assert.equal(at185s.waitingFeeZar, WAITING_FEE_PER_MINUTE_ZAR * 2);
    assert.equal(at185s.adjustedTotalFareZar, agreedFare + WAITING_FEE_PER_MINUTE_ZAR * 2);
  });
});
