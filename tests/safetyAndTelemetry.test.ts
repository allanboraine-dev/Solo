import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  AdaptiveTelemetryGovernor,
  calculateBearingDegrees,
  selectOptimalTelemetryTier,
} from '../src/utils/telemetryEngine.ts';
import {
  SA_EMERGENCY_HOTLINES,
  generateSafetyIncidentCode,
  buildGoogleMapsPinUrl,
  buildWhatsAppEmergencySosUrl,
  triggerRapidResponseSos,
} from '../src/utils/safetyDispatch.ts';
import {
  encodeGeohash,
  SoloLocationEngine,
} from '../src/lib/solo_realtime_and_ride_service.ts';

describe('SOLO Adaptive WebSocket Telemetry & SA Rapid-Response Safety Suite', () => {
  it('exposes subscribeToNearbyDrivers on SoloLocationEngine and guards encodeGeohash against NaN', () => {
    assert.strictEqual(typeof SoloLocationEngine.prototype.subscribeToNearbyDrivers, 'function');
    const validHash = encodeGeohash(-26.1076, 28.0567, 6);
    assert.strictEqual(validHash.length, 6);
    const nanHash = encodeGeohash(Number.NaN, Number.NaN, 6);
    assert.strictEqual(nanHash.length, 6);
  });

  it('selects ACTIVE_TRIP_HIGH_PRECISION tier (3s WS) during active rides', () => {
    const tier = selectOptimalTelemetryTier({
      hasActiveTrip: true,
      speedKmh: 45,
      stationaryDurationMs: 0,
      battery: { level: 0.85, charging: false, isLowBattery: false },
    });
    assert.strictEqual(tier.tier, 'ACTIVE_TRIP_HIGH_PRECISION');
    assert.strictEqual(tier.wsBroadcastIntervalMs, 3_000);
    assert.strictEqual(tier.dbSyncIntervalMs, 15_000);
  });

  it('switches to PARKED_ECO tier (30s keep-alive) when driver is stationary >= 45s to prevent battery drain', () => {
    const tier = selectOptimalTelemetryTier({
      hasActiveTrip: false,
      speedKmh: 0,
      stationaryDurationMs: 50_000,
      battery: { level: 0.75, charging: false, isLowBattery: false },
    });
    assert.strictEqual(tier.tier, 'PARKED_ECO');
    assert.strictEqual(tier.wsBroadcastIntervalMs, 30_000);
    assert.strictEqual(tier.enableHighAccuracy, false);
  });

  it('enforces BATTERY_SAVER tier when battery <= 20% and unplugged', () => {
    const tier = selectOptimalTelemetryTier({
      hasActiveTrip: true,
      speedKmh: 60,
      stationaryDurationMs: 0,
      battery: { level: 0.15, charging: false, isLowBattery: true },
    });
    assert.strictEqual(tier.tier, 'BATTERY_SAVER');
    assert.strictEqual(tier.wsBroadcastIntervalMs, 8_000);
    assert.strictEqual(tier.enableHighAccuracy, false);
  });

  it('rate-limits redundant WebSocket & DB transmissions inside AdaptiveTelemetryGovernor', () => {
    const gov = new AdaptiveTelemetryGovernor();
    const t0 = 1_700_000_000_000;

    // First tick at Sandton (-26.1076, 28.0567) -> must broadcast WS & sync DB immediately
    const tick1 = gov.evaluateGpsTick({
      lat: -26.1076,
      lng: 28.0567,
      hasActiveTrip: true,
      now: t0,
    });
    assert.strictEqual(tick1.shouldBroadcastWs, true);
    assert.strictEqual(tick1.shouldSyncDb, true);

    // Second tick 1 second later -> must suppress both WS and DB to save battery & serverless CPU
    const tick2 = gov.evaluateGpsTick({
      lat: -26.1075,
      lng: 28.0568,
      hasActiveTrip: true,
      now: t0 + 1_000,
    });
    assert.strictEqual(tick2.shouldBroadcastWs, false);
    assert.strictEqual(tick2.shouldSyncDb, false);

    // Third tick 3.5 seconds after t0 -> WS broadcasts (3s threshold), DB still throttled (<15s)
    const tick3 = gov.evaluateGpsTick({
      lat: -26.1070,
      lng: 28.0575,
      hasActiveTrip: true,
      now: t0 + 3_500,
    });
    assert.strictEqual(tick3.shouldBroadcastWs, true);
    assert.strictEqual(tick3.shouldSyncDb, false);
  });

  it('computes accurate compass bearing between two WGS84 coordinates', () => {
    // Due North movement
    const northBearing = calculateBearingDegrees(-26.2041, 28.0473, -26.1041, 28.0473);
    assert.ok(northBearing === 0 || northBearing === 360);

    // Due East movement
    const eastBearing = calculateBearingDegrees(-26.2041, 28.0473, -26.2041, 28.1473);
    assert.ok(eastBearing >= 88 && eastBearing <= 92);
  });

  it('validates South African Rapid-Response hotlines and SOS WhatsApp beacon payload', async () => {
    const numbers = SA_EMERGENCY_HOTLINES.map((h) => h.number);
    assert.ok(numbers.includes('10111'), 'Must include SAPS Flying Squad 10111');
    assert.ok(numbers.includes('112'), 'Must include SA Mobile SOS 112');
    assert.ok(numbers.includes('082911'), 'Must include Netcare 911');
    assert.ok(numbers.includes('084124'), 'Must include ER24');
    assert.ok(numbers.includes('10177'), 'Must include Provincial EMS 10177');

    const code = generateSafetyIncidentCode();
    assert.match(code, /^SOS-ZA-\d{6}$/);

    let broadcasted: any = null;
    const incident = await triggerRapidResponseSos(
      {
        role: 'rider',
        category: 'armed_response',
        silentDuress: false,
        userName: 'Thabo Mokoena',
        userPhone: '+27821234567',
        lat: -26.1076,
        lng: 28.0567,
        tripId: '00000000-0000-4000-8000-000000000123',
        pickupLocation: 'Sandton Gautrain Station',
        dropoffLocation: 'Rosebank Mall',
        driverName: 'Sipho Ndlovu',
        vehicleMake: 'Toyota',
        vehicleModel: 'Corolla Cross',
        licensePlate: 'GP 849-210',
        verificationPin: '4829',
      },
      (inc) => {
        broadcasted = inc;
      }
    );

    assert.ok(broadcasted, 'Must broadcast incident over Realtime mesh callback');
    assert.strictEqual(incident.licensePlate, 'GP 849-210');
    assert.strictEqual(
      incident.googleMapsUrl,
      buildGoogleMapsPinUrl(-26.1076, 28.0567)
    );

    const waUrl = buildWhatsAppEmergencySosUrl(incident, '0829998888');
    assert.ok(waUrl.startsWith('https://wa.me/27829998888?text='));
    const decoded = decodeURIComponent(waUrl);
    assert.ok(decoded.includes(incident.incidentCode));
    assert.ok(decoded.includes('GP 849-210'));
    assert.ok(decoded.includes('maps.google.com'));
  });
});
