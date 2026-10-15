import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateDistanceKm, calculateDistanceMeters, isWithinRadiusKm, estimateEtaMinutes } from '../src/utils/geo.ts';

describe('Geospatial & Haversine Distance Suite', () => {
  // Coordinates for Cape Town CBD and Camps Bay
  const capeTownCbd = { lat: -33.9249, lng: 18.4241 };
  const campsBay = { lat: -33.9511, lng: 18.3789 };

  // Coordinates for Sandton and Rosebank (Johannesburg)
  const sandton = { lat: -26.1046, lng: 28.0540 };
  const rosebank = { lat: -26.1467, lng: 28.0417 };

  it('calculates zero distance for identical coordinates', () => {
    const dist = calculateDistanceKm(sandton.lat, sandton.lng, sandton.lat, sandton.lng);
    assert.strictEqual(dist, 0);
  });

  it('calculates realistic distance between Cape Town CBD and Camps Bay (~5-7 km)', () => {
    const dist = calculateDistanceKm(capeTownCbd.lat, capeTownCbd.lng, campsBay.lat, campsBay.lng);
    assert.ok(dist >= 4.5 && dist <= 6.5, `Expected distance between 4.5 and 6.5 km, got ${dist}`);
  });

  it('calculates distance in meters correctly', () => {
    const km = calculateDistanceKm(sandton.lat, sandton.lng, rosebank.lat, rosebank.lng);
    const meters = calculateDistanceMeters(sandton.lat, sandton.lng, rosebank.lat, rosebank.lng);
    assert.strictEqual(meters, Math.round(km * 1000));
  });

  it('correctly matches within radius (15 km driver dispatch)', () => {
    // Rosebank is ~4.8 km from Sandton -> within 15 km
    const isNearby = isWithinRadiusKm(sandton.lat, sandton.lng, rosebank.lat, rosebank.lng, 15);
    assert.strictEqual(isNearby, true);

    // Pretoria CBD is ~50 km from Sandton -> outside 15 km
    const pretoria = { lat: -25.7479, lng: 28.2293 };
    const isFar = isWithinRadiusKm(sandton.lat, sandton.lng, pretoria.lat, pretoria.lng, 15);
    assert.strictEqual(isFar, false);
  });

  it('estimates driving ETA accurately', () => {
    // 10 km at 35 km/h urban speed -> ~17 mins
    const eta10km = estimateEtaMinutes(10, 35);
    assert.strictEqual(eta10km, 17);

    // 0 km should return at least 1 min
    const eta0km = estimateEtaMinutes(0);
    assert.strictEqual(eta0km, 1);
  });
});
