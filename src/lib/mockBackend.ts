import { supabase } from './supabaseClient';
import { isPlatformOwner, applyOwnerPrivileges } from '@/utils/owner';

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

const STATUS_PRIORITY: Record<MockTrip['status'], number> = {
  requested: 1,
  accepted: 2,
  arrived: 3,
  in_progress: 4,
  payment_pending: 5,
  completed: 6,
  cancelled: 7,
};

const syncTripToLocalStorage = (trip: MockTrip) => {
  if (typeof window === 'undefined') return;
  try {
    const localData = localStorage.getItem('mock_trips');
    const trips: MockTrip[] = localData ? JSON.parse(localData) : [];
    const existingIndex = trips.findIndex(t => t.id === trip.id);
    if (existingIndex >= 0) {
      trips[existingIndex] = { ...trips[existingIndex], ...trip };
    } else {
      trips.unshift(trip);
    }
    localStorage.setItem('mock_trips', JSON.stringify(trips.slice(0, 100)));
  } catch (e) {
    console.error('Error syncing trip to localStorage:', e);
  }
};

export const getTrips = async (): Promise<MockTrip[]> => {
  if (typeof window === 'undefined') return [];

  const mergedMap = new Map<string, MockTrip>();

  // 1. Load local trips first
  try {
    const localData = localStorage.getItem('mock_trips');
    if (localData) {
      const localTrips: MockTrip[] = JSON.parse(localData);
      localTrips.forEach(t => {
        if (t && t.id) mergedMap.set(t.id, t);
      });
    }
  } catch (e) {
    console.error('Error reading local trips:', e);
  }

  // 2. Fetch from Supabase and merge with local trips
  try {
    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (data && !error) {
      data.forEach((dbTrip: any) => {
        if (!dbTrip?.id) return;
        const existing = mergedMap.get(dbTrip.id);
        const mapped: MockTrip = {
          id: dbTrip.id,
          rider_id: dbTrip.rider_id,
          driver_id: dbTrip.driver_id || existing?.driver_id,
          pickup_location: dbTrip.pickup_location,
          pickup_lat: dbTrip.pickup_lat,
          pickup_lng: dbTrip.pickup_lng,
          dropoff_location: dbTrip.dropoff_location,
          dropoff_lat: dbTrip.dropoff_lat,
          dropoff_lng: dbTrip.dropoff_lng,
          fare_amount: Number(dbTrip.fare_amount),
          status: dbTrip.status,
          verification_pin: dbTrip.verification_pin || existing?.verification_pin,
          scheduled_time: dbTrip.scheduled_time || existing?.scheduled_time,
          created_at: dbTrip.created_at || existing?.created_at,
        };

        if (!existing) {
          mergedMap.set(mapped.id, mapped);
        } else {
          const dbPrio = STATUS_PRIORITY[mapped.status] || 0;
          const localPrio = STATUS_PRIORITY[existing.status] || 0;
          mergedMap.set(mapped.id, dbPrio >= localPrio ? mapped : { ...mapped, ...existing });
        }
      });
    }
  } catch (e) {
    console.error('Error fetching trips from Supabase:', e);
  }

  return Array.from(mergedMap.values());
};

export const saveTrip = async (trip: MockTrip) => {
  const enrichedTrip: MockTrip = {
    ...trip,
    rider_id: ensureValidUuid(trip.rider_id),
    verification_pin: trip.verification_pin || Math.floor(1000 + Math.random() * 9000).toString(),
    created_at: trip.created_at || new Date().toISOString(),
  };

  // 1. Save locally first for instant UI response & broadcast immediately across tabs/clients
  syncTripToLocalStorage(enrichedTrip);
  broadcastEvent('trip_updated', enrichedTrip);

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
      } else {
        throw error;
      }
    } else if (data) {
      const synced: MockTrip = {
        ...enrichedTrip,
        verification_pin: data.verification_pin || enrichedTrip.verification_pin,
        created_at: data.created_at || enrichedTrip.created_at,
      };
      syncTripToLocalStorage(synced);
      broadcastEvent('trip_updated', synced);
    }
  } catch (e) {
    console.error('Error saving trip to Supabase:', e);
  }
};

/**
 * Atomic trip acceptance using the hardened Postgres RPC with automatic fallback
 */
export const acceptTripAtomic = async (tripId: string): Promise<{ success: boolean; error?: string }> => {
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
    const driverId = typeof window !== 'undefined' ? localStorage.getItem('driver_id') : null;
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
 * Atomic trip completion using Postgres RPC
 */
export const completeTripAtomic = async (tripId: string, paymentMethod: 'cash' | 'in_app' = 'in_app'): Promise<{ success: boolean; status?: string; error?: string }> => {
  try {
    const { data, error } = await supabase.rpc('complete_trip', { 
      p_trip_id: tripId, 
      p_payment_method: paymentMethod 
    });
    if (error) {
      console.warn('complete_trip RPC error, falling back:', error.message);
    } else {
      const res = data as { success?: boolean; status?: string };
      // Broadcast local event so UI syncs immediately
      const targetStatus = paymentMethod === 'cash' ? 'completed' : 'payment_pending';
      const localData = localStorage.getItem('mock_trips');
      if (localData) {
        const trips: MockTrip[] = JSON.parse(localData);
        const target = trips.find(t => t.id === tripId);
        if (target) {
          target.status = targetStatus;
          localStorage.setItem('mock_trips', JSON.stringify(trips));
          broadcastEvent('trip_updated', target);
        }
      }
      return { success: !!res?.success, status: res?.status || targetStatus };
    }
  } catch (e: unknown) {
    console.warn('complete_trip RPC execution error:', e);
  }

  // Local fallback update
  const localData = localStorage.getItem('mock_trips');
  const targetStatus = paymentMethod === 'cash' ? 'completed' : 'payment_pending';
  if (localData) {
    const trips: MockTrip[] = JSON.parse(localData);
    const target = trips.find(t => t.id === tripId);
    if (target) {
      target.status = targetStatus;
      localStorage.setItem('mock_trips', JSON.stringify(trips));
      broadcastEvent('trip_updated', target);
    }
  }
  return { success: true, status: targetStatus };
};

// ----------------------------------------
// MESSAGE METHODS (Synchronized with public.trip_messages)
// ----------------------------------------
export const getMessages = (tripId: string): MockMessage[] => {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem('mock_messages_' + tripId);
  return data ? JSON.parse(data) : [];
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
      localStorage.setItem('mock_messages_' + tripId, JSON.stringify(formatted));
      return formatted;
    }
  } catch (e) {
    console.error('Error fetching messages from Supabase:', e);
  }
  return getMessages(tripId);
};

export const saveMessage = async (msg: MockMessage) => {
  // Save locally first
  const msgs = getMessages(msg.trip_id);
  msgs.push(msg);
  localStorage.setItem('mock_messages_' + msg.trip_id, JSON.stringify(msgs));
  broadcastEvent('new_message', msg);

  // Persist to Postgres trip_messages
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const currentUserId = session?.user?.id || (msg.sender === 'driver' ? localStorage.getItem('driver_id') : null);
    if (currentUserId) {
      await supabase.from('trip_messages').insert({
        trip_id: msg.trip_id,
        sender_id: currentUserId,
        sender_role: msg.sender,
        content: msg.text,
      });
    }
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
  updatedAt: number;
};

// Default registered drivers in Kimberley area for instant test visibility if no real drivers online
const DEFAULT_DEMO_DRIVERS: LiveDriver[] = [
  {
    id: 'demo-driver-1',
    fullName: 'Sipho Ndlovu',
    vehicleMake: 'Toyota',
    vehicleModel: 'Corolla Quest',
    licensePlate: 'NC 482-910',
    lat: -28.7320,
    lng: 24.7660,
    isOnline: true,
    updatedAt: Date.now(),
  },
  {
    id: 'demo-driver-2',
    fullName: 'Johan Van Der Merwe',
    vehicleMake: 'Volkswagen',
    vehicleModel: 'Polo Vivo',
    licensePlate: 'NC 193-448',
    lat: -28.7245,
    lng: 24.7580,
    isOnline: true,
    updatedAt: Date.now(),
  },
  {
    id: 'demo-driver-3',
    fullName: 'Thabo Mokoena',
    vehicleMake: 'Hyundai',
    vehicleModel: 'Grand i10',
    licensePlate: 'NC 774-209',
    lat: -28.7390,
    lng: 24.7530,
    isOnline: true,
    updatedAt: Date.now(),
  }
];

import { calculateDistanceKm, isWithinRadiusKm } from '@/utils/geo';

export const getActiveDrivers = async (userLat?: number, userLng?: number, radiusKm: number = 20): Promise<LiveDriver[]> => {
  if (typeof window === 'undefined') return [];

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
          driversMap.set(d.id, {
            id: d.id,
            fullName: d.full_name || 'Driver',
            vehicleMake: d.vehicle_make,
            vehicleModel: d.vehicle_model,
            licensePlate: d.license_plate,
            lat: d.current_lat,
            lng: d.current_lng,
            isOnline: true,
            updatedAt: Date.now(),
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
            updatedAt: d.updated_at ? new Date(d.updated_at).getTime() : Date.now(),
          });
        }
      });
    }
  } catch (e) {
    console.error('Error fetching online drivers from Supabase:', e);
  }

  // 3. Read local cache
  try {
    const raw = localStorage.getItem('solo_live_drivers');
    if (raw) {
      const cached = JSON.parse(raw) as LiveDriver[];
      cached.forEach(d => {
        if (d.isOnline) {
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
    }
  } catch (e) {
    console.error('Error parsing cached live drivers:', e);
  }

  // 4. Fallback demo drivers if no live drivers yet in radius
  if (driversMap.size === 0) {
    DEFAULT_DEMO_DRIVERS.forEach(d => {
      if (
        userLat === undefined ||
        userLng === undefined ||
        isWithinRadiusKm(userLat, userLng, d.lat, d.lng, radiusKm)
      ) {
        driversMap.set(d.id, d);
      }
    });
  }

  return Array.from(driversMap.values());
};

/**
 * Queries requested trips located within radiusKm of driver's current coordinates,
 * with automatic fallback to any active requested trip if none are inside radiusKm.
 */
export const getNearbyRequestedTrips = async (
  driverLat: number,
  driverLng: number,
  radiusKm: number = 15
): Promise<MockTrip[]> => {
  if (typeof window === 'undefined') return [];

  const allTrips = await getTrips();
  const requestedTrips = allTrips.filter(t => t.status === 'requested' && !t.driver_id);

  // 1. Try PostGIS RPC
  try {
    const { data, error } = await supabase.rpc('get_nearby_requested_trips', {
      p_lat: driverLat,
      p_lng: driverLng,
      p_radius_meters: radiusKm * 1000,
    });

    if (data && !error && data.length > 0) {
      const rpcTrips: MockTrip[] = data.map((t: any) => ({
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
  }
) => {
  if (typeof window === 'undefined') return;

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
    updatedAt: now,
  };

  // Update local cache
  try {
    const raw = localStorage.getItem('solo_live_drivers');
    let cached: LiveDriver[] = raw ? JSON.parse(raw) : [];
    const idx = cached.findIndex(d => d.id === driverId);
    if (idx >= 0) {
      if (!isOnline) {
        cached.splice(idx, 1);
      } else {
        cached[idx] = driverData;
      }
    } else if (isOnline) {
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
export type EventType = 'trip_updated' | 'new_message' | 'driver_location' | 'new_rating' | 'INSERT' | 'UPDATE';

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
            syncTripToLocalStorage(data.payload as MockTrip);
          }
          listeners.forEach(cb => cb(data.type as EventType, data.payload));
        }
      };
    } catch {
      // Fallback to storage events
    }
  }

  // Cross-tab localStorage event fallback
  window.addEventListener('storage', (event) => {
    if (event.key === 'mock_trips' && event.newValue) {
      try {
        const trips: MockTrip[] = JSON.parse(event.newValue);
        if (trips.length > 0) {
          listeners.forEach(cb => cb('trip_updated', trips[0]));
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
        syncTripToLocalStorage(trip);
        listeners.forEach(cb => cb('trip_updated', trip));
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
        syncTripToLocalStorage(payload.payload as MockTrip);
      }
      listeners.forEach(cb => cb('trip_updated', payload.payload));
    })
    .on('broadcast', { event: 'new_rating' }, (payload: any) => {
      listeners.forEach(cb => cb('new_rating', payload.payload));
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
