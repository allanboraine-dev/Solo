/**
 * Trip Expiration & Lifecycle Engine for SOLO
 * 
 * Rules:
 * - Unaccepted ride requests older than 1 hour (60 minutes) automatically expire from SOLO.
 * - Riders must book again once a request expires.
 * - Cancelled trips are also removed from the dashboard after 1 hour (60 minutes).
 * - In-progress, accepted, arrived, or completed trips never expire via this rule.
 */

export const TRIP_EXPIRATION_MS = 60 * 60 * 1000; // 1 hour (3,600,000 ms)
export const STALE_REQUEST_MAX_AGE_MS = TRIP_EXPIRATION_MS;

export const PURGED_TRIP_IDS = new Set<string>([
  'fe854637-e49c-402c-80fc-9ab03de8f41c',
  '8cbb1b75-8b7f-4726-ab01-43c3d5f74f26',
  'e88d7281-1b92-40cb-ac74-23ad1e1a45e2',
]);

export interface ExpirableTrip {
  id?: string | null;
  status: string;
  pickup_location?: string | null;
  dropoff_location?: string | null;
  created_at?: string | null;
  scheduled_time?: string | null;
  updated_at?: string | null;
}

export const isPurgedTrip = (trip: ExpirableTrip): boolean => {
  if (!trip) return false;
  if (trip.id && PURGED_TRIP_IDS.has(trip.id)) return true;
  const pickup = (trip.pickup_location || '').trim().toLowerCase();
  const dropoff = (trip.dropoff_location || '').trim().toLowerCase();
  if (pickup.includes('burgandy hills') || pickup.includes('burgundy hills')) return true;
  if (pickup === 'test' && dropoff === 'test') return true;
  return false;
};

export const isStaleRequestedTrip = (trip: ExpirableTrip): boolean => {
  if (isPurgedTrip(trip)) return true;
  if (trip.status !== 'requested') return false;

  // Legacy/orphaned localStorage requested trips missing both created_at and scheduled_time must expire
  if (!trip.created_at && !trip.scheduled_time) {
    return true;
  }

  // 1. Any unaccepted trip request created > 1 hour ago must expire and be removed
  if (trip.created_at) {
    const createdMs = new Date(trip.created_at).getTime();
    if (!Number.isNaN(createdMs) && Date.now() - createdMs > TRIP_EXPIRATION_MS) {
      return true;
    }
  }

  // 2. If scheduled time exists and is past by more than 1 hour, it also expires
  if (trip.scheduled_time) {
    const schedMs = new Date(trip.scheduled_time).getTime();
    if (!Number.isNaN(schedMs) && schedMs <= Date.now() && Date.now() - schedMs > TRIP_EXPIRATION_MS) {
      return true;
    }
  }

  return false;
};

/**
 * Checks whether a cancelled trip has exceeded the 1-hour retention window.
 * Cancelled trips are removed from the dashboard after 1 hour.
 */
export const isStaleCancelledTrip = (trip: ExpirableTrip): boolean => {
  if (trip.status !== 'cancelled') return false;
  // Use updated_at (when cancellation occurred) if available, otherwise fallback to created_at
  const timestamp = trip.updated_at || trip.created_at;
  if (!timestamp) return false;
  const timeMs = new Date(timestamp).getTime();
  if (Number.isNaN(timeMs)) return false;
  return Date.now() - timeMs > TRIP_EXPIRATION_MS;
};

export const isTripExpired = (trip: ExpirableTrip): boolean => {
  return isPurgedTrip(trip) || isStaleRequestedTrip(trip) || isStaleCancelledTrip(trip);
};
