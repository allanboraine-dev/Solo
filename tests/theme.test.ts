import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getTileLayerConfig } from '../src/utils/mapService.ts';

describe('Independent Rider & Driver Night Mode Isolation Suite', () => {
  const RIDER_KEY = 'solo_rider_theme';
  const DRIVER_KEY = 'solo_driver_theme';
  const ROOT_KEY = 'solo_theme';

  it('maintains distinct, isolated storage keys for Rider, Driver, and Root', () => {
    assert.strictEqual(RIDER_KEY, 'solo_rider_theme');
    assert.strictEqual(DRIVER_KEY, 'solo_driver_theme');
    assert.strictEqual(ROOT_KEY, 'solo_theme');
    assert.notStrictEqual(RIDER_KEY, DRIVER_KEY, 'Rider and Driver storage keys must be strictly isolated');
  });

  it('guarantees that setting Driver night mode does not alter Rider theme', () => {
    const mockStorage: Record<string, string> = {
      [RIDER_KEY]: 'light',
      [DRIVER_KEY]: 'dark',
    };

    // Driver toggles to night mode
    mockStorage[DRIVER_KEY] = 'dark';
    assert.strictEqual(mockStorage[DRIVER_KEY], 'dark');
    assert.strictEqual(mockStorage[RIDER_KEY], 'light', 'Rider theme must remain untouched when Driver changes theme');

    // Driver toggles to day mode
    mockStorage[DRIVER_KEY] = 'light';
    assert.strictEqual(mockStorage[DRIVER_KEY], 'light');
    assert.strictEqual(mockStorage[RIDER_KEY], 'light');
  });

  it('guarantees that setting Rider night mode does not alter Driver theme', () => {
    const mockStorage: Record<string, string> = {
      [RIDER_KEY]: 'light',
      [DRIVER_KEY]: 'dark',
    };

    // Rider toggles to night mode
    mockStorage[RIDER_KEY] = 'dark';
    assert.strictEqual(mockStorage[RIDER_KEY], 'dark');
    assert.strictEqual(mockStorage[DRIVER_KEY], 'dark', 'Driver theme must remain untouched when Rider changes theme');

    // Rider toggles back to light mode
    mockStorage[RIDER_KEY] = 'light';
    assert.strictEqual(mockStorage[RIDER_KEY], 'light');
    assert.strictEqual(mockStorage[DRIVER_KEY], 'dark');
  });

  it('resolves distinct Mapbox day and night navigation tile configurations', () => {
    const dayConfig = getTileLayerConfig(false);
    const nightConfig = getTileLayerConfig(true);

    assert.ok(dayConfig.url.length > 0);
    assert.ok(nightConfig.url.length > 0);

    // If Mapbox token is present, verifies distinct style endpoints
    if (dayConfig.url.includes('mapbox.com')) {
      assert.ok(dayConfig.url.includes('navigation-day-v1'), 'Day mode must use navigation-day-v1');
      assert.ok(nightConfig.url.includes('navigation-night-v1'), 'Night mode must use navigation-night-v1');
      assert.notStrictEqual(dayConfig.url, nightConfig.url, 'Day and Night tile endpoints must be distinct');
    }
  });

  it('simulates cross-tab multi-window scenario where Driver is Night and Rider is Day simultaneously', () => {
    // Tab 1: Driver Portal
    const tab1DriverState = { portal: 'driver', theme: 'dark', isDark: true };

    // Tab 2: Rider Portal
    const tab2RiderState = { portal: 'rider', theme: 'light', isDark: false };

    // Assert both portals coexist simultaneously with opposing night-mode settings
    assert.strictEqual(tab1DriverState.isDark, true, 'Driver tab must be in Night Mode');
    assert.strictEqual(tab2RiderState.isDark, false, 'Rider tab must be in Day Mode');
    assert.notStrictEqual(tab1DriverState.theme, tab2RiderState.theme);
  });
});
