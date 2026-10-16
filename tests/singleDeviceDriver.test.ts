import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getDriverDeviceId,
  getDriverActiveSession,
  setDriverActiveSession,
  clearDriverActiveSession,
  isDriverSessionPreempted,
} from '../src/utils/session.ts';

function createMockStorage(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void } {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
  };
}

describe('Driver Single-Device Active Concurrency Enforcement Suite', () => {
  it('generates a stable persistent device ID per device/browser', () => {
    const storage1 = createMockStorage();
    const dev1 = getDriverDeviceId(storage1);

    assert.ok(dev1.startsWith('dev-'), 'Device ID must start with dev- prefix');
    assert.ok(dev1.length > 10, 'Device ID must be a non-trivial identifier');

    // Calling again returns the exact same cached device ID
    const dev1Again = getDriverDeviceId(storage1);
    assert.strictEqual(dev1, dev1Again, 'Device ID must persist on the same device');

    // Different device gets a different device ID
    const storage2 = createMockStorage();
    const dev2 = getDriverDeviceId(storage2);
    assert.notStrictEqual(dev1, dev2, 'Different devices must get unique device IDs');
  });

  it('allows Device A to claim active online duty for a driver', () => {
    const sharedStorage = createMockStorage();
    const driverId = 'driver-uuid-001';
    const deviceA = 'dev-phone-device-a';

    // Initially no active session
    const initial = getDriverActiveSession(driverId, sharedStorage);
    assert.strictEqual(initial, null);

    // Device A goes online
    const session = setDriverActiveSession(driverId, deviceA, sharedStorage);
    assert.strictEqual(session.driverId, driverId);
    assert.strictEqual(session.deviceId, deviceA);
    assert.ok(session.timestamp > 0);

    // Verify session state
    const current = getDriverActiveSession(driverId, sharedStorage);
    assert.ok(current);
    assert.strictEqual(current?.deviceId, deviceA);
    assert.strictEqual(isDriverSessionPreempted(driverId, deviceA, sharedStorage), false);
  });

  it('immediately preempts Device A when Device B goes online for the same driver', () => {
    const sharedStorage = createMockStorage();
    const driverId = 'driver-uuid-001';
    const deviceA = 'dev-phone-device-a';
    const deviceB = 'dev-tablet-device-b';

    // 1. Device A is active online
    setDriverActiveSession(driverId, deviceA, sharedStorage);
    assert.strictEqual(isDriverSessionPreempted(driverId, deviceA, sharedStorage), false);
    assert.strictEqual(isDriverSessionPreempted(driverId, deviceB, sharedStorage), true);

    // 2. Driver logs in and toggles online on Device B
    setDriverActiveSession(driverId, deviceB, sharedStorage);

    // 3. Device A is now preempted!
    assert.strictEqual(
      isDriverSessionPreempted(driverId, deviceA, sharedStorage),
      true,
      'Device A must be preempted when Device B goes online'
    );

    // 4. Device B is the active online session
    assert.strictEqual(
      isDriverSessionPreempted(driverId, deviceB, sharedStorage),
      false,
      'Device B must now be the active online session'
    );

    const activeSession = getDriverActiveSession(driverId, sharedStorage);
    assert.strictEqual(activeSession?.deviceId, deviceB);
  });

  it('prevents preempted Device A from wiping out Device B when Device A disconnects/unloads', () => {
    const sharedStorage = createMockStorage();
    const driverId = 'driver-uuid-001';
    const deviceA = 'dev-phone-device-a';
    const deviceB = 'dev-tablet-device-b';

    // Device A went online
    setDriverActiveSession(driverId, deviceA, sharedStorage);

    // Device B took over online duty
    setDriverActiveSession(driverId, deviceB, sharedStorage);

    // Device A shuts down or unloads (beforeunload / teardown) and attempts to clear session
    clearDriverActiveSession(driverId, deviceA, sharedStorage);

    // Device B MUST still be the active online session!
    const activeSession = getDriverActiveSession(driverId, sharedStorage);
    assert.ok(activeSession, 'Active session must NOT be cleared by preempted Device A');
    assert.strictEqual(activeSession?.deviceId, deviceB);
  });

  it('allows active Device B to voluntarily clear its active session when going offline', () => {
    const sharedStorage = createMockStorage();
    const driverId = 'driver-uuid-001';
    const deviceB = 'dev-tablet-device-b';

    setDriverActiveSession(driverId, deviceB, sharedStorage);
    assert.ok(getDriverActiveSession(driverId, sharedStorage));

    // Device B voluntarily switches offline
    clearDriverActiveSession(driverId, deviceB, sharedStorage);

    assert.strictEqual(
      getDriverActiveSession(driverId, sharedStorage),
      null,
      'Active session should be completely cleared when the active device goes offline'
    );
  });

  it('isolates different drivers so one driver logging in does not preempt another driver', () => {
    const sharedStorage = createMockStorage();
    const driver1 = 'driver-111';
    const driver2 = 'driver-222';
    const device1 = 'dev-driver-1';
    const device2 = 'dev-driver-2';

    setDriverActiveSession(driver1, device1, sharedStorage);
    setDriverActiveSession(driver2, device2, sharedStorage);

    assert.strictEqual(isDriverSessionPreempted(driver1, device1, sharedStorage), false);
    assert.strictEqual(isDriverSessionPreempted(driver2, device2, sharedStorage), false);

    const active1 = getDriverActiveSession(driver1, sharedStorage);
    const active2 = getDriverActiveSession(driver2, sharedStorage);

    assert.strictEqual(active1?.deviceId, device1);
    assert.strictEqual(active2?.deviceId, device2);
  });
});
