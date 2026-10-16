/**
 * SOLO E-Hailing Rider Session & Multi-Trip Isolation Utility
 *
 * Guarantees that each rider has an unambiguous, isolated session ID,
 * and that active trips belong strictly to the rider who created them.
 * Prevents cross-session trip cancellation and ghost trip adoption.
 */

export interface MockTripIdentity {
  id: string;
  rider_id: string;
  driver_id?: string;
  status: string;
}

export const generateUuid = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/**
 * Resilient in-memory storage fallback for private browsing and restricted mobile WebViews
 */
const inMemoryStore: Record<string, string> = {};

export const getSessionItem = (key: string): string | null => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const val = window.sessionStorage.getItem(key);
      if (val !== null) return val;
    }
  } catch {}
  return inMemoryStore[key] ?? null;
};

export const setSessionItem = (key: string, value: string): void => {
  inMemoryStore[key] = value;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(key, value);
    }
  } catch {}
};

export const removeSessionItem = (key: string): void => {
  delete inMemoryStore[key];
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(key);
    }
  } catch {}
};

/**
 * Resolves or creates a unique, isolated session ID for the rider.
 * Prefers authenticated user ID, then sessionStorage (for tab-level test isolation),
 * then localStorage (for device-level persistence).
 */
export const getRiderSessionId = (
  authenticatedUserId?: string | null,
  customSessionStorage?: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void },
  customLocalStorage?: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void }
): string => {
  if (authenticatedUserId && authenticatedUserId !== '00000000-0000-0000-0000-000000000000') {
    const sStorage = customSessionStorage || (typeof window !== 'undefined' ? window.sessionStorage : undefined);
    const lStorage = customLocalStorage || (typeof window !== 'undefined' ? window.localStorage : undefined);
    try {
      sStorage?.setItem('solo_rider_session_id', authenticatedUserId);
      lStorage?.setItem('solo_rider_id', authenticatedUserId);
    } catch {}
    return authenticatedUserId;
  }

  const sStorage = customSessionStorage || (typeof window !== 'undefined' ? window.sessionStorage : undefined);
  const lStorage = customLocalStorage || (typeof window !== 'undefined' ? window.localStorage : undefined);

  try {
    const sessionRiderId = sStorage?.getItem('solo_rider_session_id');
    if (sessionRiderId && sessionRiderId !== '00000000-0000-0000-0000-000000000000') {
      return sessionRiderId;
    }
    const localRiderId = lStorage?.getItem('solo_rider_id');
    if (localRiderId && localRiderId !== '00000000-0000-0000-0000-000000000000') {
      sStorage?.setItem('solo_rider_session_id', localRiderId);
      return localRiderId;
    }
    const newId = generateUuid();
    sStorage?.setItem('solo_rider_session_id', newId);
    lStorage?.setItem('solo_rider_id', newId);
    return newId;
  } catch {
    return '00000000-0000-0000-0000-000000000000';
  }
};

/**
 * Retrieves the currently active trip ID strictly bound to this rider's browser session.
 */
export const getRiderActiveTripId = (
  customSessionStorage?: { getItem: (k: string) => string | null },
  customLocalStorage?: { getItem: (k: string) => string | null }
): string | null => {
  const sStorage = customSessionStorage || (typeof window !== 'undefined' ? window.sessionStorage : undefined);
  const lStorage = customLocalStorage || (typeof window !== 'undefined' ? window.localStorage : undefined);
  try {
    return sStorage?.getItem('solo_rider_active_trip_id') || lStorage?.getItem('solo_rider_active_trip_id') || null;
  } catch {
    return null;
  }
};

/**
 * Binds or unbinds an active trip to this rider's session.
 */
export const setRiderActiveTripId = (
  tripId: string | null,
  customSessionStorage?: { setItem: (k: string, v: string) => void; removeItem: (k: string) => void },
  customLocalStorage?: { setItem: (k: string, v: string) => void; removeItem: (k: string) => void }
): void => {
  const sStorage = customSessionStorage || (typeof window !== 'undefined' ? window.sessionStorage : undefined);
  const lStorage = customLocalStorage || (typeof window !== 'undefined' ? window.localStorage : undefined);
  try {
    if (tripId) {
      sStorage?.setItem('solo_rider_active_trip_id', tripId);
      lStorage?.setItem('solo_rider_active_trip_id', tripId);
    } else {
      sStorage?.removeItem('solo_rider_active_trip_id');
      lStorage?.removeItem('solo_rider_active_trip_id');
    }
  } catch {}
};

/**
 * Validates whether an incoming event or trip belongs to the current rider session.
 * Prevents a rider from adopting or cancelling another rider's trip.
 */
export const isTripBelongingToRiderSession = (
  trip: { id: string; rider_id?: string },
  currentActiveTripId: string | null,
  storedActiveTripId: string | null,
  myRiderSessionId: string
): boolean => {
  if (currentActiveTripId && currentActiveTripId === trip.id) return true;
  if (storedActiveTripId && storedActiveTripId === trip.id) return true;
  if (
    trip.rider_id &&
    trip.rider_id === myRiderSessionId &&
    myRiderSessionId !== '00000000-0000-0000-0000-000000000000'
  ) {
    return true;
  }
  return false;
};
