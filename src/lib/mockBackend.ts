import { supabase } from './supabaseClient';

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
  subscriptionPlan?: 'trial' | 'paid';
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
        return {
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
      }
    } catch (e) {
      console.error('Error fetching driver profile:', e);
    }
  }

  // Fallback to local cache if offline or missing
  const localData = localStorage.getItem('mock_driver_profile');
  return localData ? JSON.parse(localData) : null;
};

export const saveDriverProfile = async (profile: MockDriverProfile) => {
  if (typeof window === 'undefined') return;
  
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
export const getTrips = async (): Promise<MockTrip[]> => {
  if (typeof window === 'undefined') return [];
  
  try {
    const { data, error } = await supabase.from('trips').select('*').order('created_at', { ascending: false }).limit(50);
    if (data && !error) {
      return data;
    }
  } catch (e) {
    console.error('Error fetching trips from Supabase:', e);
  }

  // Fallback to local
  const localData = localStorage.getItem('mock_trips');
  return localData ? JSON.parse(localData) : [];
};

export const saveTrip = async (trip: MockTrip) => {
  // Save locally first for instant UI response (Optimistic Update)
  const localData = localStorage.getItem('mock_trips');
  const trips: MockTrip[] = localData ? JSON.parse(localData) : [];
  const existingIndex = trips.findIndex(t => t.id === trip.id);
  if (existingIndex >= 0) trips[existingIndex] = trip;
  else trips.push(trip);
  localStorage.setItem('mock_trips', JSON.stringify(trips));

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const currentUserId = session?.user?.id;
    const resolvedRiderId = (trip.rider_id && trip.rider_id !== '00000000-0000-0000-0000-000000000000')
      ? trip.rider_id
      : (currentUserId || '00000000-0000-0000-0000-000000000000');

    const dbPayload = {
      id: trip.id,
      rider_id: resolvedRiderId,
      driver_id: trip.driver_id || null,
      pickup_location: trip.pickup_location,
      pickup_lat: trip.pickup_lat,
      pickup_lng: trip.pickup_lng,
      dropoff_location: trip.dropoff_location,
      dropoff_lat: trip.dropoff_lat,
      dropoff_lng: trip.dropoff_lng,
      fare_amount: trip.fare_amount,
      status: trip.status,
      scheduled_time: trip.scheduled_time ? new Date(trip.scheduled_time).toISOString() : null,
    };

    const { error } = await supabase.from('trips').upsert(dbPayload).select().single();
    if (error) throw error;
  } catch (e) {
    console.error('Error saving trip to Supabase:', e);
  }
};

/**
 * Atomic trip acceptance using the hardened Postgres RPC
 */
export const acceptTripAtomic = async (tripId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const { data, error } = await supabase.rpc('accept_trip', { p_trip_id: tripId });
    if (error) {
      return { success: false, error: error.message };
    }
    const res = data as { success?: boolean; status?: string };
    return { success: !!res?.success };
  } catch (e: unknown) {
    return { success: false, error: (e as Error)?.message || 'Failed to accept trip atomically' };
  }
};

/**
 * Atomic trip start with rider 4-digit verification PIN
 */
export const startTripWithPin = async (tripId: string, pin: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const { data, error } = await supabase.rpc('start_trip', { p_trip_id: tripId, p_pin: pin });
    if (error) {
      return { success: false, error: error.message };
    }
    const res = data as { success?: boolean };
    return { success: !!res?.success };
  } catch (e: unknown) {
    return { success: false, error: (e as Error)?.message || 'Invalid PIN' };
  }
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
 * Queries requested trips located within radiusKm of driver's current coordinates
 */
export const getNearbyRequestedTrips = async (
  driverLat: number,
  driverLng: number,
  radiusKm: number = 15
): Promise<MockTrip[]> => {
  if (typeof window === 'undefined') return [];

  // 1. Try PostGIS RPC
  try {
    const { data, error } = await supabase.rpc('get_nearby_requested_trips', {
      p_lat: driverLat,
      p_lng: driverLng,
      p_radius_meters: radiusKm * 1000,
    });

    if (data && !error && data.length > 0) {
      return data.map((t: any) => ({
        id: t.id,
        rider_id: t.rider_id,
        pickup_location: t.pickup_location,
        pickup_lat: t.pickup_lat,
        pickup_lng: t.pickup_lng,
        dropoff_location: t.dropoff_location,
        dropoff_lat: t.dropoff_lat,
        dropoff_lng: t.dropoff_lng,
        fare_amount: t.fare_amount,
        status: t.status,
        scheduled_time: t.scheduled_time,
        created_at: t.created_at,
      }));
    }
  } catch (e) {
    console.warn('PostGIS get_nearby_requested_trips fallback:', e);
  }

  // 2. Fallback: Haversine distance filtering over active trips
  const allTrips = await getTrips();
  return allTrips.filter(
    t =>
      t.status === 'requested' &&
      !t.driver_id &&
      isWithinRadiusKm(driverLat, driverLng, t.pickup_lat, t.pickup_lng, radiusKm)
  );
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

export const broadcastEvent = (type: EventType, payload: unknown) => {
  if (typeof window === 'undefined') return;
  initGlobalChannels();
  if (globalBroadcastChannel) {
    globalBroadcastChannel.send({
      type: 'broadcast',
      event: type,
      payload: payload,
    });
  }
};

let globalTripsChannel: any = null;
let globalMessagesChannel: any = null;
let globalBroadcastChannel: any = null;
const listeners = new Set<(type: EventType, payload: unknown) => void>();

const initGlobalChannels = () => {
  if (typeof window === 'undefined') return;
  if (globalTripsChannel) return;

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
        fare_amount: dbTrip.fare_amount,
        status: dbTrip.status,
        verification_pin: dbTrip.verification_pin,
        scheduled_time: dbTrip.scheduled_time,
      };
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
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
