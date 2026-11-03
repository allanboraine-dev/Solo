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

export interface ExpirableTrip {
  status: string;
  created_at?: string | null;
  scheduled_time?: string | null;
  updated_at?: string | null;
}

export const isStaleRequestedTrip = (trip: ExpirableTrip): boolean => {
  if (trip.status !== 'requested') return false;

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
  return isStaleRequestedTrip(trip) || isStaleCancelledTrip(trip);
};
