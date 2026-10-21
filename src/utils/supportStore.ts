/**
 * ============================================================================
 * SOLO South African Rider Support & Lost Property Recovery Engine
 * ============================================================================
 * Built for South African e-hailing realities:
 *  1. Zero-login Lost Phone Emergency Reporting (for riders whose phone is
 *     locked in the driver's vehicle).
 *  2. Immediate high-priority driver dispatch & audio alert.
 *  3. Context-aware dispute resolution (fare queries, driver conduct, SARS receipts).
 *  4. Official WhatsApp Support deep-link generation with structured diagnostics.
 *  5. POPIA compliant handling of alternative contact numbers.
 * ============================================================================
 */

import { generateUuid, getSafeLocalStorageItem, setSafeLocalStorageItem, safeJsonParse } from './session.ts';
import { formatPhoneNumber } from './phone.ts';

export interface CandidateTrip {
  id: string;
  rider_id: string;
  driver_id?: string;
  pickup_location: string;
  dropoff_location: string;
  fare_amount?: number;
  status: string;
  created_at?: string;
}

export interface CandidateDriver {
  id?: string;
  fullName: string;
  email?: string;
  phone?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  licensePlate?: string;
}

export type SupportCategory =
  | 'lost_phone'
  | 'lost_item'
  | 'fare_dispute'
  | 'driver_conduct'
  | 'safety_concern'
  | 'receipt_inquiry'
  | 'cancellation_fee'
  | 'other';

export type SupportTicketStatus =
  | 'open'
  | 'driver_notified'
  | 'investigating'
  | 'driver_confirmed_found'
  | 'driver_checked_not_found'
  | 'resolved'
  | 'closed';

export interface LostItemDetails {
  itemType: 'phone' | 'wallet' | 'keys' | 'bag' | 'clothing' | 'electronics' | 'other';
  brandModel?: string;
  color?: string;
  caseOrFeatures?: string;
  lockScreenInfo?: string;
  approximateSeatLocation?: 'front_passenger' | 'back_seat' | 'floor' | 'boot' | 'unknown';
}

export interface SupportTicket {
  id: string;
  ticketCode: string; // e.g. "SOLO-LOST-18492" or "SOLO-SPT-93821"
  category: SupportCategory;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
  
  // Rider Identification
  riderIdentifier: string; // Phone number or Email registered on SOLO
  riderName?: string;
  
  // Alternative Contact (vital if phone is lost)
  alternativeContactName?: string;
  alternativeContactPhone?: string;
  
  // Matched Trip Context
  tripId?: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  vehiclePlate?: string;
  vehicleModel?: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  tripDate?: string;
  fareZar?: number;
  
  // Item details (for lost property)
  itemDetails?: LostItemDetails;
  
  // Message & History
  subject: string;
  description: string;
  driverNotes?: string;
  resolutionNotes?: string;
  resolvedAt?: string;
}

const SUPPORT_TICKETS_STORAGE_KEY = 'solo_support_tickets';
const OFFICIAL_SUPPORT_WHATSAPP = process.env.NEXT_PUBLIC_SOLO_SUPPORT_WHATSAPP || '27820007656';

/**
 * Generates human-friendly ticket codes (e.g. SOLO-LOST-49210 or SOLO-SPT-18302)
 */
export function generateTicketCode(category: SupportCategory = 'other'): string {
  const prefix = category === 'lost_phone' || category === 'lost_item' ? 'LOST' : 'SPT';
  const randomDigits = Math.floor(10000 + Math.random() * 90000).toString();
  return `SOLO-${prefix}-${randomDigits}`;
}

/**
 * Retrieves all support tickets from safe local storage
 */
export function getSupportTickets(): SupportTicket[] {
  const raw = getSafeLocalStorageItem(SUPPORT_TICKETS_STORAGE_KEY);
  const tickets = safeJsonParse<SupportTicket[]>(raw, []);
  return Array.isArray(tickets) ? tickets : [];
}

/**
 * Saves a new support ticket or updates an existing one
 */
export function saveSupportTicket(ticket: SupportTicket): SupportTicket {
  const existing = getSupportTickets();
  const index = existing.findIndex((t) => t.id === ticket.id || t.ticketCode === ticket.ticketCode);
  
  const updatedTicket: SupportTicket = {
    ...ticket,
    updatedAt: new Date().toISOString(),
  };

  if (index >= 0) {
    existing[index] = updatedTicket;
  } else {
    existing.unshift(updatedTicket);
  }

  setSafeLocalStorageItem(SUPPORT_TICKETS_STORAGE_KEY, JSON.stringify(existing));

  // Cross-tab broadcast for real-time reactivity
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent('solo_support_ticket_updated', {
          detail: { ticket: updatedTicket },
        })
      );
    } catch {}
  }

  return updatedTicket;
}

/**
 * Finds a support ticket by its tracking code
 */
export function getSupportTicketByCode(ticketCode: string): SupportTicket | null {
  if (!ticketCode) return null;
  const tickets = getSupportTickets();
  const normalized = ticketCode.trim().toUpperCase();
  return tickets.find((t) => t.ticketCode.toUpperCase() === normalized) || null;
}

/**
 * Finds all tickets assigned to a specific driver
 */
export function getSupportTicketsForDriver(driverId: string): SupportTicket[] {
  if (!driverId) return [];
  const tickets = getSupportTickets();
  return tickets.filter((t) => t.driverId === driverId);
}

/**
 * Updates the status and optional notes on an existing ticket
 */
export function updateSupportTicketStatus(
  ticketIdOrCode: string,
  newStatus: SupportTicketStatus,
  notes?: string
): SupportTicket | null {
  const tickets = getSupportTickets();
  const ticket = tickets.find((t) => t.id === ticketIdOrCode || t.ticketCode === ticketIdOrCode);
  if (!ticket) return null;

  ticket.status = newStatus;
  ticket.updatedAt = new Date().toISOString();
  if (notes) {
    ticket.driverNotes = notes;
  }
  if (newStatus === 'resolved' || newStatus === 'closed') {
    ticket.resolvedAt = new Date().toISOString();
  }

  return saveSupportTicket(ticket);
}

/**
 * Searches local and session trips to locate the matching ride for a lost phone report.
 * Matches on rider phone, email, or date/pickup keywords.
 */
export function findMatchingTripForLostPhone(
  identifier: string,
  tripDateQuery?: string,
  landmarkKeywords?: string
): { trip: CandidateTrip; driver?: CandidateDriver | null } | null {
  if (typeof window === 'undefined') return null;

  try {
    const rawTrips = getSafeLocalStorageItem('solo_trips');
    const trips = safeJsonParse<CandidateTrip[]>(rawTrips, []);
    if (!Array.isArray(trips) || trips.length === 0) return null;

    const cleanedIdentifier = identifier.trim().toLowerCase();
    const formattedIdPhone = formatPhoneNumber(cleanedIdentifier);

    // Filter to candidate trips
    const candidates = trips.filter((t) => {
      // 1. Direct rider ID or phone match
      const riderMatch =
        (t.rider_id && t.rider_id.toLowerCase().includes(cleanedIdentifier)) ||
        (t.rider_id && formatPhoneNumber(t.rider_id) === formattedIdPhone);

      // 2. Landmark keywords match
      let landmarkMatch = false;
      if (landmarkKeywords && landmarkKeywords.trim()) {
        const kw = landmarkKeywords.trim().toLowerCase();
        landmarkMatch =
          t.pickup_location.toLowerCase().includes(kw) ||
          t.dropoff_location.toLowerCase().includes(kw);
      }

      return riderMatch || landmarkMatch;
    });

    if (candidates.length === 0) {
      // If no strict match but trips exist, pick the most recent completed or active trip
      const recent = trips[0];
      if (recent && (recent.status === 'completed' || recent.status === 'in_progress')) {
        const driver = findDriverProfileLocally(recent.driver_id);
        return { trip: recent, driver };
      }
      return null;
    }

    // Sort by newest first
    candidates.sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });

    const bestTrip = candidates[0];
    const driver = findDriverProfileLocally(bestTrip.driver_id);
    return { trip: bestTrip, driver };
  } catch {
    return null;
  }
}

function findDriverProfileLocally(driverId?: string): CandidateDriver | null {
  if (!driverId || typeof window === 'undefined') return null;
  try {
    // Check all registered drivers
    const rawAll = getSafeLocalStorageItem('all_registered_drivers');
    const all = safeJsonParse<CandidateDriver[]>(rawAll, []);
    if (Array.isArray(all)) {
      const found = all.find((d) => d.id === driverId);
      if (found) return found;
    }

    // Check mock driver profile
    const rawMock = getSafeLocalStorageItem('mock_driver_profile');
    const mock = safeJsonParse<CandidateDriver>(rawMock, null);
    if (mock && mock.id === driverId) return mock;
  } catch {}
  return null;
}

/**
 * Dispatches an urgent Lost Property broadcast alert directly to the driver's active terminal
 */
export function dispatchLostItemDriverAlert(ticket: SupportTicket): boolean {
  if (typeof window === 'undefined') return false;

  try {
    // 1. Broadcast via native cross-tab BroadcastChannel
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel('solo_realtime_bus');
        bc.postMessage({ type: 'lost_item_alert', payload: ticket });
        bc.close();
      } catch {}
    }

    // 2. Dispatch local DOM custom event for immediate in-page modal display
    window.dispatchEvent(
      new CustomEvent('solo_lost_item_alert', {
        detail: { ticket },
      })
    );

    // 3. Persist alert to driver's pending alerts list
    if (ticket.driverId) {
      const alertKey = `driver_lost_item_alerts_${ticket.driverId}`;
      const existingAlerts = safeJsonParse<SupportTicket[]>(getSafeLocalStorageItem(alertKey), []);
      existingAlerts.unshift(ticket);
      setSafeLocalStorageItem(alertKey, JSON.stringify(existingAlerts.slice(0, 10)));
    }

    return true;
  } catch (err) {
    console.warn('Lost item driver dispatch notice:', err);
    return false;
  }
}

/**
 * Builds an official SOLO South Africa WhatsApp Support deep-link with pre-filled diagnostics
 */
export function buildOfficialSupportWhatsAppUrl(ticketOrContext: {
  ticketCode?: string;
  category?: SupportCategory;
  riderName?: string;
  riderPhone?: string;
  tripId?: string;
  driverName?: string;
  vehiclePlate?: string;
  summary?: string;
}): string {
  const {
    ticketCode = generateTicketCode(ticketOrContext.category || 'other'),
    category = 'General Support',
    riderName,
    riderPhone,
    tripId,
    driverName,
    vehiclePlate,
    summary,
  } = ticketOrContext;

  const lines = [
    `*SOLO E-HAILING SOUTH AFRICA — SUPPORT INQUIRY*`,
    `----------------------------------------`,
    `📌 *Ticket Code:* ${ticketCode}`,
    `🏷️ *Category:* ${category.replace(/_/g, ' ').toUpperCase()}`,
    riderName ? `👤 *Rider:* ${riderName}` : null,
    riderPhone ? `📞 *Rider Cell:* ${riderPhone}` : null,
    tripId ? `🚗 *Trip ID:* ${tripId}` : null,
    driverName ? `👨‍✈️ *Driver:* ${driverName} (${vehiclePlate || 'Vehicle Plate'})` : null,
    summary ? `💬 *Details:* ${summary}` : null,
    `⏱️ *Time:* ${new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}, ${new Date().toLocaleDateString('en-ZA')}`,
    `----------------------------------------`,
    `Please assist me with this request.`,
  ]
    .filter(Boolean)
    .join('\n');

  return `https://wa.me/${OFFICIAL_SUPPORT_WHATSAPP}?text=${encodeURIComponent(lines)}`;
}
