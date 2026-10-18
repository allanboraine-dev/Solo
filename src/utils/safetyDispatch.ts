/**
 * ============================================================================
 * SOLO South African Rapid-Response Safety & Panic Dispatch Engine
 * ============================================================================
 * Built for South African e-hailing security realities (Riders & Drivers):
 *  1. Instant SOS Panic Dispatch (Armed Security Webhook + Supabase Realtime
 *     WebSocket Broadcast + PostGIS `safety_incidents` forensic logging).
 *  2. 1-Tap Trusted Contact (ICE) WhatsApp Live GPS Pin Beacon.
 *  3. Official South African Emergency & Private Response Directory
 *     (SAPS 10111, Mobile SOS 112, Netcare 082 911, ER24 084 124, EMS 10177).
 *  4. Web Audio API High-Decibel Deterrent Siren + Silent Hijack/Duress Mode.
 * ============================================================================
 */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

function encodeGeohash(lat: number, lng: number, precision = 6): string {
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = '';
  let latMin = -90,
    latMax = 90;
  let lngMin = -180,
    lngMax = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      const lngMid = (lngMin + lngMax) / 2;
      if (lng >= lngMid) {
        idx = idx * 2 + 1;
        lngMin = lngMid;
      } else {
        idx = idx * 2;
        lngMax = lngMid;
      }
    } else {
      const latMid = (latMin + latMax) / 2;
      if (lat >= latMid) {
        idx = idx * 2 + 1;
        latMin = latMid;
      } else {
        idx = idx * 2;
        latMax = latMid;
      }
    }
    evenBit = !evenBit;

    if (++bit === 5) {
      geohash += BASE32.charAt(idx);
      bit = 0;
      idx = 0;
    }
  }
  return geohash;
}

function formatPhoneNumber(phone: string, defaultCountryCode = '27'): string {
  let cleaned = phone.trim().replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
  if (cleaned.startsWith(defaultCountryCode)) return `+${cleaned}`;
  return `+${defaultCountryCode}${cleaned}`;
}

export type SafetyRole = 'rider' | 'driver';

export type EmergencyCategory =
  | 'armed_response'
  | 'hijack_duress'
  | 'medical_emergency'
  | 'accident_roadside'
  | 'suspicious_activity';

export interface TrustedContact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
}

export interface SafetyIncidentInput {
  role: SafetyRole;
  category: EmergencyCategory;
  silentDuress?: boolean;
  userId?: string;
  userName?: string;
  userPhone?: string;
  lat: number;
  lng: number;
  tripId?: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  driverName?: string;
  driverPhone?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  licensePlate?: string;
  verificationPin?: string;
  notes?: string;
}

export interface SafetyIncidentRecord extends SafetyIncidentInput {
  id: string;
  incidentCode: string;
  geohash6: string;
  googleMapsUrl: string;
  status: 'dispatched' | 'acknowledged' | 'resolved';
  dispatchedChannels: string[];
  createdAt: string;
}

export interface SaEmergencyHotline {
  id: string;
  name: string;
  number: string;
  subtitle: string;
  badge: string;
  priority: 'critical' | 'medical' | 'national';
}

export const SA_EMERGENCY_HOTLINES: SaEmergencyHotline[] = [
  {
    id: 'saps_flying_squad',
    name: 'SAPS Flying Squad',
    number: '10111',
    subtitle: 'South African Police Service Rapid Response',
    badge: 'POLICE',
    priority: 'critical',
  },
  {
    id: 'national_mobile_sos',
    name: 'SA Mobile Emergency',
    number: '112',
    subtitle: 'Free from any SA mobile network (MTN/Vodacom/Telkom/Cell C)',
    badge: 'CELL SOS',
    priority: 'critical',
  },
  {
    id: 'netcare_911',
    name: 'Netcare 911 Private EMS',
    number: '082911',
    subtitle: '24/7 Private Paramedic & Intensive Care Ambulance',
    badge: 'PRIVATE EMS',
    priority: 'medical',
  },
  {
    id: 'er24_ems',
    name: 'ER24 Rapid Medical',
    number: '084124',
    subtitle: 'National Private Trauma & Medical Response',
    badge: 'TRAUMA',
    priority: 'medical',
  },
  {
    id: 'public_ambulance',
    name: 'Provincial Ambulance & Fire',
    number: '10177',
    subtitle: 'National Medical & Fire Rescue Control Center',
    badge: 'EMS / FIRE',
    priority: 'national',
  },
];

const TRUSTED_CONTACTS_STORAGE_KEY_PREFIX = 'solo_trusted_contacts_';
const SAFETY_INCIDENTS_STORAGE_KEY = 'solo_safety_incidents';

/**
 * Generates an authoritative South African emergency incident reference code
 * e.g. "SOS-ZA-849201"
 */
export function generateSafetyIncidentCode(): string {
  const num = Math.floor(100000 + Math.random() * 900000);
  return `SOS-ZA-${num}`;
}

/**
 * Builds a clickable Google Maps live pin URL from coordinates
 */
export function buildGoogleMapsPinUrl(lat: number, lng: number): string {
  const cleanLat = Number.isFinite(lat) ? Number(lat.toFixed(6)) : -28.7282;
  const cleanLng = Number.isFinite(lng) ? Number(lng.toFixed(6)) : 24.7499;
  return `https://maps.google.com/?q=${cleanLat},${cleanLng}`;
}

/**
 * Builds an urgent WhatsApp SOS message with live Google Maps coordinates,
 * Geohash sector, vehicle license plate, and incident reference code.
 */
export function buildWhatsAppEmergencySosUrl(
  incident: SafetyIncidentRecord,
  recipientPhone?: string
): string {
  const roleLabel = incident.role === 'driver' ? 'SOLO DRIVER' : 'SOLO RIDER';
  const categoryLabels: Record<EmergencyCategory, string> = {
    armed_response: 'ARMED SECURITY PANIC ALERT',
    hijack_duress: 'SILENT HIJACK / DURESS ALERT',
    medical_emergency: 'MEDICAL TRAUMA EMERGENCY',
    accident_roadside: 'VEHICLE ACCIDENT / ROADSIDE SOS',
    suspicious_activity: 'SAFETY THREAT / ESCORT REQUEST',
  };

  const lines = [
    `🚨 *SOLO EMERGENCY SOS — ${categoryLabels[incident.category]}* 🚨`,
    `🆔 Incident Ref: *${incident.incidentCode}*`,
    `👤 ${roleLabel}: *${incident.userName || 'Verified User'}* ${incident.userPhone ? `(${incident.userPhone})` : ''}`,
    `📍 *Live GPS Location:* ${incident.googleMapsUrl}`,
    `🧭 Coordinates: ${incident.lat.toFixed(5)}, ${incident.lng.toFixed(5)} (Sector ${incident.geohash6.toUpperCase()})`,
    incident.licensePlate
      ? `🚓 Vehicle: *${[incident.vehicleMake, incident.vehicleModel].filter(Boolean).join(' ') || 'Registered Vehicle'}* — Reg Plate: *${incident.licensePlate}*`
      : null,
    incident.driverName && incident.role === 'rider'
      ? `🧑‍✈️ Assigned Driver: ${incident.driverName} ${incident.driverPhone ? `(${incident.driverPhone})` : ''}`
      : null,
    incident.pickupLocation ? `🚩 Pickup: ${incident.pickupLocation}` : null,
    incident.dropoffLocation ? `🏁 Dropoff: ${incident.dropoffLocation}` : null,
    incident.verificationPin ? `🔐 Trip PIN: ${incident.verificationPin}` : null,
    `⏰ Time: ${new Date(incident.createdAt).toLocaleString('en-ZA')}`,
    ``,
    `⚠️ Please contact SAPS (10111) or Private Armed Response immediately and share the live GPS link above.`,
  ]
    .filter(Boolean)
    .join('\n');

  if (recipientPhone && recipientPhone.trim()) {
    const cleanTarget = formatPhoneNumber(recipientPhone).replace(/[^\d]/g, '');
    return `https://wa.me/${cleanTarget}?text=${encodeURIComponent(lines)}`;
  }

  return `https://wa.me/?text=${encodeURIComponent(lines)}`;
}

/**
 * Load saved Trusted Emergency Contacts (ICE) for a rider or driver
 */
export function getTrustedContacts(role: SafetyRole): TrustedContact[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${TRUSTED_CONTACTS_STORAGE_KEY_PREFIX}${role}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Save Trusted Emergency Contacts (ICE) for a rider or driver (up to 3 contacts)
 */
export function saveTrustedContacts(role: SafetyRole, contacts: TrustedContact[]): TrustedContact[] {
  const normalized = contacts.slice(0, 3).map(c => ({
    id: c.id || crypto.randomUUID(),
    name: c.name.trim(),
    phone: formatPhoneNumber(c.phone.trim()),
    relationship: c.relationship.trim() || 'Emergency Contact',
  }));
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(
        `${TRUSTED_CONTACTS_STORAGE_KEY_PREFIX}${role}`,
        JSON.stringify(normalized)
      );
    } catch {
      // Ignore storage quota errors
    }
  }
  return normalized;
}

/**
 * Retrieve local safety incident history
 */
export function getLocalSafetyIncidents(): SafetyIncidentRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SAFETY_INCIDENTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Creates and dispatches a live SOS Panic Incident:
 *  1. Builds forensic record with Geohash-6 & Google Maps link
 *  2. Saves locally for offline resilience
 *  3. Posts to `/api/safety/sos` (Supabase `safety_incidents` + Armed Response Webhook + Admin Push)
 */
export async function triggerRapidResponseSos(
  input: SafetyIncidentInput,
  onBroadcastRealtime?: (incident: SafetyIncidentRecord) => void
): Promise<SafetyIncidentRecord> {
  const validLat = Number.isFinite(input.lat) && input.lat !== 0 ? input.lat : -28.7282;
  const validLng = Number.isFinite(input.lng) && input.lng !== 0 ? input.lng : 24.7499;
  const geohash6 = encodeGeohash(validLat, validLng, 6);
  const googleMapsUrl = buildGoogleMapsPinUrl(validLat, validLng);

  const incident: SafetyIncidentRecord = {
    ...input,
    lat: validLat,
    lng: validLng,
    id: crypto.randomUUID(),
    incidentCode: generateSafetyIncidentCode(),
    geohash6,
    googleMapsUrl,
    status: 'dispatched',
    dispatchedChannels: [
      'SOLO_REALTIME_MESH',
      'ARMED_RESPONSE_DISPATCH_API',
      input.silentDuress ? 'SILENT_DURESS_PROTOCOL' : 'ACTIVE_SOS_TELEMETRY',
    ],
    createdAt: new Date().toISOString(),
  };

  // 1. Persist locally first so offline / dead-zone commuters retain their incident proof
  if (typeof window !== 'undefined') {
    try {
      const existing = getLocalSafetyIncidents();
      const updated = [incident, ...existing].slice(0, 25);
      localStorage.setItem(SAFETY_INCIDENTS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore localStorage errors
    }
  }

  // 2. Broadcast immediately over Supabase Realtime WebSocket mesh
  if (onBroadcastRealtime) {
    try {
      onBroadcastRealtime(incident);
    } catch (e) {
      console.warn('Realtime SOS broadcast warning:', e);
    }
  }

  // 3. Dispatch to server-side Rapid-Response API route (non-blocking if offline)
  if (typeof fetch !== 'undefined') {
    try {
      const res = await fetch('/api/safety/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(incident),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.channels)) {
          incident.dispatchedChannels = data.channels;
        }
      }
    } catch {
      // Offline or cellular drop: incident remains queued locally & ready for WhatsApp/10111/112
    }
  }

  return incident;
}

// ----------------------------------------------------------------------------
// Web Audio API + Native PCM WAV High-Decibel Emergency Deterrent Siren
// ----------------------------------------------------------------------------

/**
 * Generates an in-memory 16-bit PCM WAV data URL containing a 1.4-second
 * high-output dual-tone police/emergency siren cycle (700Hz <-> 1460Hz).
 * Playing this via HTMLAudioElement forces mobile browsers (iOS Safari / Android)
 * onto the hardware 'playback' media speaker channel even when the ringer is on silent.
 */
function buildEmergencySirenWavUrl(): string | null {
  if (typeof window === 'undefined' || typeof URL === 'undefined') return null;
  try {
    const sampleRate = 22050;
    const durationSec = 1.4;
    const numSamples = Math.floor(sampleRate * durationSec);
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    // RIFF WAV header
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true);  // Linear PCM
    view.setUint16(22, 1, true);  // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // Byte rate
    view.setUint16(32, 2, true);  // Block align
    view.setUint16(34, 16, true); // 16-bit samples
    writeString(36, 'data');
    view.setUint32(40, numSamples * 2, true);

    let phase1 = 0;
    let phase2 = 0;
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      // Triangle sweep from 0 -> 1 -> 0 over durationSec
      const half = durationSec / 2;
      const sweep = t < half ? t / half : 1 - (t - half) / half;
      const f1 = 680 + sweep * 760; // 680Hz -> 1440Hz
      const f2 = 715 + sweep * 790; // Detuned harmonic for piercing urgency

      phase1 += (2 * Math.PI * f1) / sampleRate;
      phase2 += (2 * Math.PI * f2) / sampleRate;

      // Rich square/saw-like harmonic blend for maximum mobile speaker projection
      const raw1 = Math.sin(phase1) + 0.45 * Math.sin(3 * phase1);
      const raw2 = Math.sin(phase2) >= 0 ? 0.6 : -0.6;
      const combined = Math.max(-1, Math.min(1, (raw1 + raw2) * 0.65));

      view.setInt16(44 + i * 2, Math.floor(combined * 32767), true);
    }

    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

class DeterrentSirenController {
  private ctx: AudioContext | null = null;
  private oscPrimary: OscillatorNode | null = null;
  private oscSecondary: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private wavUrl: string | null = null;
  private sweepInterval: ReturnType<typeof setInterval> | null = null;
  private active = false;

  public isRunning(): boolean {
    return this.active;
  }

  public start(): boolean {
    if (typeof window === 'undefined') return false;
    if (this.active) return true;

    let startedAny = false;

    // 1. Force mobile OS audio session to 'playback' so hardware mute switch does not silence SOS
    try {
      const nav = navigator as any;
      if (nav?.audioSession) {
        nav.audioSession.type = 'playback';
      }
    } catch {
      // Ignore if unsupported
    }

    // 2. Start HTMLAudioElement PCM WAV loop (unlocks iOS/Android media speaker channel)
    try {
      if (!this.wavUrl) {
        this.wavUrl = buildEmergencySirenWavUrl();
      }
      if (this.wavUrl && typeof Audio !== 'undefined') {
        this.audioEl = new Audio(this.wavUrl);
        this.audioEl.loop = true;
        this.audioEl.volume = 1.0;
        (this.audioEl as any).playsInline = true;
        const playPromise = this.audioEl.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {});
        }
        startedAny = true;
      }
    } catch {
      // Fall through to Web Audio API
    }

    // 3. Start High-Decibel Dual-Oscillator Web Audio API Graph with explicit .resume()
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        if (this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }

        const now = this.ctx.currentTime;
        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-12, now);
        compressor.knee.setValueAtTime(10, now);
        compressor.ratio.setValueAtTime(12, now);
        compressor.attack.setValueAtTime(0.002, now);
        compressor.release.setValueAtTime(0.15, now);

        this.gain = this.ctx.createGain();
        this.gain.gain.setValueAtTime(1.0, now);

        this.oscPrimary = this.ctx.createOscillator();
        this.oscSecondary = this.ctx.createOscillator();

        this.oscPrimary.type = 'sawtooth';
        this.oscSecondary.type = 'square';

        this.oscPrimary.frequency.setValueAtTime(680, now);
        this.oscSecondary.frequency.setValueAtTime(715, now);

        // Immediately schedule first upward wail sweep
        this.oscPrimary.frequency.linearRampToValueAtTime(1440, now + 0.35);
        this.oscSecondary.frequency.linearRampToValueAtTime(1495, now + 0.35);

        this.oscPrimary.connect(this.gain);
        this.oscSecondary.connect(this.gain);
        this.gain.connect(compressor);
        compressor.connect(this.ctx.destination);

        this.oscPrimary.start(now);
        this.oscSecondary.start(now);

        let high = false;
        this.sweepInterval = setInterval(() => {
          if (!this.ctx || !this.oscPrimary || !this.oscSecondary) return;
          if (this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
          }
          const t = this.ctx.currentTime;
          const targetPrimary = high ? 1440 : 680;
          const targetSecondary = high ? 1495 : 715;

          this.oscPrimary.frequency.cancelScheduledValues(t);
          this.oscPrimary.frequency.setValueAtTime(this.oscPrimary.frequency.value || 680, t);
          this.oscPrimary.frequency.linearRampToValueAtTime(targetPrimary, t + 0.34);

          this.oscSecondary.frequency.cancelScheduledValues(t);
          this.oscSecondary.frequency.setValueAtTime(this.oscSecondary.frequency.value || 715, t);
          this.oscSecondary.frequency.linearRampToValueAtTime(targetSecondary, t + 0.34);

          high = !high;
        }, 360);

        startedAny = true;
      }
    } catch {
      // If Web Audio fails, HTMLAudioElement WAV loop may still be active
    }

    if (!startedAny) {
      this.stop();
      return false;
    }

    this.active = true;

    // Vibrate phone in SOS Morse pattern if supported
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([300, 150, 300, 150, 300, 400, 700, 200, 700, 200, 700]);
      } catch {
        // Ignore vibration restriction
      }
    }

    return true;
  }

  public stop(): void {
    this.active = false;
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
    if (this.audioEl) {
      try {
        this.audioEl.pause();
        this.audioEl.currentTime = 0;
        this.audioEl.src = '';
      } catch {
        // Ignore
      }
      this.audioEl = null;
    }
    if (this.oscPrimary) {
      try {
        this.oscPrimary.stop();
        this.oscPrimary.disconnect();
      } catch {
        // Ignore
      }
      this.oscPrimary = null;
    }
    if (this.oscSecondary) {
      try {
        this.oscSecondary.stop();
        this.oscSecondary.disconnect();
      } catch {
        // Ignore
      }
      this.oscSecondary = null;
    }
    if (this.gain) {
      try {
        this.gain.disconnect();
      } catch {
        // Ignore
      }
      this.gain = null;
    }
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {
        // Ignore
      }
      this.ctx = null;
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch {
        // Ignore
      }
    }
  }
}

export const emergencySiren = new DeterrentSirenController();
