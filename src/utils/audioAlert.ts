/**
 * SOLO Driver Audio & Haptic Vibration Alerts
 * Synthesizes acoustic alerts via Web Audio API without external file dependencies
 * and triggers physical haptic vibration patterns on supported mobile devices.
 */

import { playTone, type ToneId } from './notificationTones.ts';

class AudioAlertManager {
  private audioCtx: AudioContext | null = null;

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
   * Plays the active notification tone (or a specific tone if provided).
   * Supports custom device audio and all built-in presets.
   */
  public playTripAlertChime(specificToneId?: ToneId): void {
    if (typeof window === 'undefined') return;
    try {
      playTone(specificToneId).catch((err) => {
        console.warn('[AudioAlert] Tone playback error, fallback to legacy chime:', err);
        this.playLegacyChime();
      });
    } catch {
      this.playLegacyChime();
    }
  }

  /**
   * Fallback 3-tone ascending alert chime (D5 -> A5 -> D6)
   */
  private playLegacyChime(): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = [
        { freq: 587.33, start: 0.00, dur: 0.12 }, // D5
        { freq: 880.00, start: 0.12, dur: 0.14 }, // A5
        { freq: 1174.66, start: 0.26, dur: 0.35 }, // D6
      ];

      notes.forEach(({ freq, start, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + start);

        gain.gain.setValueAtTime(0, now + start);
        gain.gain.linearRampToValueAtTime(0.28, now + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

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
    if (typeof window !== 'undefined' && 'navigator' in window && 'vibrate' in navigator) {
      try {
        navigator.vibrate([250, 100, 250, 100, 450]);
      } catch {}
    }
  }

  /**
   * Dispatches system/browser notification to the driver,
   * preferring ServiceWorker.showNotification on mobile and falling back to Notification API
   */
  public async showDriverSystemNotification(trip: {
    id: string;
    pickup_location: string;
    fare_amount: number;
  }): Promise<void> {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

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
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        if (registration && 'showNotification' in registration) {
          await registration.showNotification(title, options);
          return;
        }
      }
    } catch {
      // Fall through to window Notification
    }

    try {
      new Notification(title, options);
    } catch {
      // Ignore if browser restricts Notification constructor in current context
    }
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
