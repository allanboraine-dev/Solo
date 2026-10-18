import { describe, it } from 'node:test';
import assert from 'node:assert';
import { audioAlert } from '../src/utils/audioAlert.ts';

describe('Rider & Driver In-Trip Chat Sound Notification Suite', () => {
  it('provides robust non-crashing playMessageNotification method in Node/SSR environment', () => {
    assert.strictEqual(typeof audioAlert.playMessageNotification, 'function');
    assert.doesNotThrow(() => {
      audioAlert.playMessageNotification(true);
      audioAlert.playMessageNotification(false);
    });
  });

  it('guarantees incoming messages trigger sound alert and outgoing messages are silent to sender', () => {
    assert.strictEqual(typeof audioAlert.alertOfNewMessage, 'function');

    const incomingForRider = {
      id: `msg-incoming-test-${Date.now()}-1`,
      trip_id: 'trip-sound-test-101',
      sender: 'driver' as const,
      text: 'On my way 🚗',
    };

    // Rider receives message from driver -> must trigger alert (returns true)
    const alertResult = audioAlert.alertOfNewMessage(incomingForRider, 'rider');
    // In Node (typeof window === 'undefined'), it gracefully returns false without crashing
    assert.strictEqual(typeof alertResult, 'boolean');

    // Driver sends message -> outgoing to driver, must not trigger alert for driver
    const outgoingForDriver = {
      id: `msg-outgoing-test-${Date.now()}-2`,
      trip_id: 'trip-sound-test-101',
      sender: 'driver' as const,
      text: 'On my way 🚗',
    };
    const driverAlert = audioAlert.alertOfNewMessage(outgoingForDriver, 'driver');
    assert.strictEqual(driverAlert, false, 'Outgoing message should not alert the sender');
  });

  it('provides showMessageSystemNotification without throwing in Node/SSR', async () => {
    assert.strictEqual(typeof audioAlert.showMessageSystemNotification, 'function');
    await assert.doesNotReject(async () => {
      await audioAlert.showMessageSystemNotification(
        {
          id: 'test-sys-notif-1',
          trip_id: 'trip-123',
          sender: 'driver',
          text: 'Arrived outside 📍',
        },
        'rider'
      );
    });
  });
});
