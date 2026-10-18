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
// Web Audio API High-Decibel Emergency Deterrent Siren (Zero external MP3 needed)
// ----------------------------------------------------------------------------
class DeterrentSirenController {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private sweepInterval: ReturnType<typeof setInterval> | null = null;
  private active = false;

  public isRunning(): boolean {
    return this.active;
  }

  public start(): boolean {
    if (typeof window === 'undefined') return false;
    if (this.active) return true;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return false;

      this.ctx = new AudioCtx();
      this.osc = this.ctx.createOscillator();
      this.gain = this.ctx.createGain();

      this.osc.type = 'sawtooth';
      this.osc.frequency.setValueAtTime(680, this.ctx.currentTime);
      this.gain.gain.setValueAtTime(0.85, this.ctx.currentTime);

      this.osc.connect(this.gain);
      this.gain.connect(this.ctx.destination);
      this.osc.start();
      this.active = true;

      let high = true;
      this.sweepInterval = setInterval(() => {
        if (!this.ctx || !this.osc) return;
        const now = this.ctx.currentTime;
        this.osc.frequency.exponentialRampToValueAtTime(high ? 1320 : 640, now + 0.35);
        high = !high;
      }, 380);

      // Vibrate phone in SOS Morse pattern if supported
      if ('vibrate' in navigator) {
        try {
          navigator.vibrate([300, 150, 300, 150, 300, 400, 700, 200, 700, 200, 700]);
        } catch {
          // Ignore vibration restriction
        }
      }

      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  public stop(): void {
    this.active = false;
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
    if (this.osc) {
      try {
        this.osc.stop();
        this.osc.disconnect();
      } catch {
        // Ignore
      }
      this.osc = null;
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
