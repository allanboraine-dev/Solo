/**
 * SOLO Mobile-Hardened Audio, Ringtone & Haptic Notification Engine
 *
 * Solves mobile browser (iOS Safari, Android Chrome, Samsung Internet, PWA) silence by:
 *  1. Automatically unlocking a shared singleton AudioContext AND priming an HTMLAudioElement
 *     on the first user touch/click gesture (`touchstart`, `pointerdown`, `click`), plus
 *     explicitly when tapping "Go Online" or "Book Ride".
 *  2. Forcing `navigator.audioSession.type = 'playback'` where supported so iOS/Android
 *     routes alerts through the main media speaker channel instead of the muted ringer channel.
 *  3. Combining a high-output 16-bit PCM Base64 `data:audio/wav;base64,...` HTML5 Audio stream
 *     with a compressed Web Audio API multi-oscillator synthesizer (`triangle` + `square`).
 *  4. Providing a continuous repeating ringtone loop (`startTripRingtoneLoop` / `stopTripRingtoneLoop`)
 *     while a trip request modal is active on screen.
 */

function encodeBufferToBase64Wav(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  if (typeof btoa === 'function') {
    return `data:audio/wav;base64,${btoa(binary)}`;
  }
  if (typeof Buffer !== 'undefined') {
    return `data:audio/wav;base64,${Buffer.from(bytes).toString('base64')}`;
  }
  return '';
}

function buildPcmWavDataUri(
  durationSec: number,
  sampleGenerator: (t: number, sampleRate: number) => number,
  sampleRate = 22050
): string | null {
  try {
    const numSamples = Math.floor(sampleRate * durationSec);
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true);  // Linear PCM
    view.setUint16(22, 1, true);  // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, numSamples * 2, true);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const sample = Math.max(-1, Math.min(1, sampleGenerator(t, sampleRate)));
      view.setInt16(44 + i * 2, Math.floor(sample * 32767), true);
    }

    return encodeBufferToBase64Wav(buffer);
  } catch {
    return null;
  }
}

class AudioAlertManager {
  private audioCtx: AudioContext | null = null;
  private tripChimeWavUri: string | null = null;
  private statusChimeWavUri: string | null = null;
  private sirenWavUri: string | null = null;
  private silentWavUri: string | null = null;
  private sharedAudioEl: HTMLAudioElement | null = null;
  private ringtoneLoopInterval: ReturnType<typeof setInterval> | null = null;
  private sirenLoopInterval: ReturnType<typeof setInterval> | null = null;
  private sirenActive = false;
  private unlocked = false;
  private listenersAttached = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.attachGlobalUnlockListeners();
    }
  }

  private forcePlaybackAudioSession(): void {
    try {
      const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
      if (nav?.audioSession) {
        nav.audioSession.type = 'playback';
      }
    } catch {
      // Ignore if browser does not implement navigator.audioSession
    }
  }

  private attachGlobalUnlockListeners(): void {
    if (typeof window === 'undefined' || this.listenersAttached) return;
    this.listenersAttached = true;

    const events = ['touchstart', 'touchend', 'pointerdown', 'mousedown', 'click', 'keydown'];
    const unlockHandler = () => {
      this.unlockMobileAudio(false);
      if (this.unlocked && this.audioCtx && this.audioCtx.state === 'running') {
        events.forEach((evt) => {
          window.removeEventListener(evt, unlockHandler, { capture: true } as EventListenerOptions);
        });
      }
    };

    events.forEach((evt) => {
      window.addEventListener(evt, unlockHandler, { passive: true, capture: true });
    });
  }

  public getSharedAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      this.forcePlaybackAudioSession();
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if ((!this.audioCtx || (this.audioCtx.state as string) === 'closed') && AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
      if (this.audioCtx && (this.audioCtx.state === 'suspended' || (this.audioCtx.state as string) === 'interrupted')) {
        this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  private getTripChimeWavUri(): string | null {
    if (this.tripChimeWavUri) return this.tripChimeWavUri;
    // Synthesize a loud, unmistakable 1.15-second dual-harmonic dispatch chime (D5 -> A5 -> D6 -> A5 -> D6)
    const notes = [
      { freq: 587.33, start: 0.0, end: 0.18 },   // D5
      { freq: 880.0, start: 0.18, end: 0.36 },   // A5
      { freq: 1174.66, start: 0.36, end: 0.62 }, // D6
      { freq: 880.0, start: 0.66, end: 0.82 },   // A5
      { freq: 1174.66, start: 0.82, end: 1.12 }, // D6
    ];
    this.tripChimeWavUri = buildPcmWavDataUri(1.15, (t) => {
      const active = notes.find((n) => t >= n.start && t <= n.end);
      if (!active) return 0;
      const localT = t - active.start;
      const dur = active.end - active.start;
      const env = Math.min(1, localT / 0.012) * Math.max(0.15, 1 - (localT / dur) * 0.65);
      const p1 = 2 * Math.PI * active.freq * t;
      const fundamental = Math.sin(p1);
      const thirdHarmonic = 0.4 * Math.sin(3 * p1);
      const fifthHarmonic = 0.2 * Math.sin(5 * p1);
      return (fundamental + thirdHarmonic + fifthHarmonic) * 0.78 * env;
    });
    return this.tripChimeWavUri;
  }

  private getStatusChimeWavUri(): string | null {
    if (this.statusChimeWavUri) return this.statusChimeWavUri;
    // Crisp 0.55s two-tone confirmation chime (A5 -> E6)
    const notes = [
      { freq: 880.0, start: 0.0, end: 0.22 },
      { freq: 1318.51, start: 0.22, end: 0.52 },
    ];
    this.statusChimeWavUri = buildPcmWavDataUri(0.55, (t) => {
      const active = notes.find((n) => t >= n.start && t <= n.end);
      if (!active) return 0;
      const localT = t - active.start;
      const dur = active.end - active.start;
      const env = Math.min(1, localT / 0.01) * Math.max(0.1, 1 - (localT / dur) * 0.7);
      const p = 2 * Math.PI * active.freq * t;
      return (Math.sin(p) + 0.35 * Math.sin(3 * p)) * 0.75 * env;
    });
    return this.statusChimeWavUri;
  }

  private getSirenWavUri(): string | null {
    if (this.sirenWavUri) return this.sirenWavUri;
    let phase1 = 0;
    let phase2 = 0;
    const durationSec = 1.2;
    this.sirenWavUri = buildPcmWavDataUri(durationSec, (t, sampleRate) => {
      const half = durationSec / 2;
      const sweep = t < half ? t / half : 1 - (t - half) / half;
      const f1 = 680 + sweep * 820;
      const f2 = 730 + sweep * 840;
      phase1 += (2 * Math.PI * f1) / sampleRate;
      phase2 += (2 * Math.PI * f2) / sampleRate;
      const raw1 = Math.sin(phase1) + 0.5 * Math.sin(3 * phase1) + 0.25 * Math.sin(5 * phase1);
      const raw2 = Math.sin(phase2) >= 0 ? 0.7 : -0.7;
      return (raw1 + raw2) * 0.75;
    });
    return this.sirenWavUri;
  }

  /**
   * Explicitly unlocks mobile Web Audio API and HTML5 Audio on user gesture
   * (e.g., when tapping "Go Online" or "Book Ride").
   */
  public unlockMobileAudio(playConfirmationChime = false): void {
    if (typeof window === 'undefined') return;
    this.forcePlaybackAudioSession();

    const ctx = this.getSharedAudioContext();
    if (ctx) {
      try {
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        // Play 1-frame silent buffer to unlock iOS/Android WebKit AudioContext
        if (!this.unlocked && typeof ctx.createBuffer === 'function' && typeof ctx.createBufferSource === 'function') {
          const buffer = ctx.createBuffer(1, 1, 22050);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start(0);
        }
      } catch {
        // Ignore
      }
    }

    // Prime shared HTMLAudioElement ONLY once during initial unlock so we never interrupt active audio
    if (!this.unlocked && !this.sirenActive && !this.ringtoneLoopInterval) {
      try {
        if (typeof Audio !== 'undefined') {
          if (!this.silentWavUri) {
            this.silentWavUri = buildPcmWavDataUri(0.04, () => 0);
          }
          if (!this.sharedAudioEl && this.silentWavUri) {
            this.sharedAudioEl = new Audio(this.silentWavUri);
            this.sharedAudioEl.volume = 1.0;
            (this.sharedAudioEl as any).playsInline = true;
            const p = this.sharedAudioEl.play();
            if (p && typeof p.catch === 'function') {
              p.catch(() => {});
            }
          }
        }
      } catch {
        // Ignore
      }
    }

    this.unlocked = true;

    if (playConfirmationChime) {
      this.playStatusChime();
    }
  }

  /**
   * Plays a crisp 2-note confirmation/status chime (used when Going Online or when Rider trip status updates)
   */
  public playStatusChime(): void {
    if (typeof window === 'undefined') return;
    if (this.sirenActive) return;
    this.forcePlaybackAudioSession();

    // 1. HTMLAudioElement WAV playback
    try {
      const uri = this.getStatusChimeWavUri();
      if (uri && typeof Audio !== 'undefined') {
        const audio = this.sharedAudioEl || new Audio();
        this.sharedAudioEl = audio;
        audio.loop = false;
        audio.volume = 1.0;
        (audio as any).playsInline = true;
        audio.src = uri;
        const p = audio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
      }
    } catch {
      // Fall through to Web Audio
    }

    // 2. Web Audio API playback
    const ctx = this.getSharedAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.85, now);
      masterGain.connect(ctx.destination);

      const notes = [
        { freq: 880.0, start: 0.0, dur: 0.18 },
        { freq: 1318.51, start: 0.18, dur: 0.28 },
      ];
      notes.forEach(({ freq, start, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + start);
        gain.gain.setValueAtTime(0.001, now + start);
        gain.gain.linearRampToValueAtTime(0.8, now + start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now + start);
        osc.stop(now + start + dur);
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Plays the loud multi-tone dispatch alert chime (D5 -> A5 -> D6 -> A5 -> D6)
   * using BOTH HTML5 PCM WAV and Web Audio API for maximum mobile speaker volume.
   */
  public playTripAlertChime(): void {
    if (typeof window === 'undefined') return;
    if (this.sirenActive) return;
    this.forcePlaybackAudioSession();

    // 1. Play synthesized 16-bit PCM WAV on HTMLAudioElement (pierces mobile media channel)
    try {
      const uri = this.getTripChimeWavUri();
      if (uri && typeof Audio !== 'undefined') {
        const audio = this.sharedAudioEl || new Audio();
        this.sharedAudioEl = audio;
        audio.loop = false;
        audio.volume = 1.0;
        (audio as any).playsInline = true;
        audio.src = uri;
        const p = audio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
      }
    } catch {
      // Fall through to Web Audio API
    }

    // 2. Play High-Gain Web Audio API Dispatch Ringtone
    const ctx = this.getSharedAudioContext();
    if (!ctx) return;

    try {
      const scheduleNotes = () => {
        const now = ctx.currentTime;
        const notes = [
          { freq: 587.33, start: 0.0, dur: 0.16 },  // D5
          { freq: 880.0, start: 0.16, dur: 0.16 },  // A5
          { freq: 1174.66, start: 0.32, dur: 0.26 }, // D6
          { freq: 880.0, start: 0.62, dur: 0.16 },  // A5
          { freq: 1174.66, start: 0.78, dur: 0.34 }, // D6
        ];

        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0.95, now);

        if (typeof ctx.createDynamicsCompressor === 'function') {
          const compressor = ctx.createDynamicsCompressor();
          compressor.threshold.setValueAtTime(-14, now);
          compressor.knee.setValueAtTime(10, now);
          compressor.ratio.setValueAtTime(10, now);
          masterGain.connect(compressor);
          compressor.connect(ctx.destination);
        } else {
          masterGain.connect(ctx.destination);
        }

        notes.forEach(({ freq, start, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          // Triangle + harmonic square cuts through road/cabin noise on small phone speakers
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + start);

          gain.gain.setValueAtTime(0.001, now + start);
          gain.gain.linearRampToValueAtTime(0.9, now + start + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);

          osc.connect(gain);
          gain.connect(masterGain);

          osc.start(now + start);
          osc.stop(now + start + dur);
        });
      };

      if (ctx.state === 'suspended') {
        ctx.resume().then(scheduleNotes).catch(() => {
          scheduleNotes();
        });
      } else {
        scheduleNotes();
      }
    } catch (e) {
      console.warn('[AudioAlert] Web Audio playback failed:', e);
    }
  }

  /**
   * Plays a single 1.2-second high-decibel emergency police siren wail cycle
   * using the EXACT same discrete-note Web Audio architecture as `playTripAlertChime`
   * (guaranteed to play on all mobile WebKit/Blink devices without ramp freezes).
   */
  public playSirenCycle(): void {
    if (typeof window === 'undefined') return;
    this.forcePlaybackAudioSession();

    const ctx = this.getSharedAudioContext();
    if (!ctx) return;

    try {
      const scheduleSirenNotes = () => {
        const now = ctx.currentTime;
        // 16-step ascending & descending piercing police siren wail (680Hz <-> 1520Hz)
        const freqs = [
          680, 790, 900, 1010, 1120, 1240, 1360, 1480,
          1520, 1400, 1280, 1160, 1040, 920, 800, 700,
        ];
        const stepDur = 0.075; // 16 * 0.075s = 1.20s per full cycle

        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(1.0, now);

        if (typeof ctx.createDynamicsCompressor === 'function') {
          const compressor = ctx.createDynamicsCompressor();
          compressor.threshold.setValueAtTime(-10, now);
          compressor.knee.setValueAtTime(6, now);
          compressor.ratio.setValueAtTime(12, now);
          masterGain.connect(compressor);
          compressor.connect(ctx.destination);
        } else {
          masterGain.connect(ctx.destination);
        }

        freqs.forEach((freq, idx) => {
          const start = idx * stepDur;
          const dur = stepDur + 0.012; // Slight overlap for continuous smooth wail

          // Primary sawtooth + secondary detuned square for maximum mobile speaker projection
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();

          osc1.type = 'sawtooth';
          osc2.type = 'square';
          osc1.frequency.setValueAtTime(freq, now + start);
          osc2.frequency.setValueAtTime(freq * 1.05, now + start);

          gain.gain.setValueAtTime(0.01, now + start);
          gain.gain.linearRampToValueAtTime(0.95, now + start + 0.008);
          gain.gain.exponentialRampToValueAtTime(0.05, now + start + dur);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(masterGain);

          osc1.start(now + start);
          osc2.start(now + start);
          osc1.stop(now + start + dur);
          osc2.stop(now + start + dur);
        });
      };

      if (ctx.state === 'suspended') {
        ctx.resume().then(scheduleSirenNotes).catch(() => {
          scheduleSirenNotes();
        });
      } else {
        scheduleSirenNotes();
      }
    } catch (e) {
      console.warn('[AudioAlert] Siren Web Audio cycle failed:', e);
    }
  }

  /**
   * Starts the continuous High-Decibel Emergency Deterrent Siren on mobile & desktop
   */
  public startDeterrentSiren(): boolean {
    if (typeof window === 'undefined') return false;
    if (this.sirenActive) return true;

    this.stopTripRingtoneLoop();
    this.forcePlaybackAudioSession();
    this.sirenActive = true;

    // 1. Start HTMLAudioElement loop using pre-synthesized Base64 PCM WAV on the shared unlocked element
    try {
      const uri = this.getSirenWavUri() || '/siren.wav';
      if (uri && typeof Audio !== 'undefined') {
        const audio = this.sharedAudioEl || new Audio();
        this.sharedAudioEl = audio;
        audio.src = uri;
        audio.loop = true;
        audio.volume = 1.0;
        audio.muted = false;
        (audio as any).playsInline = true;
        const p = audio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
      }
    } catch {
      // Ignore
    }

    // 2. Immediately fire Web Audio discrete siren cycle and repeat every 1.18s
    this.playSirenCycle();
    this.triggerDeviceVibration();

    this.sirenLoopInterval = setInterval(() => {
      if (!this.sirenActive) return;
      this.playSirenCycle();
      this.triggerDeviceVibration();
    }, 1180);

    return true;
  }

  /**
   * Stops the High-Decibel Emergency Deterrent Siren
   */
  public stopDeterrentSiren(): void {
    this.sirenActive = false;
    if (this.sirenLoopInterval) {
      clearInterval(this.sirenLoopInterval);
      this.sirenLoopInterval = null;
    }
    if (this.sharedAudioEl) {
      try {
        this.sharedAudioEl.pause();
        this.sharedAudioEl.loop = false;
        this.sharedAudioEl.currentTime = 0;
      } catch {
        // Ignore
      }
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch {
        // Ignore
      }
    }
  }

  public isDeterrentSirenRunning(): boolean {
    return this.sirenActive;
  }

  /**
   * Starts a continuous repeating dispatch ringtone + vibration loop while a trip request modal is open
   */
  public startTripRingtoneLoop(): void {
    if (typeof window === 'undefined') return;
    this.stopTripRingtoneLoop();
    this.playAlertSequence();
    this.ringtoneLoopInterval = setInterval(() => {
      this.playAlertSequence();
    }, 2600);
  }

  /**
   * Stops the repeating dispatch ringtone loop when the driver accepts, declines, or request expires
   */
  public stopTripRingtoneLoop(): void {
    if (this.ringtoneLoopInterval) {
      clearInterval(this.ringtoneLoopInterval);
      this.ringtoneLoopInterval = null;
    }
    if (!this.sirenActive && this.sharedAudioEl) {
      try {
        this.sharedAudioEl.pause();
        this.sharedAudioEl.currentTime = 0;
      } catch {
        // Ignore
      }
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
        (nav as any).vibrate([300, 120, 300, 120, 500]);
      }
    } catch {}
  }

  /**
   * Plays both the acoustic chime and haptic vibration sequence
   */
  public playAlertSequence(): void {
    this.playTripAlertChime();
    this.triggerDeviceVibration();
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
    passenger_count?: number;
  }): Promise<void> {
    if (typeof window === 'undefined') return;
    const win = window as any;
    if (!win.Notification || win.Notification.permission !== 'granted') return;

    const occupantsText = trip.passenger_count === 2 ? '2 Riders' : '1 Rider';
    const title = '🚖 New SOLO Trip Request!';
    const options: NotificationOptions = {
      body: `R${trip.fare_amount} (${occupantsText}) • Pickup: ${trip.pickup_location}`,
      icon: '/driver-icon-192.png',
      badge: '/icon-192.png',
      tag: `trip-request-${trip.id}`,
      // @ts-expect-error vibrate is supported in modern Push/Notification API
      vibrate: [300, 120, 300, 120, 500],
      renotify: true,
      requireInteraction: true,
      silent: false,
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
   * Dispatches acoustic chime, vibration, and mobile system notification to the Rider
   * whenever their trip status updates (accepted, arrived, completed, cancelled).
   */
  public async alertRiderOfTripStatus(
    status: 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled',
    trip: {
      id: string;
      verification_pin?: string;
      pickup_location?: string;
      fare_amount?: number;
    }
  ): Promise<void> {
    if (typeof window === 'undefined') return;

    // Play loud audio alert + haptic vibration immediately
    if (status === 'arrived' || status === 'accepted') {
      this.playTripAlertChime();
      this.triggerDeviceVibration();
    } else {
      this.playStatusChime();
      this.triggerDeviceVibration();
    }

    const win = window as any;
    if (!win.Notification || win.Notification.permission !== 'granted') return;

    let title = 'SOLO Ride Update';
    let body = 'Your trip status has been updated.';

    if (status === 'accepted') {
      title = '🚗 Driver Accepted Your Ride!';
      body = `Your driver is on the way! Boarding PIN: ${trip.verification_pin || 'Check app'}`;
    } else if (status === 'arrived') {
      title = '📍 Your Driver Has Arrived!';
      body = `Your driver is at pickup. Share PIN ${trip.verification_pin || ''} to start your trip.`;
    } else if (status === 'in_progress') {
      title = '🛡️ Trip Started — En Route';
      body = 'PIN verified! Enjoy your safe ride with SOLO.';
    } else if (status === 'completed') {
      title = '🎉 Trip Completed!';
      body = 'Your trip has ended. Thank you for riding with SOLO!';
    } else if (status === 'cancelled') {
      title = '⚠️ Ride Request Cancelled';
      body = 'Your ride request was cancelled. You can request another ride in the app.';
    }

    const options: NotificationOptions = {
      body,
      icon: '/rider-icon-192.png',
      badge: '/icon-192.png',
      tag: `rider-trip-${status}-${trip.id}`,
      // @ts-expect-error vibrate is supported in modern Push/Notification API
      vibrate: [300, 120, 300, 120, 500],
      renotify: true,
      silent: false,
      data: {
        url: `/rider?tripId=${trip.id}`,
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
    passenger_count?: number;
  }): void {
    this.startTripRingtoneLoop();
    this.showDriverSystemNotification(trip);
  }
}

export const audioAlert = new AudioAlertManager();
