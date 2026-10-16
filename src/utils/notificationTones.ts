/**
 * SOLO Notification & Alert Tone Manager
 * Generates self-contained PCM WAV Data URIs for instant, zero-latency preset playback
 * across all mobile browsers (iOS Safari, Android Chrome, WebViews).
 * Also supports custom device audio uploaded by the user with IndexedDB & localStorage persistence.
 */

export type ToneId = 'default' | 'radar' | 'cash' | 'urgent' | 'bell' | 'chime_bright' | 'custom';

export interface ToneOption {
  id: ToneId;
  name: string;
  description: string;
  badge?: string;
  isCustom?: boolean;
}

export const PRESET_TONES: ToneOption[] = [
  {
    id: 'default',
    name: 'SOLO Harmony (Default)',
    description: 'Crisp 3-tone ascending chime (D5 → A5 → D6)',
    badge: 'Popular',
  },
  {
    id: 'radar',
    name: 'Radar Sonar Ping',
    description: 'High-tech double sonar sweep for fast dispatch detection',
    badge: 'Electronic',
  },
  {
    id: 'cash',
    name: 'Cash Register Payday',
    description: 'Bright metallic bell chime celebrating direct 100% fare retention',
    badge: 'Rewarding',
  },
  {
    id: 'urgent',
    name: 'Priority Dispatch Siren',
    description: 'Pulsating energetic attention-grabber for noisy vehicle environments',
    badge: 'High Volume',
  },
  {
    id: 'bell',
    name: 'Hotel Reception Bell',
    description: 'Clear, resonant metallic desk chime with long decay',
    badge: 'Subtle',
  },
  {
    id: 'chime_bright',
    name: 'Staccato Sparkle',
    description: 'Four rapid playful chime notes for a modern smartphone feel',
    badge: 'Modern',
  },
  {
    id: 'custom',
    name: 'Device Audio',
    description: 'Custom sound chosen directly from your phone or computer storage',
    badge: 'My Audio',
    isCustom: true,
  },
];

const DB_NAME = 'solo_audio_db';
const DB_VERSION = 1;
const STORE_NAME = 'custom_tones';
const CUSTOM_TONE_KEY = 'user_device_tone';

const STORAGE_KEYS = {
  SELECTED_TONE: 'solo_selected_tone',
  CUSTOM_TONE_NAME: 'solo_custom_tone_name',
  CUSTOM_TONE_SIZE: 'solo_custom_tone_size',
  CUSTOM_TONE_MIME: 'solo_custom_tone_mime',
  CUSTOM_TONE_DATA_FALLBACK: 'solo_custom_tone_b64',
  VOLUME: 'solo_tone_volume',
};

// ==========================================
// Base64 & WAV Audio Synthesis
// ==========================================

function bufferToBase64(buffer: ArrayBuffer): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Builds a valid 16-bit Mono PCM WAV file Data URI from floating-point samples.
 */
function generateWavDataUri(sampleRate: number, samples: Float32Array): string {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // RIFF Chunk
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + samples.length * 2, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"

  // Format Chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate (sampleRate * 1 * 2)
  view.setUint16(32, 2, true); // BlockAlign (1 * 2)
  view.setUint16(34, 16, true); // BitsPerSample (16 bits)

  // Data Chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return 'data:audio/wav;base64,' + bufferToBase64(buffer);
}

const presetWavCache: Partial<Record<ToneId, string>> = {};

/**
 * Synthesizes pure PCM waveform audio for built-in presets.
 */
export function getPresetWavDataUri(preset: ToneId): string {
  if (presetWavCache[preset]) {
    return presetWavCache[preset]!;
  }

  const sampleRate = 22050;
  let uri = '';

  switch (preset) {
    case 'radar': {
      // 2 sharp high-tech sonar pings
      const duration = 0.5;
      const numSamples = Math.floor(sampleRate * duration);
      const samples = new Float32Array(numSamples);

      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        let s = 0;
        // Ping 1: 0.00s to 0.18s @ 1200Hz
        if (t < 0.18) {
          const env = Math.exp(-t * 22);
          s += Math.sin(2 * Math.PI * 1200 * t) * env * 0.7;
        }
        // Ping 2: 0.20s to 0.45s @ 1600Hz
        if (t >= 0.20 && t < 0.45) {
          const dt = t - 0.20;
          const env = Math.exp(-dt * 18);
          s += Math.sin(2 * Math.PI * 1600 * dt) * env * 0.8;
        }
        samples[i] = s;
      }
      uri = generateWavDataUri(sampleRate, samples);
      break;
    }

    case 'cash': {
      // Metallic cash register "Cha-Ching"
      const duration = 0.65;
      const numSamples = Math.floor(sampleRate * duration);
      const samples = new Float32Array(numSamples);

      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        let s = 0;
        // First chime note: 987.77 Hz (B5) at 0.0s
        if (t < 0.20) {
          const env1 = Math.exp(-t * 18);
          s += Math.sin(2 * Math.PI * 987.77 * t) * env1 * 0.55;
        }
        // Second chime note: 1318.51 Hz (E6) at 0.07s
        if (t >= 0.07) {
          const dt = t - 0.07;
          const env2 = Math.exp(-dt * 8);
          s += Math.sin(2 * Math.PI * 1318.51 * dt) * env2 * 0.6;
          // Harmonic shimmer B6: 1975.53 Hz
          s += Math.sin(2 * Math.PI * 1975.53 * dt) * env2 * 0.3;
        }
        samples[i] = s;
      }
      uri = generateWavDataUri(sampleRate, samples);
      break;
    }

    case 'urgent': {
      // 4 rapid alternating high-priority dispatch beeps
      const duration = 0.48;
      const numSamples = Math.floor(sampleRate * duration);
      const samples = new Float32Array(numSamples);

      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        let s = 0;
        const segment = Math.floor(t / 0.11);
        const subT = t % 0.11;
        if (segment < 4 && subT < 0.09) {
          const freq = segment % 2 === 0 ? 880 : 1150;
          const sine = Math.sin(2 * Math.PI * freq * t);
          const env = Math.exp(-subT * 12);
          s = sine * env * 0.65;
        }
        samples[i] = s;
      }
      uri = generateWavDataUri(sampleRate, samples);
      break;
    }

    case 'bell': {
      // Resonant reception desk bell with rich natural decay
      const duration = 0.85;
      const numSamples = Math.floor(sampleRate * duration);
      const samples = new Float32Array(numSamples);

      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const env1 = Math.exp(-t * 5);
        const env2 = Math.exp(-t * 7);
        const env3 = Math.exp(-t * 12);

        const s =
          Math.sin(2 * Math.PI * 1046.5 * t) * env1 * 0.55 +
          Math.sin(2 * Math.PI * 2093.0 * t) * env2 * 0.28 +
          Math.sin(2 * Math.PI * 3135.96 * t) * env3 * 0.12;

        samples[i] = s;
      }
      uri = generateWavDataUri(sampleRate, samples);
      break;
    }

    case 'chime_bright': {
      // Upbeat 4-note ascending staccato arpeggio (C5 -> E5 -> G5 -> C6)
      const duration = 0.65;
      const numSamples = Math.floor(sampleRate * duration);
      const samples = new Float32Array(numSamples);
      const notes = [
        { freq: 523.25, start: 0.00, dur: 0.12 },
        { freq: 659.25, start: 0.09, dur: 0.12 },
        { freq: 783.99, start: 0.18, dur: 0.14 },
        { freq: 1046.50, start: 0.27, dur: 0.35 },
      ];

      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        let s = 0;
        for (const n of notes) {
          if (t >= n.start && t < n.start + n.dur) {
            const dt = t - n.start;
            const env = Math.exp(-dt * 14);
            s += Math.sin(2 * Math.PI * n.freq * dt) * env * 0.6;
          }
        }
        samples[i] = s;
      }
      uri = generateWavDataUri(sampleRate, samples);
      break;
    }

    case 'default':
    default: {
      // Classic 3-tone ascending alert chime (D5 -> A5 -> D6)
      const duration = 0.70;
      const numSamples = Math.floor(sampleRate * duration);
      const samples = new Float32Array(numSamples);
      const notes = [
        { freq: 587.33, start: 0.00, dur: 0.16 }, // D5
        { freq: 880.00, start: 0.12, dur: 0.18 }, // A5
        { freq: 1174.66, start: 0.26, dur: 0.42 }, // D6
      ];

      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        let s = 0;
        for (const n of notes) {
          if (t >= n.start && t < n.start + n.dur) {
            const dt = t - n.start;
            const env = Math.exp(-dt * 10);
            s += (Math.sin(2 * Math.PI * n.freq * dt) + 0.15 * Math.sin(4 * Math.PI * n.freq * dt)) * env * 0.55;
          }
        }
        samples[i] = s;
      }
      uri = generateWavDataUri(sampleRate, samples);
      break;
    }
  }

  presetWavCache[preset] = uri;
  return uri;
}

// ==========================================
// IndexedDB & Storage
// ==========================================

function openToneDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB unavailable'));
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeCustomAudioInDb(dataUrl: string): Promise<void> {
  try {
    const db = await openToneDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(dataUrl, CUSTOM_TONE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    if (typeof localStorage !== 'undefined' && dataUrl.length < 3 * 1024 * 1024) {
      try {
        localStorage.setItem(STORAGE_KEYS.CUSTOM_TONE_DATA_FALLBACK, dataUrl);
      } catch {}
    }
  }
}

async function getCustomAudioFromDb(): Promise<string | null> {
  try {
    const db = await openToneDb();
    const result = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(CUSTOM_TONE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (result) return result;
  } catch {}

  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(STORAGE_KEYS.CUSTOM_TONE_DATA_FALLBACK);
  }
  return null;
}

async function deleteCustomAudioFromDb(): Promise<void> {
  try {
    const db = await openToneDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(CUSTOM_TONE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}

  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEYS.CUSTOM_TONE_DATA_FALLBACK);
  }
}

// ==========================================
// Public Tone Preferences
// ==========================================

export function getSelectedTone(): ToneId {
  if (typeof localStorage === 'undefined') return 'default';
  const saved = localStorage.getItem(STORAGE_KEYS.SELECTED_TONE) as ToneId | null;
  if (saved && PRESET_TONES.some((t) => t.id === saved)) {
    return saved;
  }
  return 'default';
}

export function setSelectedTone(toneId: ToneId): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.SELECTED_TONE, toneId);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('solo_tone_changed', { detail: { toneId } }));
  }
}

export function getCustomToneMeta(): { name: string; size: number; mimeType: string } | null {
  if (typeof localStorage === 'undefined') return null;
  const name = localStorage.getItem(STORAGE_KEYS.CUSTOM_TONE_NAME);
  const size = Number(localStorage.getItem(STORAGE_KEYS.CUSTOM_TONE_SIZE) || 0);
  const mimeType = localStorage.getItem(STORAGE_KEYS.CUSTOM_TONE_MIME) || 'audio/mpeg';

  if (!name) return null;
  return { name, size, mimeType };
}

export function getToneVolume(): number {
  if (typeof localStorage === 'undefined') return 0.85;
  const saved = localStorage.getItem(STORAGE_KEYS.VOLUME);
  if (saved !== null) {
    const parsed = parseFloat(saved);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) return parsed;
  }
  return 0.85;
}

export function setToneVolume(volume: number): void {
  if (typeof localStorage === 'undefined') return;
  const clamped = Math.max(0, Math.min(1, volume));
  localStorage.setItem(STORAGE_KEYS.VOLUME, clamped.toString());
}

export async function saveCustomToneFile(file: File): Promise<{ success: boolean; error?: string; name: string }> {
  const MAX_SIZE_BYTES = 10 * 1024 * 1024;
  if (file.size > MAX_SIZE_BYTES) {
    return { success: false, error: 'File is too large. Please select an audio file under 10MB.', name: file.name };
  }

  const isAudioType = (file.type && file.type.startsWith('audio/')) || /\.(mp3|wav|ogg|m4a|aac|weba|flac)$/i.test(file.name);
  if (!isAudioType) {
    return { success: false, error: 'Please choose a valid audio file (e.g., MP3, WAV, OGG, M4A, AAC).', name: file.name };
  }

  if (typeof FileReader === 'undefined') {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.CUSTOM_TONE_NAME, file.name);
      localStorage.setItem(STORAGE_KEYS.CUSTOM_TONE_SIZE, file.size.toString());
      localStorage.setItem(STORAGE_KEYS.CUSTOM_TONE_MIME, file.type || 'audio/mpeg');
      setSelectedTone('custom');
    }
    return { success: true, name: file.name };
  }

  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file from device'));
      reader.readAsDataURL(file);
    });

    await storeCustomAudioInDb(dataUrl);
    cachedCustomAudioUrl = dataUrl;

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.CUSTOM_TONE_NAME, file.name);
      localStorage.setItem(STORAGE_KEYS.CUSTOM_TONE_SIZE, file.size.toString());
      localStorage.setItem(STORAGE_KEYS.CUSTOM_TONE_MIME, file.type || 'audio/mpeg');
    }
    setSelectedTone('custom');

    return { success: true, name: file.name };
  } catch (err: any) {
    console.error('[NotificationTones] saveCustomToneFile error:', err);
    return { success: false, error: err.message || 'Could not save audio file.', name: file.name };
  }
}

export async function removeCustomTone(): Promise<void> {
  cachedCustomAudioUrl = null;
  await deleteCustomAudioFromDb();
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEYS.CUSTOM_TONE_NAME);
    localStorage.removeItem(STORAGE_KEYS.CUSTOM_TONE_SIZE);
    localStorage.removeItem(STORAGE_KEYS.CUSTOM_TONE_MIME);
  }
  setSelectedTone('default');
}

// ==========================================
// Playback Engine: Dual-Engine (Persistent Media HTML5 Audio + Web Audio Synth)
// ==========================================

let sharedAudioCtx: AudioContext | null = null;
let isAudioUnlocked = false;
let persistentAudio: HTMLAudioElement | null = null;
let cachedCustomAudioUrl: string | null = null;

export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxClass) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtxClass();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

export function getPersistentAudioElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!persistentAudio) {
    try {
      persistentAudio = new Audio();
      persistentAudio.preload = 'auto';
      (persistentAudio as any).playsInline = true;
    } catch {
      return null;
    }
  }
  return persistentAudio;
}

/**
 * Proactively unlocks mobile audio restrictions on user gestures.
 * Primes both the shared Web Audio context and persistent media audio element.
 */
export function unlockAudio(): void {
  if (typeof window === 'undefined') return;

  try {
    const ctx = getSharedAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  } catch {}

  if (!isAudioUnlocked) {
    isAudioUnlocked = true;
    try {
      const audio = getPersistentAudioElement();
      if (audio) {
        audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
        audio.volume = 0.001;
        const p = audio.play();
        if (p !== undefined) {
          p.then(() => {
            if (audio) {
              audio.pause();
              audio.currentTime = 0;
            }
          }).catch(() => {
            isAudioUnlocked = false;
          });
        }
      }
    } catch {}
  }
}

// Auto-attach unlock listeners on any early touch or interaction
if (typeof window !== 'undefined') {
  const unlockEvents = ['touchstart', 'touchend', 'click', 'keydown', 'pointerdown'];
  const handleUserGesture = () => {
    unlockAudio();
    unlockEvents.forEach((ev) => window.removeEventListener(ev, handleUserGesture));
  };
  unlockEvents.forEach((ev) => {
    try {
      window.addEventListener(ev, handleUserGesture, { passive: true, once: true });
    } catch {}
  });
}

/**
 * Native, zero-latency Web Audio API synthesis for all built-in presets.
 * Direct node connection to the destination audio graph guarantees 100% audible playback
 * with no base64 overhead, no decodeAudioData failures, and immunity from garbage collection.
 */
export function playPresetWithWebAudio(ctx: AudioContext, preset: ToneId, volume: number): void {
  const now = (ctx.currentTime || 0) + 0.03; // Lookahead scheduling prevents hardware buffer quantum drop
  const masterGain = ctx.createGain();
  const clampedVol = Math.max(0, Math.min(1, volume));
  masterGain.gain.setValueAtTime(clampedVol, now);
  masterGain.connect(ctx.destination);

  switch (preset) {
    case 'radar': {
      // 2 sharp high-tech sonar pings
      const pings = [
        { start: 0.00, dur: 0.16, f1: 1200, f2: 1050 },
        { start: 0.18, dur: 0.22, f1: 1600, f2: 1450 },
      ];
      pings.forEach(({ start, dur, f1, f2 }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f1, now + start);
        osc.frequency.exponentialRampToValueAtTime(f2, now + start + dur);

        gain.gain.setValueAtTime(0.0001, now + start);
        gain.gain.linearRampToValueAtTime(0.55, now + start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now + start);
        osc.stop(now + start + dur);
      });
      break;
    }

    case 'cash': {
      // Metallic cash register "Cha-Ching"
      const osc1 = ctx.createOscillator();
      const g1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(987.77, now); // B5
      g1.gain.setValueAtTime(0.5, now);
      g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc1.connect(g1);
      g1.connect(masterGain);
      osc1.start(now);
      osc1.stop(now + 0.18);

      [1318.51, 1975.53].forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + 0.07);
        g.gain.setValueAtTime(idx === 0 ? 0.6 : 0.3, now + 0.07);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
        osc.connect(g);
        g.connect(masterGain);
        osc.start(now + 0.07);
        osc.stop(now + 0.55);
      });
      break;
    }

    case 'urgent': {
      // 4 rapid alternating high-priority dispatch beeps
      for (let i = 0; i < 4; i++) {
        const start = i * 0.11;
        const dur = 0.09;
        const freq = i % 2 === 0 ? 880 : 1150;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + start);

        gain.gain.setValueAtTime(0.0001, now + start);
        gain.gain.linearRampToValueAtTime(0.5, now + start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now + start);
        osc.stop(now + start + dur);
      }
      break;
    }

    case 'bell': {
      // Service desk bell with rich natural decay
      [
        { freq: 1046.50, vol: 0.55, decay: 0.8 },
        { freq: 2093.00, vol: 0.28, decay: 0.5 },
        { freq: 3135.96, vol: 0.12, decay: 0.3 },
      ].forEach(({ freq, vol, decay }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + decay);
      });
      break;
    }

    case 'chime_bright': {
      // Staccato sparkle arpeggio (C5 -> E5 -> G5 -> C6)
      const notes = [
        { freq: 523.25, start: 0.00, dur: 0.12 },
        { freq: 659.25, start: 0.09, dur: 0.12 },
        { freq: 783.99, start: 0.18, dur: 0.14 },
        { freq: 1046.50, start: 0.27, dur: 0.35 },
      ];
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
      break;
    }

    case 'default':
    default: {
      // SOLO Harmony (D5 -> A5 -> D6)
      const notes = [
        { freq: 587.33, start: 0.00, dur: 0.16 }, // D5
        { freq: 880.00, start: 0.12, dur: 0.18 }, // A5
        { freq: 1174.66, start: 0.26, dur: 0.45 }, // D6
      ];
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
      break;
    }
  }
}

/**
 * Plays the specified tone (or active user selection) with reliable audible playback.
 * Dual-Engine strategy:
 * 1. Primary: Persistent HTML5 Audio element on media playback channel (audible on mobile silent/vibrate)
 * 2. Secondary/Fallback: Native Web Audio API synthesis for zero latency and hardware-level robustness
 */
export async function playTone(toneId?: ToneId): Promise<void> {
  if (typeof window === 'undefined') return;

  unlockAudio();

  const resolvedId: ToneId = toneId || getSelectedTone();
  const volume = getToneVolume();

  // Resolve audio payload
  let audioSrc: string | null = null;
  if (resolvedId === 'custom') {
    if (cachedCustomAudioUrl) {
      audioSrc = cachedCustomAudioUrl;
    } else {
      audioSrc = await getCustomAudioFromDb();
      if (audioSrc) cachedCustomAudioUrl = audioSrc;
    }
  }

  // If custom audio is missing or preset requested, resolve 16-bit PCM WAV data URI
  if (!audioSrc) {
    audioSrc = getPresetWavDataUri(resolvedId === 'custom' ? 'default' : resolvedId);
  }

  // 1. Primary: Play via persistent HTMLAudioElement (runs on media channel, audible even when phone is on silent/vibrate)
  let htmlAudioPlayed = false;
  const audio = getPersistentAudioElement();
  if (audio && audioSrc) {
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.src = audioSrc;
      audio.volume = Math.max(0, Math.min(1, volume));
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        await playPromise;
        htmlAudioPlayed = true;
      }
    } catch (err) {
      console.warn('[NotificationTones] Persistent HTML Audio playback blocked or failed, using Web Audio synth fallback:', err);
    }
  }

  // 2. Secondary/Fallback: If HTML audio was blocked or failed to play, synthesize via Web Audio
  if (!htmlAudioPlayed && resolvedId !== 'custom') {
    const ctx = getSharedAudioContext();
    if (ctx) {
      try {
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        playPresetWithWebAudio(ctx, resolvedId, volume);
      } catch (err) {
        console.warn('[NotificationTones] Web Audio synthesis fallback error:', err);
      }
    }
  }
}
