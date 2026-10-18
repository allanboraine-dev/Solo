import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { audioAlert } from '../src/utils/audioAlert.ts';

describe('Audio & Native Mobile Notification Alert Suite', () => {
  it('executes playTripAlertChime safely in SSR / Node environment', () => {
    assert.doesNotThrow(() => {
      audioAlert.playTripAlertChime();
    });
  });

  it('executes triggerDeviceVibration safely in SSR / Node environment', () => {
    assert.doesNotThrow(() => {
      audioAlert.triggerDeviceVibration();
    });
  });

  it('executes showDriverSystemNotification safely in SSR / Node environment', async () => {
    await assert.doesNotReject(async () => {
      await audioAlert.showDriverSystemNotification({
        id: 'test-trip-123',
        pickup_location: 'Cape Town Station',
        fare_amount: 150,
      });
    });
  });

  it('executes combined alertDriverOfTrip safely in SSR / Node environment', () => {
    assert.doesNotThrow(() => {
      audioAlert.alertDriverOfTrip({
        id: 'test-trip-456',
        pickup_location: 'V&A Waterfront',
        fare_amount: 220,
      });
    });
  });

  it('triggers synthesized Web Audio tones when AudioContext is available in browser context', () => {
    let oscillatorsCreated = 0;
    let gainsCreated = 0;
    const scheduledFrequencies: number[] = [];

    const mockCtx = {
      currentTime: 1.0,
      state: 'running',
      destination: { id: 'destination_node' },
      createGain: () => {
        gainsCreated++;
        return {
          gain: {
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {},
          },
          connect: () => {},
        };
      },
      createOscillator: () => {
        oscillatorsCreated++;
        return {
          type: 'sine',
          frequency: {
            setValueAtTime: (freq: number) => {
              scheduledFrequencies.push(freq);
            },
          },
          connect: () => {},
          start: () => {},
          stop: () => {},
        };
      },
    };

    (globalThis as any).window = {
      AudioContext: function () {
        return mockCtx;
      },
    };

    try {
      (audioAlert as any).audioCtx = null;
      audioAlert.playTripAlertChime();

      assert.ok(oscillatorsCreated >= 3, 'Should schedule melodic notes');
      assert.ok(gainsCreated >= 4, 'Should create note gains and master gain');
      assert.deepStrictEqual(
        scheduledFrequencies.slice(0, 3),
        [587.33, 880.0, 1174.66],
        'Should play D5 -> A5 -> D6 chime progression'
      );
    } finally {
      delete (globalThis as any).window;
      (audioAlert as any).audioCtx = null;
    }
  });

  it('triggers navigator.vibrate with the standard mobile dispatch pattern', () => {
    let vibratePattern: number[] | null = null;
    (globalThis as any).window = {
      navigator: {
        vibrate: (pattern: number[]) => {
          vibratePattern = pattern;
          return true;
        },
      },
    };

    try {
      audioAlert.triggerDeviceVibration();
      assert.deepStrictEqual(
        vibratePattern,
        [300, 120, 300, 120, 500],
        'Must trigger standard dispatch haptic vibration pattern'
      );
    } finally {
      delete (globalThis as any).window;
    }
  });

  it('dispatches system notification via ServiceWorker ready registration', async () => {
    let notifiedTitle = '';
    let notifiedOptions: any = null;

    (globalThis as any).window = {
      Notification: {
        permission: 'granted',
      },
      navigator: {
        serviceWorker: {
          ready: Promise.resolve({
            showNotification: async (title: string, options: any) => {
              notifiedTitle = title;
              notifiedOptions = options;
            },
          }),
        },
      },
    };

    try {
      await audioAlert.showDriverSystemNotification({
        id: 'trip-south-africa-789',
        pickup_location: 'Sandton City, JHB',
        fare_amount: 320,
      });

      assert.ok(notifiedTitle.includes('Trip Request!'));
      assert.ok(notifiedOptions.body.includes('R320'));
      assert.ok(notifiedOptions.body.includes('Sandton City, JHB'));
      assert.strictEqual(notifiedOptions.tag, 'trip-request-trip-south-africa-789');
      assert.strictEqual(notifiedOptions.renotify, true);
    } finally {
      delete (globalThis as any).window;
    }
  });
});
