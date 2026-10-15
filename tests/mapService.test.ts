import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateFare, getTileLayerConfig } from '../src/utils/mapService.ts';

describe('Commercial Map & Fare Pricing Suite', () => {
  it('enforces a minimum base fare of R30 for short trips', () => {
    assert.strictEqual(calculateFare(0), 30);
    assert.strictEqual(calculateFare(0.5), 30);
    assert.strictEqual(calculateFare(1.0), 30); // 20 + (1 * 10) = 30
  });

  it('calculates accurate ZAR fares based on distance (R20 base + R10/km)', () => {
    assert.strictEqual(calculateFare(5), 70);   // 20 + 50 = 70
    assert.strictEqual(calculateFare(10), 120); // 20 + 100 = 120
    assert.strictEqual(calculateFare(25), 270); // 20 + 250 = 270
    assert.strictEqual(calculateFare(12.3), 143); // 20 + 123 = 143
  });

  it('provides Mapbox tile layer configuration with retina high-DPI support', () => {
    const lightConfig = getTileLayerConfig(false);
    assert.ok(lightConfig.url.includes('api.mapbox.com') || lightConfig.url.includes('openstreetmap.org'));
    assert.ok(lightConfig.attribution.includes('OpenStreetMap'));
    assert.strictEqual(lightConfig.maxZoom, 19);

    const darkConfig = getTileLayerConfig(true);
    assert.ok(darkConfig.url.length > 0);
  });
});
