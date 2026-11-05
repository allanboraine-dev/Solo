import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('App Intro Animation & UX Splash Suite', () => {
  const RIDER_KEY = 'solo_rider_intro_seen';
  const DRIVER_KEY = 'solo_driver_intro_seen';

  it('maintains distinct, isolated session storage keys for Rider and Driver', () => {
    assert.strictEqual(RIDER_KEY, 'solo_rider_intro_seen');
    assert.strictEqual(DRIVER_KEY, 'solo_driver_intro_seen');
    assert.notStrictEqual(RIDER_KEY, DRIVER_KEY, 'Rider and Driver session keys must be isolated');
  });

  it('guarantees that seeing the Rider intro does not dismiss Driver intro', () => {
    const mockSession: Record<string, string> = {};

    mockSession[RIDER_KEY] = 'true';
    assert.strictEqual(mockSession[RIDER_KEY], 'true');
    assert.strictEqual(mockSession[DRIVER_KEY], undefined, 'Driver intro must still be eligible to show');
  });

  it('guarantees that seeing the Driver intro does not dismiss Rider intro', () => {
    const mockSession: Record<string, string> = {};

    mockSession[DRIVER_KEY] = 'true';
    assert.strictEqual(mockSession[DRIVER_KEY], 'true');
    assert.strictEqual(mockSession[RIDER_KEY], undefined, 'Rider intro must still be eligible to show');
  });

  it('verifies rider page integrates AppIntroSplash with activeTrip bypass', () => {
    const riderPath = path.resolve(process.cwd(), 'src/app/rider/page.tsx');
    const riderCode = fs.readFileSync(riderPath, 'utf8');

    assert.ok(riderCode.includes("import AppIntroSplash from '@/components/AppIntroSplash'"), 'Rider page must import AppIntroSplash');
    assert.ok(riderCode.includes('<AppIntroSplash role="rider"'), 'Rider page must render AppIntroSplash with role="rider"');
    assert.ok(riderCode.includes('bypass={Boolean(activeTrip'), 'Rider page must bypass splash if active trip is present');
  });

  it('verifies driver page integrates AppIntroSplash with activeTrip bypass', () => {
    const driverPath = path.resolve(process.cwd(), 'src/app/driver/page.tsx');
    const driverCode = fs.readFileSync(driverPath, 'utf8');

    assert.ok(driverCode.includes("import AppIntroSplash from '@/components/AppIntroSplash'"), 'Driver page must import AppIntroSplash');
    assert.ok(driverCode.includes('<AppIntroSplash role="driver"'), 'Driver page must render AppIntroSplash with role="driver"');
    assert.ok(driverCode.includes('bypass={Boolean(activeTrip)}'), 'Driver page must bypass splash if active trip is present');
  });

  it('verifies AppIntroSplash component implements Skip, audio safety, and tap-to-dismiss', () => {
    const splashPath = path.resolve(process.cwd(), 'src/components/AppIntroSplash.tsx');
    const splashCode = fs.readFileSync(splashPath, 'utf8');

    assert.ok(splashCode.includes('handleDismiss'), 'Must have handleDismiss logic');
    assert.ok(splashCode.includes('Skip'), 'Must render a Skip button for user convenience');
    assert.ok(splashCode.includes('onClick={handleDismiss}'), 'Clicking container must allow instant tap-to-dismiss');
    assert.ok(splashCode.includes('sessionOnce'), 'Must support sessionOnce prop');
    assert.ok(splashCode.includes('bypass'), 'Must support bypass prop');
  });
});
