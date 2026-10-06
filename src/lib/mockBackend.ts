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

// ----------------------------------------
// REAL-TIME BROADCASTS (Supabase Channels)
// ----------------------------------------
type EventType = 'trip_updated' | 'new_message' | 'driver_location';

export const broadcastEvent = (type: EventType, payload: unknown) => {
  if (typeof window === 'undefined') return;
  // Send via Supabase Broadcast (bypasses DB, very fast for GPS)
  const channel = supabase.channel('solo_events');
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      channel.send({
        type: 'broadcast',
        event: type,
        payload: payload,
      });
    }
  });
};

export const subscribeToEvents = (callback: (type: EventType, payload: unknown) => void) => {
  if (typeof window === 'undefined') return () => {};

  // 1. Listen for Database Changes (Trips)
  const dbChannel = supabase.channel('public:trips')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, (payload) => {
      // Convert DB payload back to frontend camelCase model
      const dbTrip = payload.new as any;
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

      if (payload.eventType === 'INSERT') {
        callback('trip_updated', trip); // Treat inserts as updates for the UI to pick up
      } else if (payload.eventType === 'UPDATE') {
        callback('trip_updated', trip);
      }
    })
    .subscribe();

  // 2. Listen for Broadcasts (GPS, Messages)
  const broadcastChannel = supabase.channel('solo_events')
    .on('broadcast', { event: 'driver_location' }, (payload) => {
      callback('driver_location', payload.payload);
    })
    .on('broadcast', { event: 'new_message' }, (payload) => {
      callback('new_message', payload.payload);
    })
    .on('broadcast', { event: 'trip_updated' }, (payload) => {
      // Fallback for local optimism
      callback('trip_updated', payload.payload);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(dbChannel);
    supabase.removeChannel(broadcastChannel);
  };
};
