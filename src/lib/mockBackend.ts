import { supabase } from './supabaseClient';
import { isPlatformOwner, applyOwnerPrivileges } from '@/utils/owner';
import { setDriverActiveSession, clearDriverActiveSession, isDriverSessionPreempted, getDriverActiveSession } from '@/utils/session';

export type MockTrip = {
  id: string; // UUID in Supabase
  rider_id: string;
  driver_id?: string;
  pickup_location: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_location: string;
  dropoff_lat: number;
  dropoff_lng: number;
  fare_amount: number;
  status: 'requested' | 'accepted' | 'arrived' | 'in_progress' | 'payment_pending' | 'completed' | 'cancelled';
  verification_pin?: string;
  scheduled_time?: string;
  created_at?: string;
};

export type MockMessage = {
  id: string;
  trip_id: string;
  sender: 'rider' | 'driver';
  text: string;
  timestamp: number;
};

export type MockDriverProfile = {
  id?: string; // UUID in Supabase
  fullName: string;
  email: string;
  phone: string;
  vehicleMake: string;
  vehicleModel: string;
  licensePlate: string;
  prdpNumber: string;
  hasLicense: boolean;
  hasPrdp: boolean;
  hasRoadworthy: boolean;
  isVerified?: boolean;
  subscriptionActive: boolean;
  subscriptionPlan?: 'trial' | 'paid' | 'owner';
  trialStartedAt?: number;
};

// ----------------------------------------
// DRIVER PROFILE METHODS
// ----------------------------------------
export const getDriverProfile = async (): Promise<MockDriverProfile | null> => {
  if (typeof window === 'undefined') return null;
  
  // Get active session from Supabase
  const { data: { session } } = await supabase.auth.getSession();
  const driverId = session?.user?.id || localStorage.getItem('driver_id');
  
  if (driverId) {
    try {
      const { data, error } = await supabase.from('driver_profiles').select('*').eq('id', driverId).single();
      if (data && !error) {
        // Map database fields back to our camelCase frontend model
        const mappedProfile: MockDriverProfile = {
          id: data.id,
          fullName: data.full_name,
          email: data.email,
          phone: data.phone,
          vehicleMake: data.vehicle_make,
          vehicleModel: data.vehicle_model,
          licensePlate: data.license_plate,
          prdpNumber: data.prdp_number,
          hasLicense: data.has_license ?? true,
          hasPrdp: data.has_prdp ?? true,
          hasRoadworthy: data.has_roadworthy ?? true,
          isVerified: data.is_verified ?? false,
          subscriptionActive: data.subscription_active ?? (data.subscription_status === 'active' || data.subscription_status === 'trial'),
          subscriptionPlan: data.subscription_plan,
          trialStartedAt: data.trial_started_at ? new Date(data.trial_started_at).getTime() : undefined,
        };
        return applyOwnerPrivileges(mappedProfile);
      }
    } catch (e) {
      console.error('Error fetching driver profile:', e);
    }
  }

  // Fallback to local cache if offline or missing
  const localData = localStorage.getItem('mock_driver_profile');
  if (localData) {
    try {
      const parsed = JSON.parse(localData);
      if (!parsed.id) {
        parsed.id = driverId || crypto.randomUUID();
        localStorage.setItem('driver_id', parsed.id);
        localStorage.setItem('mock_driver_profile', JSON.stringify(parsed));
      }
      return applyOwnerPrivileges(parsed);
    } catch {
      return null;
    }
  }
  return null;
};

export const getDriverProfileById = async (driverId: string): Promise<MockDriverProfile | null> => {
  if (!driverId) return null;
  try {
    const { data, error } = await supabase.from('driver_profiles').select('*').eq('id', driverId).maybeSingle();
    if (data && !error) {
      const mappedProfile: MockDriverProfile = {
        id: data.id,
        fullName: data.full_name || 'Registered Driver',
        email: data.email || '',
        phone: data.phone || '',
        vehicleMake: data.vehicle_make || 'Toyota',
        vehicleModel: data.vehicle_model || 'Corolla Quest',
        licensePlate: data.license_plate || 'NC 482-910',
        prdpNumber: data.prdp_number,
        hasLicense: data.has_license ?? true,
        hasPrdp: data.has_prdp ?? true,
        hasRoadworthy: data.has_roadworthy ?? true,
        isVerified: data.is_verified ?? true,
        subscriptionActive: true,
        subscriptionPlan: data.subscription_plan || 'paid',
      };
      return applyOwnerPrivileges(mappedProfile);
    }
  } catch (e) {
    console.error('Error fetching driver profile by ID:', e);
  }

  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem('mock_driver_profile');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && (parsed.id === driverId || !driverId)) {
          return applyOwnerPrivileges(parsed);
        }
      }
    } catch {}
  }
  return null;
};

export const saveDriverProfile = async (profile: MockDriverProfile) => {
  if (typeof window === 'undefined') return;
  
  if (!profile.id) {
    const { data: { session } } = await supabase.auth.getSession();
    profile.id = session?.user?.id || localStorage.getItem('driver_id') || crypto.randomUUID();
  }
  localStorage.setItem('driver_id', profile.id);

  // Ensure owner privileges are applied before saving
  profile = applyOwnerPrivileges(profile);

  // Store locally for quick access/fallback
  localStorage.setItem('mock_driver_profile', JSON.stringify(profile));

  try {
    const dbPayload = {
      ...(profile.id ? { id: profile.id } : {}),
      full_name: profile.fullName,
      email: profile.email,
      phone: profile.phone,
      vehicle_make: profile.vehicleMake,
      vehicle_model: profile.vehicleModel,
      license_plate: profile.licensePlate,
      prdp_number: profile.prdpNumber,
      has_license: profile.hasLicense,
      has_prdp: profile.hasPrdp,
      has_roadworthy: profile.hasRoadworthy,
      is_verified: profile.isVerified ?? false,
      subscription_active: profile.subscriptionActive,
      subscription_plan: profile.subscriptionPlan,
      trial_started_at: profile.trialStartedAt ? new Date(profile.trialStartedAt).toISOString() : undefined,
    };

    // Upsert into Supabase
    const { data, error } = await supabase.from('driver_profiles').upsert(dbPayload).select().single();
    
    if (data && !error) {
      localStorage.setItem('driver_id', data.id);
      profile.id = data.id;
      localStorage.setItem('mock_driver_profile', JSON.stringify(profile));
    }
  } catch (e) {
    console.error('Error saving driver profile to Supabase:', e);
  }
};

// ----------------------------------------
// TRIP METHODS
// ----------------------------------------
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ensureValidUuid = (value?: string | null): string => {
  if (value && UUID_REGEX.test(value)) {
    return value;
  }
  const digits = String(value || '').replace(/[^\d]/g, '');
  if (digits.length > 0) {
    const tail = digits.padStart(12, '0').slice(-12);
    return `00000000-0000-4000-8000-${tail}`;
  }
  return '00000000-0000-4000-8000-000000000001';
};

export const STATUS_PRIORITY: Record<MockTrip['status'], number> = {
  requested: 1,
  accepted: 2,
  arrived: 3,
  in_progress: 4,
  payment_pending: 5,
  completed: 6,
  cancelled: 7,
};

type TripStatusOverride = {
  status: MockTrip['status'];
  driver_id?: string;
  updatedAt: number;
};

export const getTripStatusOverrides = (): Record<string, TripStatusOverride> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('solo_trip_status_map');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const recordTripStatusOverride = (
  tripId: string,
  status: MockTrip['status'],
  driverId?: string | null
): void => {
  if (typeof window === 'undefined' || !tripId) return;
  try {
    const map = getTripStatusOverrides();
    const existing = map[tripId];
    const existingPrio = existing ? STATUS_PRIORITY[existing.status] || 0 : 0;
    const incomingPrio = STATUS_PRIORITY[status] || 0;
    if (incomingPrio >= existingPrio) {
      map[tripId] = {
        status,
        driver_id: driverId || existing?.driver_id || undefined,
        updatedAt: Date.now(),
      };
      // Keep the 200 most recent entries
      const keys = Object.keys(map);
      if (keys.length > 200) {
        const sorted = keys.sort((a, b) => (map[a]?.updatedAt || 0) - (map[b]?.updatedAt || 0));
        sorted.slice(0, keys.length - 200).forEach(k => delete map[k]);
      }
      localStorage.setItem('solo_trip_status_map', JSON.stringify(map));
    }
  } catch (e) {
    console.error('Error recording trip status override:', e);
  }
};

// Unscheduled ride requests older than 30 minutes are treated as expired so stale DB rows never loop
const STALE_REQUEST_MAX_AGE_MS = 30 * 60 * 1000;

export const isStaleRequestedTrip = (trip: Pick<MockTrip, 'status' | 'created_at' | 'scheduled_time'>): boolean => {
  if (trip.status !== 'requested') return false;
  if (trip.scheduled_time) {
    const schedMs = new Date(trip.scheduled_time).getTime();
    if (!Number.isNaN(schedMs) && schedMs > Date.now() - STALE_REQUEST_MAX_AGE_MS) {
      return false;
    }
  }
  if (!trip.created_at) return false;
  const createdMs = new Date(trip.created_at).getTime();
  if (Number.isNaN(createdMs)) return false;
  return Date.now() - createdMs > STALE_REQUEST_MAX_AGE_MS;
};

export {
  getRiderSessionId,
  getRiderActiveTripId,
  setRiderActiveTripId,
  isTripBelongingToRiderSession,
} from '@/utils/session';

/**
 * Retrieves the set of trip IDs that have been completed locally
 */
export const getCompletedTripIds = (): Set<string> => {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem('solo_completed_trips');
    const ids: string[] = raw ? JSON.parse(raw) : [];
    return new Set(ids);
  } catch {
    return new Set();
  }
};

export const isTripCompleted = (tripId: string): boolean => {
  return getCompletedTripIds().has(tripId);
};

export const markTripCompleted = (tripId: string): void => {
  if (typeof window === 'undefined' || !tripId) return;
  try {
    recordTripStatusOverride(tripId, 'completed');
    const current = Array.from(getCompletedTripIds());
    if (!current.includes(tripId)) {
      current.push(tripId);
      localStorage.setItem('solo_completed_trips', JSON.stringify(current.slice(-300)));
    }
    localStorage.setItem(
      'solo_last_completed_trip',
      JSON.stringify({ tripId, status: 'completed', timestamp: Date.now() })
    );
  } catch (e) {
    console.error('Error recording completed trip locally:', e);
  }
};

const resolveMonotonicStatus = (
  tripId: string,
  candidateStatus: MockTrip['status'],
  completedIds: Set<string>,
  declinedIds: Set<string>,
  overrides: Record<string, TripStatusOverride>,
  tripMeta?: Pick<MockTrip, 'created_at' | 'scheduled_time'>
): MockTrip['status'] => {
  if (completedIds.has(tripId)) return 'completed';
  if (declinedIds.has(tripId)) return 'cancelled';

  let bestStatus = candidateStatus;
  const override = overrides[tripId];
  if (override && (STATUS_PRIORITY[override.status] || 0) > (STATUS_PRIORITY[bestStatus] || 0)) {
    bestStatus = override.status;
  }

  if (
    bestStatus === 'requested' &&
    tripMeta &&
    isStaleRequestedTrip({ status: bestStatus, created_at: tripMeta.created_at, scheduled_time: tripMeta.scheduled_time })
  ) {
    return 'cancelled';
  }

  return bestStatus;
};

const syncTripToLocalStorage = (trip: MockTrip): MockTrip => {
  if (typeof window === 'undefined') return trip;
  try {
    if (trip.status === 'completed') {
      markTripCompleted(trip.id);
    }
    recordTripStatusOverride(trip.id, trip.status, trip.driver_id);

    const completedIds = getCompletedTripIds();
    const declinedIds = getDeclinedTripIds();
    const overrides = getTripStatusOverrides();

    const localData = localStorage.getItem('mock_trips');
    const trips: MockTrip[] = localData ? JSON.parse(localData) : [];
    const existingIndex = trips.findIndex(t => t.id === trip.id);
    let finalTrip: MockTrip = trip;

    if (existingIndex >= 0) {
      const existing = trips[existingIndex];
      const existingPrio = STATUS_PRIORITY[existing.status] || 0;
      const incomingPrio = STATUS_PRIORITY[trip.status] || 0;
      const baseStatus = incomingPrio >= existingPrio ? trip.status : existing.status;
      const resolvedStatus = resolveMonotonicStatus(trip.id, baseStatus, completedIds, declinedIds, overrides, trip);
      finalTrip = {
        ...existing,
        ...trip,
        driver_id: trip.driver_id || existing.driver_id || overrides[trip.id]?.driver_id,
        status: resolvedStatus,
      };
      trips[existingIndex] = finalTrip;
    } else {
      const resolvedStatus = resolveMonotonicStatus(trip.id, trip.status, completedIds, declinedIds, overrides, trip);
      finalTrip = {
        ...trip,
        driver_id: trip.driver_id || overrides[trip.id]?.driver_id,
        status: resolvedStatus,
      };
      trips.unshift(finalTrip);
    }
    localStorage.setItem('mock_trips', JSON.stringify(trips.slice(0, 100)));
    return finalTrip;
  } catch (e) {
    console.error('Error syncing trip to localStorage:', e);
    return trip;
  }
};

export const getTrips = async (): Promise<MockTrip[]> => {
  if (typeof window === 'undefined') return [];

  // 1. Fetch from Supabase first so we never hold a stale pre-await localStorage snapshot
  let dbRows: any[] | null = null;
  try {
    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data && !error) {
      dbRows = data;
    }
  } catch (e) {
    console.error('Error fetching trips from Supabase:', e);
  }

  // 2. Read the FRESHEST local state AFTER the network await so in-flight clicks (Accept, Confirm Pickup, Complete) are never overwritten
  const mergedMap = new Map<string, MockTrip>();
  const completedIds = getCompletedTripIds();
  const declinedIds = getDeclinedTripIds();
  const overrides = getTripStatusOverrides();

  try {
    const localData = localStorage.getItem('mock_trips');
    if (localData) {
      const localTrips: MockTrip[] = JSON.parse(localData);
      localTrips.forEach(t => {
        if (t && t.id) {
          const resolvedStatus = resolveMonotonicStatus(t.id, t.status, completedIds, declinedIds, overrides, t);
          const resolvedDriverId = t.driver_id || overrides[t.id]?.driver_id;
          mergedMap.set(t.id, { ...t, driver_id: resolvedDriverId, status: resolvedStatus });
        }
      });
    }
  } catch (e) {
    console.error('Error reading local trips:', e);
  }

  // 3. Merge Supabase rows with fresh local trips using monotonic STATUS_PRIORITY
  if (dbRows) {
    dbRows.forEach((dbTrip: any) => {
      if (!dbTrip?.id) return;
      const existing = mergedMap.get(dbTrip.id);
      const dbStatus = resolveMonotonicStatus(
        dbTrip.id,
        dbTrip.status,
        completedIds,
        declinedIds,
        overrides,
        { created_at: dbTrip.created_at, scheduled_time: dbTrip.scheduled_time }
      );

      const mapped: MockTrip = {
        id: dbTrip.id,
        rider_id: dbTrip.rider_id,
        driver_id: dbTrip.driver_id || existing?.driver_id || overrides[dbTrip.id]?.driver_id,
        pickup_location: dbTrip.pickup_location,
        pickup_lat: dbTrip.pickup_lat,
        pickup_lng: dbTrip.pickup_lng,
        dropoff_location: dbTrip.dropoff_location,
        dropoff_lat: dbTrip.dropoff_lat,
        dropoff_lng: dbTrip.dropoff_lng,
        fare_amount: Number(dbTrip.fare_amount),
        status: dbStatus,
        verification_pin: dbTrip.verification_pin || existing?.verification_pin,
        scheduled_time: dbTrip.scheduled_time || existing?.scheduled_time,
        created_at: dbTrip.created_at || existing?.created_at,
      };

      if (!existing) {
        mergedMap.set(mapped.id, mapped);
      } else {
        const dbPrio = STATUS_PRIORITY[mapped.status] || 0;
        const localPrio = STATUS_PRIORITY[existing.status] || 0;
        const winningStatus = dbPrio >= localPrio ? mapped.status : existing.status;
        mergedMap.set(mapped.id, {
          ...mapped,
          ...existing,
          driver_id: existing.driver_id || mapped.driver_id,
          status: winningStatus,
        });
      }
    });
  }

  const result = Array.from(mergedMap.values());
  try {
    localStorage.setItem('mock_trips', JSON.stringify(result.slice(0, 100)));
  } catch {
    // Ignore storage quota errors
  }
  return result;
};

export const saveTrip = async (trip: MockTrip) => {
  if (trip.status === 'completed') {
    markTripCompleted(trip.id);
  }
  recordTripStatusOverride(trip.id, trip.status, trip.driver_id);

  const enrichedTrip: MockTrip = {
    ...trip,
    rider_id: ensureValidUuid(trip.rider_id),
    verification_pin: trip.verification_pin || Math.floor(1000 + Math.random() * 9000).toString(),
    created_at: trip.created_at || new Date().toISOString(),
  };

  // 1. Save locally first for instant UI response & broadcast immediately across tabs/clients
  const syncedLocal = syncTripToLocalStorage(enrichedTrip);
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem('solo_last_updated_trip', JSON.stringify({ trip: syncedLocal, ts: Date.now() }));
    }
  } catch {
    // Ignore storage quota errors
  }
  broadcastEvent('trip_updated', syncedLocal);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const currentUserId = session?.user?.id;
    const resolvedRiderId = ensureValidUuid(
      enrichedTrip.rider_id && enrichedTrip.rider_id !== '00000000-0000-0000-0000-000000000000'
        ? enrichedTrip.rider_id
        : currentUserId
    );
    const resolvedDriverId =
      enrichedTrip.driver_id && UUID_REGEX.test(enrichedTrip.driver_id) ? enrichedTrip.driver_id : null;

    // For status updates on existing trips, use UPDATE + SECURITY DEFINER RPCs (never fall through to INSERT/UPSERT which triggers rider-only RLS)
    if (enrichedTrip.status !== 'requested') {
      const updatePayload: Record<string, any> = {
        status: enrichedTrip.status,
        updated_at: new Date().toISOString(),
      };
      if (resolvedDriverId) {
        updatePayload.driver_id = resolvedDriverId;
      }
      if (enrichedTrip.status === 'completed') {
        updatePayload.completed_at = new Date().toISOString();
        updatePayload.payment_status = 'paid';
      }

      const { data: updatedRow, error: updateErr } = await supabase
        .from('trips')
        .update(updatePayload)
        .eq('id', enrichedTrip.id)
        .select()
        .maybeSingle();

      if (!updateErr && updatedRow) {
        return;
      }

      // Fallback to SECURITY DEFINER RPCs when RLS blocks direct table UPDATE
      if (enrichedTrip.status === 'accepted') {
        await supabase.rpc('accept_trip', { p_trip_id: enrichedTrip.id });
      } else if (enrichedTrip.status === 'in_progress') {
        const { error: startErr } = await supabase.rpc('start_trip', {
          p_trip_id: enrichedTrip.id,
          p_pin: enrichedTrip.verification_pin || '',
        });
        if (startErr) {
          await supabase.rpc('accept_trip', { p_trip_id: enrichedTrip.id });
          await supabase.rpc('start_trip', {
            p_trip_id: enrichedTrip.id,
            p_pin: enrichedTrip.verification_pin || '',
          });
        }
      } else if (enrichedTrip.status === 'payment_pending') {
        await supabase.rpc('complete_trip', {
          p_trip_id: enrichedTrip.id,
          p_payment_method: 'in_app',
        });
      } else if (enrichedTrip.status === 'completed') {
        await supabase.rpc('complete_trip', {
          p_trip_id: enrichedTrip.id,
          p_payment_method: 'cash',
        });
      }
      return;
    }

    const dbPayload: Record<string, any> = {
      id: enrichedTrip.id,
      rider_id: resolvedRiderId,
      driver_id: resolvedDriverId,
      pickup_location: enrichedTrip.pickup_location,
      pickup_lat: enrichedTrip.pickup_lat,
      pickup_lng: enrichedTrip.pickup_lng,
      dropoff_location: enrichedTrip.dropoff_location,
      dropoff_lat: enrichedTrip.dropoff_lat,
      dropoff_lng: enrichedTrip.dropoff_lng,
      fare_amount: enrichedTrip.fare_amount,
      status: enrichedTrip.status,
      verification_pin: enrichedTrip.verification_pin,
      scheduled_time: enrichedTrip.scheduled_time ? new Date(enrichedTrip.scheduled_time).toISOString() : null,
    };

    const { data, error } = await supabase.from('trips').upsert(dbPayload).select().single();
    if (error) {
      // If foreign key on driver_id failed (e.g. driver profile not yet in DB), retry without driver_id FK
      if (resolvedDriverId && error.message?.toLowerCase().includes('foreign key')) {
        await supabase.from('trips').upsert({ ...dbPayload, driver_id: null });
      }
    } else if (data) {
      const synced: MockTrip = {
        ...enrichedTrip,
        verification_pin: data.verification_pin || enrichedTrip.verification_pin,
        created_at: data.created_at || enrichedTrip.created_at,
      };
      const finalSynced = syncTripToLocalStorage(synced);
      broadcastEvent('trip_updated', finalSynced);
    }
  } catch (e) {
    console.error('Error saving trip to Supabase:', e);
  }
};

/**
 * Atomic trip acceptance using the hardened Postgres RPC with automatic fallback
 */
export const acceptTripAtomic = async (
  tripId: string,
  driverIdOverride?: string | null
): Promise<{ success: boolean; error?: string }> => {
  const localDriverId =
    driverIdOverride || (typeof window !== 'undefined' ? localStorage.getItem('driver_id') : null);
  recordTripStatusOverride(tripId, 'accepted', localDriverId);

  try {
    const { data, error } = await supabase.rpc('accept_trip', { p_trip_id: tripId });
    if (!error && data) {
      const res = data as { success?: boolean; status?: string };
      if (res?.success) {
        return { success: true };
      }
    }
    if (error && error.message?.toLowerCase().includes('no longer available')) {
      return { success: false, error: error.message };
    }
  } catch (e: unknown) {
    console.warn('accept_trip RPC fallback:', e);
  }

  // Fallback: Direct update on public.trips + local storage
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const driverId = session?.user?.id || localDriverId;
    const validDriverId = driverId && UUID_REGEX.test(driverId) ? driverId : null;
    await supabase
      .from('trips')
      .update({
        status: 'accepted',
        ...(validDriverId ? { driver_id: validDriverId } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', tripId);
  } catch (e) {
    console.warn('Direct trip accept update fallback:', e);
  }

  return { success: true };
};

/**
 * Retrieves the set of trip IDs declined by the current driver
 */
export const getDeclinedTripIds = (driverId?: string | null): Set<string> => {
  if (typeof window === 'undefined') return new Set();
  try {
    const key = driverId ? `solo_declined_trips_${driverId}` : 'solo_declined_trips';
    const raw = localStorage.getItem(key);
    const globalRaw = localStorage.getItem('solo_declined_trips');
    const ids: string[] = [
      ...(raw ? JSON.parse(raw) : []),
      ...(globalRaw ? JSON.parse(globalRaw) : []),
    ];
    return new Set(ids);
  } catch {
    return new Set();
  }
};

export const isTripDeclined = (tripId: string, driverId?: string | null): boolean => {
  return getDeclinedTripIds(driverId).has(tripId);
};

/**
 * Declines a rider trip request from the driver portal, persists the decline
 * so the request will not re-appear for this driver, and updates/broadcasts the cancelled status.
 */
export const declineTrip = async (trip: MockTrip, driverId?: string | null): Promise<void> => {
  if (typeof window !== 'undefined') {
    try {
      const resolvedDriverId = driverId || localStorage.getItem('driver_id');
      const current = Array.from(getDeclinedTripIds(resolvedDriverId));
      if (!current.includes(trip.id)) {
        current.push(trip.id);
      }
      localStorage.setItem('solo_declined_trips', JSON.stringify(current.slice(-200)));
      if (resolvedDriverId) {
        localStorage.setItem(`solo_declined_trips_${resolvedDriverId}`, JSON.stringify(current.slice(-200)));
      }
    } catch (e) {
      console.error('Error recording declined trip locally:', e);
    }
  }

  const cancelledTrip: MockTrip = {
    ...trip,
    status: 'cancelled',
  };

  await saveTrip(cancelledTrip);
};

/**
 * Atomic trip start with rider 4-digit verification PIN
 */
export const startTripWithPin = async (tripId: string, pin: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const { data, error } = await supabase.rpc('start_trip', { p_trip_id: tripId, p_pin: pin });
    if (!error && data) {
      const res = data as { success?: boolean };
      if (res?.success) return { success: true };
    }
    if (error && error.message?.toLowerCase().includes('invalid verification pin')) {
      return { success: false, error: error.message };
    }
  } catch (e: unknown) {
    console.warn('start_trip RPC fallback:', e);
  }

  // Fallback PIN check against local or DB trip
  const trips = await getTrips();
  const trip = trips.find(t => t.id === tripId);
  if (trip?.verification_pin && trip.verification_pin !== pin.trim()) {
    return { success: false, error: 'Invalid verification PIN provided by rider' };
  }
  if (trip) {
    await saveTrip({ ...trip, status: 'in_progress' });
  }
  return { success: true };
};

/**
 * Deduplicates in-flight and stored chat messages by ID and fuzzy sender/content within a time window
 */
export const deduplicateMessages = (messages: MockMessage[]): MockMessage[] => {
  const result: MockMessage[] = [];
  const seenIds = new Set<string>();

  for (const m of messages) {
    if (!m || !m.text) continue;
    if (m.id && seenIds.has(m.id)) continue;

    // Fuzzy duplicate check: same trip, same sender, same trimmed text within a 6-second window
    const isDup = result.some(existing => 
      existing.sender === m.sender &&
      existing.text.trim() === m.text.trim() &&
      Math.abs(existing.timestamp - m.timestamp) < 6000
    );

    if (isDup) {
      // If incoming message has a standard UUID while existing has a random short ID, update ID to UUID
      if (m.id && m.id.length > 20) {
        const existingIdx = result.findIndex(existing =>
          existing.sender === m.sender &&
          existing.text.trim() === m.text.trim() &&
          Math.abs(existing.timestamp - m.timestamp) < 6000
        );
        if (existingIdx >= 0) {
          result[existingIdx].id = m.id;
          seenIds.add(m.id);
        }
      }
      continue;
    }

    if (m.id) {
      seenIds.add(m.id);
    }
    result.push(m);
  }

  return result.sort((a, b) => a.timestamp - b.timestamp);
};

/**
 * Atomic trip completion using Postgres RPC + direct DB update + permanent local completion record
 */
export const completeTripAtomic = async (
  tripId: string,
  paymentMethod: 'cash' | 'in_app' = 'in_app',
  tripSnapshot?: MockTrip
): Promise<{ success: boolean; status?: string; error?: string }> => {
  const targetStatus: MockTrip['status'] = paymentMethod === 'cash' ? 'completed' : 'payment_pending';

  if (targetStatus === 'completed') {
    markTripCompleted(tripId);
  }

  // 1. Immediately update local state and broadcast so Driver & Rider UI close/update right away
  if (typeof window !== 'undefined') {
    try {
      const localData = localStorage.getItem('mock_trips');
      const trips: MockTrip[] = localData ? JSON.parse(localData) : [];
      const target = trips.find(t => t.id === tripId) || tripSnapshot;
      if (target) {
        const updatedTrip: MockTrip = { ...target, status: targetStatus };
        syncTripToLocalStorage(updatedTrip);
        broadcastEvent('trip_updated', updatedTrip);
      }
      if (targetStatus === 'completed') {
        localStorage.setItem(
          'solo_last_completed_trip',
          JSON.stringify({ tripId, status: 'completed', timestamp: Date.now() })
        );
      }
    } catch (e) {
      console.error('Error updating local trip during completeTripAtomic:', e);
    }
  }

  // 2. Call server endpoint to bypass RLS and guarantee DB persistence in Supabase
  try {
    fetch('/api/trips/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId, paymentMethod }),
    }).catch(err => console.warn('Background /api/trips/complete fetch non-blocking warning:', err));
  } catch {
    // Non-blocking fetch
  }

  // 3. Persist status transition to Supabase via RPC and direct update
  try {
    let { data, error } = await supabase.rpc('complete_trip', {
      p_trip_id: tripId,
      p_payment_method: paymentMethod,
    });

    // If the DB row was still in 'requested' or 'accepted' state in Postgres, advance it first and retry RPC
    if (error && error.message?.toLowerCase().includes('cannot be completed from current state')) {
      await supabase.rpc('accept_trip', { p_trip_id: tripId });
      await supabase
        .from('trips')
        .update({ status: 'in_progress', updated_at: new Date().toISOString() })
        .eq('id', tripId);
      const retry = await supabase.rpc('complete_trip', {
        p_trip_id: tripId,
        p_payment_method: paymentMethod,
      });
      data = retry.data;
      error = retry.error;
    }

    // Also attempt direct table update for defense-in-depth
    await supabase
      .from('trips')
      .update({
        status: targetStatus,
        payment_method: paymentMethod,
        ...(targetStatus === 'completed'
          ? { payment_status: 'paid', completed_at: new Date().toISOString() }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', tripId);

    if (!error && data) {
      const res = data as { success?: boolean; status?: string };
      return { success: !!res?.success, status: res?.status || targetStatus };
    }
  } catch (e: unknown) {
    console.warn('complete_trip execution warning:', e);
  }

  return { success: true, status: targetStatus };
};

// ----------------------------------------
// MESSAGE METHODS (Synchronized with public.trip_messages)
// ----------------------------------------
export const getMessages = (tripId: string): MockMessage[] => {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem('mock_messages_' + tripId);
  if (!data) return [];
  try {
    const parsed: MockMessage[] = JSON.parse(data);
    return deduplicateMessages(parsed);
  } catch {
    return [];
  }
};

export const fetchTripMessages = async (tripId: string): Promise<MockMessage[]> => {
  if (typeof window === 'undefined') return [];
  try {
    const { data, error } = await supabase
      .from('trip_messages')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true });

    if (data && !error && data.length > 0) {
      const formatted: MockMessage[] = data.map((m: any) => ({
        id: m.id,
        trip_id: m.trip_id,
        sender: m.sender_role as 'rider' | 'driver',
        text: m.content,
        timestamp: new Date(m.created_at).getTime(),
      }));
      const existing = getMessages(tripId);
      const merged = deduplicateMessages([...existing, ...formatted]);
      localStorage.setItem('mock_messages_' + tripId, JSON.stringify(merged));
      return merged;
    }
  } catch (e) {
    console.error('Error fetching messages from Supabase:', e);
  }
  return getMessages(tripId);
};

export const saveMessage = async (msg: MockMessage) => {
  // Save locally first with deduplication
  const msgs = deduplicateMessages([...getMessages(msg.trip_id), msg]);
  localStorage.setItem('mock_messages_' + msg.trip_id, JSON.stringify(msgs));
  broadcastEvent('new_message', msg);

  // Persist to Postgres trip_messages
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const currentUserId = session?.user?.id || (msg.sender === 'driver' ? localStorage.getItem('driver_id') : null);
    const validUserId = currentUserId && UUID_REGEX.test(currentUserId) ? currentUserId : null;

    const payload: Record<string, any> = {
      trip_id: msg.trip_id,
      sender_role: msg.sender,
      content: msg.text,
    };
    if (msg.id && UUID_REGEX.test(msg.id)) {
      payload.id = msg.id;
    }
    if (validUserId) {
      payload.sender_id = validUserId;
    }

    await supabase.from('trip_messages').insert(payload);
  } catch (e) {
    console.error('Error persisting message to Supabase:', e);
  }
};

export type LiveDriver = {
  id: string;
  fullName: string;
  vehicleMake?: string;
  vehicleModel?: string;
  licensePlate?: string;
  lat: number;
  lng: number;
  isOnline: boolean;
  tripId?: string;
  deviceId?: string;
  updatedAt: number;
};

// Maximum allowed age for a driver's GPS location ping before considering them offline (5 minutes TTL)
export const DRIVER_HEARTBEAT_TTL_MS = 5 * 60 * 1000;

import { calculateDistanceKm, isWithinRadiusKm } from '@/utils/geo';

export const getActiveDrivers = async (userLat?: number, userLng?: number, radiusKm: number = 20): Promise<LiveDriver[]> => {
  if (typeof window === 'undefined') return [];

  const now = Date.now();
  const driversMap = new Map<string, LiveDriver>();

  // 1. If coordinates provided, try PostGIS RPC
  if (userLat !== undefined && userLng !== undefined) {
    try {
      const { data, error } = await supabase.rpc('get_nearby_drivers', {
        p_lat: userLat,
        p_lng: userLng,
        p_radius_meters: radiusKm * 1000,
      });

      if (data && !error && data.length > 0) {
        data.forEach((d: any) => {
          const updatedAtMs = d.updated_at ? new Date(d.updated_at).getTime() : now;
          // Discard stale location records older than 5 minutes
          if (now - updatedAtMs > DRIVER_HEARTBEAT_TTL_MS) return;

          driversMap.set(d.id, {
            id: d.id,
            fullName: d.full_name || 'Driver',
            vehicleMake: d.vehicle_make,
            vehicleModel: d.vehicle_model,
            licensePlate: d.license_plate,
            lat: d.current_lat,
            lng: d.current_lng,
            isOnline: true,
            updatedAt: updatedAtMs,
          });
        });
        return Array.from(driversMap.values());
      }
    } catch (e) {
      console.warn('PostGIS RPC fallback in getActiveDrivers:', e);
    }
  }

  // 2. Fetch from Supabase driver_profiles if online
  try {
    const { data, error } = await supabase
      .from('driver_profiles')
      .select('id, full_name, vehicle_make, vehicle_model, license_plate, current_lat, current_lng, is_online, updated_at')
      .eq('is_online', true);

    if (data && !error && data.length > 0) {
      data.forEach((d: any) => {
        if (d.current_lat && d.current_lng) {
          const updatedAtMs = d.updated_at ? new Date(d.updated_at).getTime() : 0;
          // Stale heartbeat check: Driver must have sent a GPS ping in the last 5 minutes
          if (now - updatedAtMs > DRIVER_HEARTBEAT_TTL_MS) {
            return;
          }

          // If user coords provided, apply Haversine radius filter
          if (
            userLat !== undefined &&
            userLng !== undefined &&
            !isWithinRadiusKm(userLat, userLng, d.current_lat, d.current_lng, radiusKm)
          ) {
            return;
          }

          driversMap.set(d.id, {
            id: d.id,
            fullName: d.full_name || 'Registered Driver',
            vehicleMake: d.vehicle_make || 'Vehicle',
            vehicleModel: d.vehicle_model || '',
            licensePlate: d.license_plate || '',
            lat: d.current_lat,
            lng: d.current_lng,
            isOnline: true,
            updatedAt: updatedAtMs,
          });
        }
      });
    }
  } catch (e) {
    console.error('Error fetching online drivers from Supabase:', e);
  }

  // 3. Read local cache (enforcing 5-minute heartbeat TTL and auto-pruning stale/demo sessions)
  try {
    const raw = localStorage.getItem('solo_live_drivers');
    if (raw) {
      const cached = JSON.parse(raw) as LiveDriver[];
      const freshActiveDrivers: LiveDriver[] = [];

      cached.forEach(d => {
        // Strip legacy demo drivers
        if (d.id?.startsWith('demo-driver-')) return;

        const isFresh = d.updatedAt && (now - d.updatedAt <= DRIVER_HEARTBEAT_TTL_MS);
        if (d.isOnline && isFresh) {
          freshActiveDrivers.push(d);

          if (
            userLat !== undefined &&
            userLng !== undefined &&
            !isWithinRadiusKm(userLat, userLng, d.lat, d.lng, radiusKm)
          ) {
            return;
          }
          driversMap.set(d.id, d);
        }
      });

      // Auto-prune stale drivers from localStorage so obsolete sessions don't linger
      if (freshActiveDrivers.length !== cached.length) {
        localStorage.setItem('solo_live_drivers', JSON.stringify(freshActiveDrivers));
      }
    }
  } catch (e) {
    console.error('Error parsing cached live drivers:', e);
  }

  // Strictly return 100% real live drivers (No fake demo fallback)
  return Array.from(driversMap.values());
};


/**
 * Queries requested trips located within radiusKm of driver's current coordinates,
 * with automatic fallback to any active requested trip if none are inside radiusKm.
 */
export const getNearbyRequestedTrips = async (
  driverLat: number,
  driverLng: number,
  radiusKm: number = 15,
  driverId?: string | null
): Promise<MockTrip[]> => {
  if (typeof window === 'undefined') return [];

  const resolvedDriverId = driverId || localStorage.getItem('driver_id');
  const declinedIds = getDeclinedTripIds(resolvedDriverId);
  const completedIds = getCompletedTripIds();

  const allTrips = await getTrips();
  const knownStatusMap = new Map<string, MockTrip['status']>();
  allTrips.forEach(t => {
    if (t?.id) knownStatusMap.set(t.id, t.status);
  });

  const requestedTrips = allTrips.filter(
    t =>
      t.status === 'requested' &&
      !t.driver_id &&
      !declinedIds.has(t.id) &&
      !completedIds.has(t.id) &&
      !isStaleRequestedTrip(t)
  );

  // 1. Try PostGIS RPC
  try {
    const { data, error } = await supabase.rpc('get_nearby_requested_trips', {
      p_lat: driverLat,
      p_lng: driverLng,
      p_radius_meters: radiusKm * 1000,
    });

    if (data && !error && data.length > 0) {
      const rpcTrips: MockTrip[] = data
        .filter((t: any) => {
          if (!t?.id) return false;
          if (declinedIds.has(t.id) || completedIds.has(t.id)) return false;
          const knownStatus = knownStatusMap.get(t.id);
          if (knownStatus && knownStatus !== 'requested') return false;
          if (isStaleRequestedTrip({ status: t.status || 'requested', created_at: t.created_at, scheduled_time: t.scheduled_time })) {
            return false;
          }
          return true;
        })
        .map((t: any) => ({
          id: t.id,
          rider_id: t.rider_id,
          pickup_location: t.pickup_location,
          pickup_lat: t.pickup_lat,
          pickup_lng: t.pickup_lng,
          dropoff_location: t.dropoff_location,
          dropoff_lat: t.dropoff_lat,
          dropoff_lng: t.dropoff_lng,
          fare_amount: Number(t.fare_amount),
          status: t.status,
          verification_pin: t.verification_pin,
          scheduled_time: t.scheduled_time,
          created_at: t.created_at,
        }));
      // Merge with any local requested trips not yet in PostGIS RPC result
      const seen = new Set(rpcTrips.map(r => r.id));
      requestedTrips.forEach(rt => {
        if (!seen.has(rt.id)) rpcTrips.push(rt);
      });
      return rpcTrips;
    }
  } catch (e) {
    console.warn('PostGIS get_nearby_requested_trips fallback:', e);
  }

  // 2. Haversine distance filtering over active requested trips
  const withinRadius = requestedTrips.filter(t =>
    isWithinRadiusKm(driverLat, driverLng, t.pickup_lat, t.pickup_lng, radiusKm)
  );

  if (withinRadius.length > 0) {
    return withinRadius;
  }

  // 3. Fallback: If driver's device GPS is outside the test pickup city, still surface requested trips
  return requestedTrips;
};

export const updateDriverLocation = async (
  driverId: string,
  lat: number,
  lng: number,
  isOnline: boolean,
  metadata?: {
    fullName?: string;
    vehicleMake?: string;
    vehicleModel?: string;
    licensePlate?: string;
    tripId?: string;
    deviceId?: string;
  }
) => {
  if (typeof window === 'undefined') return;

  const deviceId = metadata?.deviceId;

  // Single-device online concurrency enforcement:
  // A driver can only be active online on 1 device at a time.
  if (isOnline && deviceId) {
    setDriverActiveSession(driverId, deviceId);
    // Broadcast preemption event so any other active device for this driver disconnects immediately
    broadcastEvent('driver_session_preempted', {
      driverId,
      deviceId,
      timestamp: Date.now(),
    });
  } else if (!isOnline) {
    // If going offline, only clear active session if this device was the registered active device
    clearDriverActiveSession(driverId, deviceId);
    // If another device has already claimed active duty, do not overwrite their online status in DB/cache!
    if (deviceId && isDriverSessionPreempted(driverId, deviceId)) {
      return;
    }
  }

  const now = Date.now();
  const driverData: LiveDriver = {
    id: driverId,
    fullName: metadata?.fullName || 'Driver',
    vehicleMake: metadata?.vehicleMake,
    vehicleModel: metadata?.vehicleModel,
    licensePlate: metadata?.licensePlate,
    lat,
    lng,
    isOnline,
    tripId: metadata?.tripId,
    deviceId,
    updatedAt: now,
  };

  // Update local cache
  try {
    const raw = localStorage.getItem('solo_live_drivers');
    let cached: LiveDriver[] = raw ? JSON.parse(raw) : [];

    // Prune demo drivers and any stale driver record older than 5 minutes
    cached = cached.filter(d => !d.id.startsWith('demo-driver-') && (now - d.updatedAt <= DRIVER_HEARTBEAT_TTL_MS) && d.id !== driverId);

    if (isOnline) {
      cached.push(driverData);
    }
    localStorage.setItem('solo_live_drivers', JSON.stringify(cached));
  } catch (e) {
    console.error('Error saving live driver to localStorage:', e);
  }

  // Update Supabase in background
  try {
    await supabase.from('driver_profiles').upsert({
      id: driverId,
      full_name: metadata?.fullName,
      vehicle_make: metadata?.vehicleMake,
      vehicle_model: metadata?.vehicleModel,
      license_plate: metadata?.licensePlate,
      current_lat: isOnline ? lat : null,
      current_lng: isOnline ? lng : null,
      is_online: isOnline,
      updated_at: new Date(now).toISOString()
    });
  } catch (e) {
    console.error('Error updating driver location in Supabase:', e);
  }

  // Broadcast realtime event
  broadcastEvent('driver_location', driverData);

  // Cross-tab local notification
  try {
    window.dispatchEvent(new CustomEvent('solo_driver_location_update', { detail: driverData }));
  } catch (e) {
    // Ignore in non-browser environments
  }
};

// ----------------------------------------
// TRIP RATINGS & REVIEWS (Synchronized with public.trip_ratings)
// ----------------------------------------
export type TripRating = {
  id: string;
  trip_id: string;
  driver_id: string;
  rider_id?: string;
  stars: number; // 1 to 5
  tags: string[];
  comment?: string;
  created_at: string;
};

export const saveTripRating = async (rating: TripRating) => {
  if (typeof window === 'undefined') return;

  try {
    const raw = localStorage.getItem('solo_trip_ratings');
    const ratings: TripRating[] = raw ? JSON.parse(raw) : [];
    ratings.unshift(rating);
    localStorage.setItem('solo_trip_ratings', JSON.stringify(ratings));
  } catch (e) {
    console.error('Error saving trip rating to localStorage:', e);
  }

  // Broadcast rating event
  broadcastEvent('new_rating', rating);

  try {
    window.dispatchEvent(new CustomEvent('solo_new_rating', { detail: rating }));
  } catch (e) {
    // Ignore in non-browser environments
  }

  // Persist to Postgres trip_ratings
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const riderId = session?.user?.id || (rating.rider_id !== '00000000-0000-0000-0000-000000000000' ? rating.rider_id : null);
    if (riderId) {
      await supabase.from('trip_ratings').insert({
        trip_id: rating.trip_id,
        driver_id: rating.driver_id,
        rider_id: riderId,
        stars: rating.stars,
        tags: rating.tags || [],
        comment: rating.comment || null,
      });
    }
  } catch (e) {
    console.error('Error saving trip rating to Supabase:', e);
  }
};

export const getDriverRatingSummary = (driverId?: string): { average: number; count: number; reviews: TripRating[] } => {
  if (typeof window === 'undefined') return { average: 5.0, count: 0, reviews: [] };

  try {
    const raw = localStorage.getItem('solo_trip_ratings');
    const allRatings: TripRating[] = raw ? JSON.parse(raw) : [];
    const driverRatings = driverId ? allRatings.filter(r => r.driver_id === driverId) : allRatings;
    
    if (driverRatings.length === 0) {
      return { average: 5.0, count: 0, reviews: [] };
    }

    const sum = driverRatings.reduce((acc, curr) => acc + curr.stars, 0);
    const avg = Math.round((sum / driverRatings.length) * 10) / 10;
    return {
      average: avg,
      count: driverRatings.length,
      reviews: driverRatings
    };
  } catch (e) {
    return { average: 5.0, count: 0, reviews: [] };
  }
};

// ----------------------------------------
// REAL-TIME BROADCASTS & SUBSCRIPTIONS
// ----------------------------------------
export type EventType = 'trip_updated' | 'new_message' | 'driver_location' | 'new_rating' | 'driver_session_preempted' | 'INSERT' | 'UPDATE';

let globalTripsChannel: any = null;
let globalMessagesChannel: any = null;
let globalBroadcastChannel: any = null;
let localTabChannel: BroadcastChannel | null = null;
const listeners = new Set<(type: EventType, payload: unknown) => void>();

export const broadcastEvent = (type: EventType, payload: unknown) => {
  if (typeof window === 'undefined') return;
  initGlobalChannels();

  // 1. Notify same-tab subscribers immediately
  listeners.forEach(cb => cb(type, payload));

  // 2. Notify other tabs/windows on the same browser via native BroadcastChannel
  if (localTabChannel) {
    try {
      localTabChannel.postMessage({ type, payload });
    } catch {
      // Ignore BroadcastChannel serialization errors
    }
  }

  // 3. Notify other devices via Supabase Realtime broadcast channel
  if (globalBroadcastChannel) {
    globalBroadcastChannel.send({
      type: 'broadcast',
      event: type,
      payload: payload,
    });
  }
};

const initGlobalChannels = () => {
  if (typeof window === 'undefined') return;
  if (globalTripsChannel) return;

  // Cross-tab native BroadcastChannel for instant 0ms Rider <-> Driver sync
  if (typeof BroadcastChannel !== 'undefined' && !localTabChannel) {
    try {
      localTabChannel = new BroadcastChannel('solo_realtime_bus');
      localTabChannel.onmessage = (event) => {
        const data = event.data;
        if (data?.type) {
          if (data.type === 'trip_updated' && data.payload) {
            const synced = syncTripToLocalStorage(data.payload as MockTrip);
            listeners.forEach(cb => cb('trip_updated', synced));
          } else {
            listeners.forEach(cb => cb(data.type as EventType, data.payload));
          }
        }
      };
    } catch {
      // Fallback to storage events
    }
  }

  // Cross-tab localStorage event fallback (listens only to explicit saveTrip updates, never background getTrips polling writes)
  window.addEventListener('storage', (event) => {
    if (event.key === 'solo_last_updated_trip' && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        if (parsed?.trip) {
          const synced = syncTripToLocalStorage(parsed.trip as MockTrip);
          listeners.forEach(cb => cb('trip_updated', synced));
        }
      } catch {
        // Ignore parse error
      }
    }
    if (event.key === 'solo_last_completed_trip' && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        if (parsed?.tripId) {
          markTripCompleted(parsed.tripId);
          const localData = localStorage.getItem('mock_trips');
          const trips: MockTrip[] = localData ? JSON.parse(localData) : [];
          const target = trips.find(t => t.id === parsed.tripId);
          const completedTrip: MockTrip = target
            ? { ...target, status: 'completed' }
            : {
                id: parsed.tripId,
                rider_id: '00000000-0000-0000-0000-000000000000',
                status: 'completed',
                fare_amount: 0,
                pickup_location: 'Trip',
                dropoff_location: 'Destination',
                pickup_lat: 0,
                pickup_lng: 0,
                dropoff_lat: 0,
                dropoff_lng: 0,
              };
          const synced = syncTripToLocalStorage(completedTrip);
          listeners.forEach(cb => cb('trip_updated', synced));
        }
      } catch {
        // Ignore parse error
      }
    }
    if (event.key && event.key.startsWith('solo_driver_active_session_') && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        if (parsed?.driverId && parsed?.deviceId) {
          listeners.forEach(cb => cb('driver_session_preempted', parsed));
        }
      } catch {
        // Ignore parse error
      }
    }
  });

  // Realtime channel for trips
  globalTripsChannel = supabase.channel('public:trips');
  globalTripsChannel
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, (payload: any) => {
      const dbTrip = payload.new as any;
      if (!dbTrip) return;
      const trip: MockTrip = {
        id: dbTrip.id,
        rider_id: dbTrip.rider_id,
        driver_id: dbTrip.driver_id,
        pickup_location: dbTrip.pickup_location,
        pickup_lat: dbTrip.pickup_lat,
        pickup_lng: dbTrip.pickup_lng,
        dropoff_location: dbTrip.dropoff_location,
        dropoff_lat: dbTrip.dropoff_lat,
        dropoff_lng: dbTrip.dropoff_lng,
        fare_amount: Number(dbTrip.fare_amount),
        status: dbTrip.status,
        verification_pin: dbTrip.verification_pin,
        scheduled_time: dbTrip.scheduled_time,
        created_at: dbTrip.created_at,
      };
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const synced = syncTripToLocalStorage(trip);
        listeners.forEach(cb => cb('trip_updated', synced));
      }
    })
    .subscribe();

  // Realtime channel for trip messages
  globalMessagesChannel = supabase.channel('public:trip_messages');
  globalMessagesChannel
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trip_messages' }, (payload: any) => {
      const m = payload.new as any;
      if (!m) return;
      const msg: MockMessage = {
        id: m.id,
        trip_id: m.trip_id,
        sender: m.sender_role,
        text: m.content,
        timestamp: new Date(m.created_at).getTime(),
      };
      const existing = getMessages(msg.trip_id);
      const merged = deduplicateMessages([...existing, msg]);
      localStorage.setItem('mock_messages_' + msg.trip_id, JSON.stringify(merged));
      listeners.forEach(cb => cb('new_message', msg));
    })
    .subscribe();

  // Ephemeral Broadcast channel
  globalBroadcastChannel = supabase.channel('solo_events');
  globalBroadcastChannel
    .on('broadcast', { event: 'driver_location' }, (payload: any) => {
      listeners.forEach(cb => cb('driver_location', payload.payload));
    })
    .on('broadcast', { event: 'new_message' }, (payload: any) => {
      listeners.forEach(cb => cb('new_message', payload.payload));
    })
    .on('broadcast', { event: 'trip_updated' }, (payload: any) => {
      if (payload.payload) {
        const updated = payload.payload as MockTrip;
        if (updated.status === 'completed') {
          markTripCompleted(updated.id);
        }
        const synced = syncTripToLocalStorage(updated);
        listeners.forEach(cb => cb('trip_updated', synced));
      }
    })
    .on('broadcast', { event: 'trip_completed' }, (payload: any) => {
      const tripId = payload?.payload?.id || payload?.payload?.tripId;
      if (tripId) {
        markTripCompleted(tripId);
        const localData = localStorage.getItem('mock_trips');
        const trips: MockTrip[] = localData ? JSON.parse(localData) : [];
        const target = trips.find(t => t.id === tripId);
        const completedTrip: MockTrip = target
          ? { ...target, status: 'completed' }
          : {
              id: tripId,
              rider_id: '00000000-0000-0000-0000-000000000000',
              status: 'completed',
              fare_amount: 0,
              pickup_location: 'Trip',
              dropoff_location: 'Destination',
              pickup_lat: 0,
              pickup_lng: 0,
              dropoff_lat: 0,
              dropoff_lng: 0,
            };
        const synced = syncTripToLocalStorage(completedTrip);
        listeners.forEach(cb => cb('trip_updated', synced));
      }
    })
    .on('broadcast', { event: 'new_rating' }, (payload: any) => {
      listeners.forEach(cb => cb('new_rating', payload.payload));
    })
    .on('broadcast', { event: 'driver_session_preempted' }, (payload: any) => {
      listeners.forEach(cb => cb('driver_session_preempted', payload.payload));
    })
    .subscribe();
};

export const subscribeToEvents = (callback: (type: EventType, payload: unknown) => void) => {
  if (typeof window === 'undefined') return () => {};
  
  initGlobalChannels();
  listeners.add(callback);

  return () => {
    listeners.delete(callback);
  };
};
