/**
 * Trip Expiration & Lifecycle Engine for SOLO
 * 
 * Rules:
 * - Unclaimed ride requests older than 1 hour (60 minutes) automatically expire from SOLO.
 * - Riders must book again once a request expires.
 * - Scheduled trips: if scheduled in the future, they do not expire;
 *   if scheduled in the past, they expire 1 hour after the scheduled time.
 * - In-progress, accepted, arrived, completed, or cancelled trips never expire via this rule.
 */

export const TRIP_EXPIRATION_MS = 60 * 60 * 1000; // 1 hour (3,600,000 ms)
export const STALE_REQUEST_MAX_AGE_MS = TRIP_EXPIRATION_MS;

export interface ExpirableTrip {
  status: string;
  created_at?: string | null;
  scheduled_time?: string | null;
}

export const isStaleRequestedTrip = (trip: ExpirableTrip): boolean => {
  if (trip.status !== 'requested') return false;
  if (trip.scheduled_time) {
    const schedMs = new Date(trip.scheduled_time).getTime();
    if (!Number.isNaN(schedMs)) {
      if (schedMs > Date.now()) return false;
      return Date.now() - schedMs > TRIP_EXPIRATION_MS;
    }
  }
  if (!trip.created_at) return false;
  const createdMs = new Date(trip.created_at).getTime();
  if (Number.isNaN(createdMs)) return false;
  return Date.now() - createdMs > TRIP_EXPIRATION_MS;
};

export const isTripExpired = (trip: ExpirableTrip): boolean => {
  return isStaleRequestedTrip(trip);
};
