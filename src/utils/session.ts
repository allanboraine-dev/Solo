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
    try {
      return crypto.randomUUID();
    } catch {}
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

export const getSafeLocalStorageItem = (key: string): string | null => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const val = window.localStorage.getItem(key);
      if (val !== null) return val;
    }
  } catch {}
  return inMemoryStore[key] ?? null;
};

export const setSafeLocalStorageItem = (key: string, value: string): void => {
  inMemoryStore[key] = value;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {}
};

export const removeSafeLocalStorageItem = (key: string): void => {
  delete inMemoryStore[key];
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {}
};

export const safeJsonParse = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return (parsed !== null && parsed !== undefined) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

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

// ============================================================================
// DRIVER SINGLE-DEVICE ACTIVE ONLINE ENFORCEMENT
// A driver must and can only be active online on 1 device at a time.
// Going online on Device B automatically preempts and disconnects Device A.
// ============================================================================

export interface DriverOnlineSession {
  driverId: string;
  deviceId: string;
  timestamp: number;
}

/**
 * Returns a stable, persistent device ID for this browser / phone installation.
 */
export const getDriverDeviceId = (
  customStorage?: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void }
): string => {
  const storage = customStorage || (typeof window !== 'undefined' ? window.localStorage : undefined);
  try {
    const existing = storage?.getItem('solo_driver_device_id');
    if (existing && existing.length > 5) {
      return existing;
    }
    const newId = `dev-${generateUuid()}`;
    storage?.setItem('solo_driver_device_id', newId);
    return newId;
  } catch {
    return `dev-${generateUuid()}`;
  }
};

/**
 * Gets the current active device session for a given driver.
 */
export const getDriverActiveSession = (
  driverId: string,
  customStorage?: { getItem: (k: string) => string | null }
): DriverOnlineSession | null => {
  if (!driverId) return null;
  const storage = customStorage || (typeof window !== 'undefined' ? window.localStorage : undefined);
  try {
    const raw = storage?.getItem(`solo_driver_active_session_${driverId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.deviceId) {
        return parsed as DriverOnlineSession;
      }
    }
  } catch {}
  return null;
};

/**
 * Claims active online duty on this device for the driver.
 */
export const setDriverActiveSession = (
  driverId: string,
  deviceId: string,
  customStorage?: { setItem: (k: string, v: string) => void }
): DriverOnlineSession => {
  const session: DriverOnlineSession = {
    driverId,
    deviceId,
    timestamp: Date.now(),
  };
  const storage = customStorage || (typeof window !== 'undefined' ? window.localStorage : undefined);
  try {
    storage?.setItem(`solo_driver_active_session_${driverId}`, JSON.stringify(session));
  } catch {}
  return session;
};

/**
 * Clears the active device session when the driver goes offline voluntarily.
 * Only clears if the calling device was indeed the currently registered active device.
 */
export const clearDriverActiveSession = (
  driverId: string,
  deviceId?: string,
  customStorage?: { getItem: (k: string) => string | null; removeItem: (k: string) => void }
): void => {
  const storage = customStorage || (typeof window !== 'undefined' ? window.localStorage : undefined);
  try {
    if (deviceId) {
      const current = getDriverActiveSession(driverId, storage);
      if (current && current.deviceId !== deviceId) {
        // Another device has already taken over; do not clear their session!
        return;
      }
    }
    storage?.removeItem(`solo_driver_active_session_${driverId}`);
  } catch {}
};

/**
 * Checks whether this device has been preempted by another device logging in as active driver.
 */
export const isDriverSessionPreempted = (
  driverId: string,
  myDeviceId: string,
  customStorage?: { getItem: (k: string) => string | null },
  remoteDeviceId?: string | null
): boolean => {
  if (!driverId || !myDeviceId) return false;
  if (remoteDeviceId && remoteDeviceId !== myDeviceId) {
    return true;
  }
  const active = getDriverActiveSession(driverId, customStorage);
  if (!active) return false;
  return active.deviceId !== myDeviceId;
};

/**
 * Synchronizes the driver's active device identifier with central telemetry to preempt other physical devices.
 */
export const syncDriverDeviceOnline = async (
  driverId: string,
  deviceId: string,
  supabaseClient?: any
): Promise<void> => {
  if (!driverId || !deviceId) return;
  setDriverActiveSession(driverId, deviceId);
  if (supabaseClient) {
    try {
      await supabaseClient
        .from('driver_profiles')
        .update({
          active_device_id: deviceId,
          is_online: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', driverId);
    } catch (e) {
      console.warn('Driver device online sync notice:', e);
    }
  }
};

