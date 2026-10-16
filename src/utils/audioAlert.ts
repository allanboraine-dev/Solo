/**
 * SOLO Driver Audio & Haptic Vibration Alerts
 * Synthesizes acoustic alerts via Web Audio API without external file dependencies
 * and triggers physical haptic vibration patterns and native system notifications
 * on mobile devices (allowing users to use their device's native notification tones).
 */

class AudioAlertManager {
  private audioCtx: AudioContext | null = null;

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!this.audioCtx && AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  /**
   * Plays the standard dispatch alert chime (D5 -> A5 -> D6)
   */
  public playTripAlertChime(): void {
    if (typeof window === 'undefined') return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = [
        { freq: 587.33, start: 0.00, dur: 0.14 }, // D5
        { freq: 880.00, start: 0.12, dur: 0.16 }, // A5
        { freq: 1174.66, start: 0.26, dur: 0.40 }, // D6
      ];

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.35, now);
      masterGain.connect(ctx.destination);

      notes.forEach(({ freq, start, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + start);

        gain.gain.setValueAtTime(0.0001, now + start);
        gain.gain.linearRampToValueAtTime(0.5, now + start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(now + start);
        osc.stop(now + start + dur);
      });
    } catch (e) {
      console.warn('[AudioAlert] Web Audio playback failed:', e);
    }
  }

  /**
   * Triggers device vibration pattern on mobile devices: vibrate-pause-vibrate
   */
  public triggerDeviceVibration(): void {
    if (typeof window === 'undefined') return;
    try {
      const nav = window.navigator || (typeof navigator !== 'undefined' ? navigator : null);
      if (nav && 'vibrate' in nav && typeof (nav as any).vibrate === 'function') {
        (nav as any).vibrate([250, 100, 250, 100, 450]);
      }
    } catch {}
  }

  /**
   * Dispatches system/browser notification to the driver,
   * preferring ServiceWorker.showNotification on mobile so the mobile device
   * plays its native configured notification alert sound.
   */
  public async showDriverSystemNotification(trip: {
    id: string;
    pickup_location: string;
    fare_amount: number;
  }): Promise<void> {
    if (typeof window === 'undefined') return;
    const win = window as any;
    if (!win.Notification || win.Notification.permission !== 'granted') return;

    const title = '🚖 New Trip Request!';
    const options: NotificationOptions = {
      body: `R${trip.fare_amount} • Pickup: ${trip.pickup_location}`,
      icon: '/driver-icon-192.png',
      badge: '/icon-192.png',
      tag: `trip-request-${trip.id}`,
      // @ts-expect-error vibrate is supported in modern Push/Notification API
      vibrate: [250, 100, 250, 100, 450],
      renotify: true,
      requireInteraction: true,
      data: {
        url: `/driver?tripId=${trip.id}`,
        tripId: trip.id,
      },
    };

    try {
      const nav = win.navigator;
      if (nav && 'serviceWorker' in nav && nav.serviceWorker?.ready) {
        const registration = await nav.serviceWorker.ready;
        if (registration && typeof registration.showNotification === 'function') {
          await registration.showNotification(title, options);
          return;
        }
      }
    } catch {}

    try {
      if (typeof win.Notification === 'function') {
        new win.Notification(title, options);
      }
    } catch {}
  }

  /**
   * Comprehensive alert combining audio, vibration, and system notification
   */
  public alertDriverOfTrip(trip: {
    id: string;
    pickup_location: string;
    fare_amount: number;
  }): void {
    this.playTripAlertChime();
    this.triggerDeviceVibration();
    this.showDriverSystemNotification(trip);
  }
}

export const audioAlert = new AudioAlertManager();
