import { supabase } from './supabaseClient';

export type MockTrip = {
  id: string; // UUID in Supabase
  rider_id: string;
  driver_id?: string; // Added driver_id
  pickup_location: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_location: string;
  dropoff_lat: number;
  dropoff_lng: number;
  fare_amount: number;
  status: 'requested' | 'accepted' | 'in_progress' | 'payment_pending' | 'completed';
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
          hasLicense: data.has_license,
          hasPrdp: data.has_prdp,
          hasRoadworthy: data.has_roadworthy,
          subscriptionActive: data.subscription_active,
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
      ...(profile.id ? { id: profile.id } : {}), // only include id if it exists
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
      // Save the real UUID assigned by Supabase
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
    // Fetch all active or recently completed trips (simplified for Phase 1)
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
    const dbPayload = {
      id: trip.id,
      rider_id: trip.rider_id || '00000000-0000-0000-0000-000000000000', // Mock UUID for rider
      driver_id: trip.driver_id,
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

  // Still broadcast via Supabase Realtime (or fallback broadcast)
  // We'll let Supabase handle the real-time sync automatically via postgres_changes!
};

// ----------------------------------------
// MESSAGE METHODS (Still local for now)
// ----------------------------------------
export const getMessages = (tripId: string): MockMessage[] => {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem('mock_messages_' + tripId);
  return data ? JSON.parse(data) : [];
};

export const saveMessage = (msg: MockMessage) => {
  const msgs = getMessages(msg.trip_id);
  msgs.push(msg);
  localStorage.setItem('mock_messages_' + msg.trip_id, JSON.stringify(msgs));
  broadcastEvent('new_message', msg);
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

export const getActiveDrivers = async (): Promise<LiveDriver[]> => {
  if (typeof window === 'undefined') return [];

  const driversMap = new Map<string, LiveDriver>();

  // 1. Fetch from Supabase driver_profiles if online
  try {
    const { data, error } = await supabase
      .from('driver_profiles')
      .select('id, full_name, vehicle_make, vehicle_model, license_plate, current_lat, current_lng, is_online, updated_at')
      .eq('is_online', true);

    if (data && !error && data.length > 0) {
      data.forEach((d: any) => {
        if (d.current_lat && d.current_lng) {
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

  // 2. Read local cache
  try {
    const raw = localStorage.getItem('solo_live_drivers');
    if (raw) {
      const cached = JSON.parse(raw) as LiveDriver[];
      cached.forEach(d => {
        if (d.isOnline) {
          driversMap.set(d.id, d);
        }
      });
    }
  } catch (e) {
    console.error('Error parsing cached live drivers:', e);
  }

  // 3. Fallback demo drivers if no live drivers yet
  if (driversMap.size === 0) {
    DEFAULT_DEMO_DRIVERS.forEach(d => driversMap.set(d.id, d));
  }

  return Array.from(driversMap.values());
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
// TRIP RATINGS & REVIEWS
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

  // Also broadcast rating event
  broadcastEvent('new_rating', rating);

  try {
    window.dispatchEvent(new CustomEvent('solo_new_rating', { detail: rating }));
  } catch (e) {
    // Ignore in non-browser environments
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
// REAL-TIME BROADCASTS (Supabase Channels)
// ----------------------------------------
type EventType = 'trip_updated' | 'new_message' | 'driver_location' | 'new_rating';

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
let globalBroadcastChannel: any = null;
const listeners = new Set<(type: EventType, payload: unknown) => void>();

const initGlobalChannels = () => {
  if (typeof window === 'undefined') return;
  if (globalTripsChannel) return;

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
        scheduled_time: dbTrip.scheduled_time,
      };
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        listeners.forEach(cb => cb('trip_updated', trip));
      }
    })
    .subscribe();

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
