/**
 * SOLO Notification & Alert Tone Manager
 * Supports Web Audio synthesized presets and custom device audio uploaded by the user.
 * Persists custom audio files using IndexedDB with localStorage fallback.
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
    description: 'Crisp 3-tone ascending alert (D5 → A5 → D6)',
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

// IndexedDB Helper
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
    console.warn('[NotificationTones] IndexedDB put failed, attempting localStorage fallback:', err);
    if (typeof window !== 'undefined' && dataUrl.length < 3 * 1024 * 1024) {
      try {
        localStorage.setItem(STORAGE_KEYS.CUSTOM_TONE_DATA_FALLBACK, dataUrl);
      } catch (localErr) {
        console.warn('[NotificationTones] localStorage fallback also failed:', localErr);
      }
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
  } catch (err) {
    // Fall back to localStorage
  }

  if (typeof window !== 'undefined') {
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

/**
 * Returns the currently active Tone ID.
 */
export function getSelectedTone(): ToneId {
  if (typeof localStorage === 'undefined') return 'default';
  const saved = localStorage.getItem(STORAGE_KEYS.SELECTED_TONE) as ToneId | null;
  if (saved && PRESET_TONES.some(t => t.id === saved)) {
    return saved;
  }
  return 'default';
}

/**
 * Updates the active tone ID.
 */
export function setSelectedTone(toneId: ToneId): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.SELECTED_TONE, toneId);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('solo_tone_changed', { detail: { toneId } }));
  }
}

/**
 * Gets metadata about the uploaded custom device tone (if any).
 */
export function getCustomToneMeta(): { name: string; size: number; mimeType: string } | null {
  if (typeof localStorage === 'undefined') return null;
  const name = localStorage.getItem(STORAGE_KEYS.CUSTOM_TONE_NAME);
  const size = Number(localStorage.getItem(STORAGE_KEYS.CUSTOM_TONE_SIZE) || 0);
  const mimeType = localStorage.getItem(STORAGE_KEYS.CUSTOM_TONE_MIME) || 'audio/mpeg';

  if (!name) return null;
  return { name, size, mimeType };
}

/**
 * Returns saved alert volume (0.0 to 1.0).
 */
export function getToneVolume(): number {
  if (typeof localStorage === 'undefined') return 0.85;
  const saved = localStorage.getItem(STORAGE_KEYS.VOLUME);
  if (saved !== null) {
    const parsed = parseFloat(saved);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) return parsed;
  }
  return 0.85;
}

/**
 * Sets alert volume (0.0 to 1.0).
 */
export function setToneVolume(volume: number): void {
  if (typeof localStorage === 'undefined') return;
  const clamped = Math.max(0, Math.min(1, volume));
  localStorage.setItem(STORAGE_KEYS.VOLUME, clamped.toString());
}

/**
 * Saves a custom audio file selected by the user from their device.
 */
export async function saveCustomToneFile(file: File): Promise<{ success: boolean; error?: string; name: string }> {
  // Max 10MB to avoid excessive browser memory usage
  const MAX_SIZE_BYTES = 10 * 1024 * 1024;
  if (file.size > MAX_SIZE_BYTES) {
    return { success: false, error: 'File is too large. Please select an audio file under 10MB.', name: file.name };
  }

  // Verify audio MIME type or extension
  const isAudioType = (file.type && file.type.startsWith('audio/')) || /\.(mp3|wav|ogg|m4a|aac|weba|flac)$/i.test(file.name);
  if (!isAudioType) {
    return { success: false, error: 'Please choose a valid audio file (e.g., MP3, WAV, OGG, M4A, AAC).', name: file.name };
  }

  if (typeof FileReader === 'undefined') {
    // If running in environment without FileReader (e.g. basic Node), still persist metadata
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

/**
 * Deletes the custom device tone and resets to default tone.
 */
export async function removeCustomTone(): Promise<void> {
  await deleteCustomAudioFromDb();
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEYS.CUSTOM_TONE_NAME);
    localStorage.removeItem(STORAGE_KEYS.CUSTOM_TONE_SIZE);
    localStorage.removeItem(STORAGE_KEYS.CUSTOM_TONE_MIME);
  }
  setSelectedTone('default');
}

/**
 * Synthesizes Web Audio presets or plays custom device audio.
 */
export async function playTone(toneId?: ToneId): Promise<void> {
  if (typeof window === 'undefined') return;

  const resolvedId: ToneId = toneId || getSelectedTone();
  const volume = getToneVolume();

  if (resolvedId === 'custom') {
    const customData = await getCustomAudioFromDb();
    if (customData) {
      try {
        const audio = new Audio(customData);
        audio.volume = volume;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          await playPromise;
        }
        return;
      } catch (err) {
        console.warn('[NotificationTones] Custom audio playback failed, falling back to default:', err);
      }
    }
    // If no custom audio was found, fall back to default chime
    playSynthesizedPreset('default', volume);
    return;
  }

  playSynthesizedPreset(resolvedId, volume);
}

/**
 * Synthesizes built-in tones without external audio file requests.
 */
function playSynthesizedPreset(preset: ToneId, volume: number): void {
  try {
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxClass) return;

    const ctx = new AudioCtxClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(volume * 0.45, now);
    masterGain.connect(ctx.destination);

    switch (preset) {
      case 'radar': {
        // Dual high-tech sonar pings
        const pings = [
          { freq: 1150, start: 0.00, dur: 0.16 },
          { freq: 1580, start: 0.20, dur: 0.24 },
        ];
        pings.forEach(({ freq, start, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + start);
          gain.gain.setValueAtTime(0, now + start);
          gain.gain.linearRampToValueAtTime(0.7, now + start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now + start);
          osc.stop(now + start + dur);
        });
        break;
      }

      case 'cash': {
        // Bright metallic "Cha-Ching"
        const notes = [
          { freq: 987.77, start: 0.00, dur: 0.15 }, // B5
          { freq: 1318.51, start: 0.08, dur: 0.42 }, // E6
          { freq: 1975.53, start: 0.12, dur: 0.38 }, // B6 (harmonic chime)
        ];
        notes.forEach(({ freq, start, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + start);
          gain.gain.setValueAtTime(0, now + start);
          gain.gain.linearRampToValueAtTime(0.65, now + start + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now + start);
          osc.stop(now + start + dur);
        });
        break;
      }

      case 'urgent': {
        // Rapid alternating alert pulse
        const beeps = [
          { freq: 880, start: 0.00, dur: 0.10 },
          { freq: 1100, start: 0.11, dur: 0.10 },
          { freq: 880, start: 0.22, dur: 0.10 },
          { freq: 1100, start: 0.33, dur: 0.18 },
        ];
        beeps.forEach(({ freq, start, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, now + start);
          gain.gain.setValueAtTime(0, now + start);
          gain.gain.linearRampToValueAtTime(0.4, now + start + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now + start);
          osc.stop(now + start + dur);
        });
        break;
      }

      case 'bell': {
        // Resonant service bell with harmonic overtones
        const fundamentals = [
          { freq: 1046.50, gainVal: 0.7, dur: 0.7 }, // C6
          { freq: 2093.00, gainVal: 0.3, dur: 0.5 }, // C7
          { freq: 3135.96, gainVal: 0.15, dur: 0.3 }, // G7
        ];
        fundamentals.forEach(({ freq, gainVal, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now);
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(gainVal, now + 0.008);
          gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now);
          osc.stop(now + dur);
        });
        break;
      }

      case 'chime_bright': {
        // 4 rapid upbeat staccato notes (C5 -> E5 -> G5 -> C6)
        const arpeggio = [
          { freq: 523.25, start: 0.00, dur: 0.10 },
          { freq: 659.25, start: 0.09, dur: 0.10 },
          { freq: 783.99, start: 0.18, dur: 0.12 },
          { freq: 1046.50, start: 0.27, dur: 0.32 },
        ];
        arpeggio.forEach(({ freq, start, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + start);
          gain.gain.setValueAtTime(0, now + start);
          gain.gain.linearRampToValueAtTime(0.55, now + start + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now + start);
          osc.stop(now + start + dur);
        });
        break;
      }

      case 'default':
      default: {
        // Classic 3-tone ascending alert chime (D5 -> A5 -> D6)
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
          gain.gain.linearRampToValueAtTime(0.6, now + start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now + start);
          osc.stop(now + start + dur);
        });
        break;
      }
    }
  } catch (err) {
    console.warn('[NotificationTones] Preset synthesis error:', err);
  }
}
