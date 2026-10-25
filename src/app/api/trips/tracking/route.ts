import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/utils/apiAuth';
import { validateAdminRequest } from '@/utils/adminAuth';

export const dynamic = 'force-dynamic';

function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// In-memory fallback tracking cache for instant live coordinates across serverless invocations
declare global {
  // eslint-disable-next-line no-var
  var __soloLiveTripTracking: Map<string, {
    driverId: string;
    lat: number;
    lng: number;
    heading?: number;
    speedKmh?: number;
    updatedAt: number;
  }> | undefined;
}

const trackingCache = globalThis.__soloLiveTripTracking ?? (globalThis.__soloLiveTripTracking = new Map());

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tripId = searchParams.get('tripId');

    if (!tripId) {
      return NextResponse.json({ success: false, error: 'tripId is required' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const cachedLive = trackingCache.get(tripId);

    if (!supabase) {
      return NextResponse.json({
        success: true,
        tripId,
        driverCoords: cachedLive ? { lat: cachedLive.lat, lng: cachedLive.lng, heading: cachedLive.heading, speedKmh: cachedLive.speedKmh } : null,
      });
    }

    // 1. Fetch authoritative trip details
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('id, status, fare_amount, pickup_location, pickup_lat, pickup_lng, dropoff_location, dropoff_lat, dropoff_lng, driver_id, verification_pin, scheduled_time, rider_id')
      .eq('id', tripId)
      .maybeSingle();

    if (tripError) {
      return NextResponse.json({ success: false, error: tripError.message }, { status: 500 });
    }

    if (!trip) {
      return NextResponse.json({ success: false, error: 'Trip not found' }, { status: 404 });
    }

    const sanitizedTrip: any = { ...trip };
    const authUser = await getAuthenticatedUser(req);
    const adminCheck = await validateAdminRequest(req);
    const isMock =
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('mock') ||
      process.env.NODE_ENV === 'test';

    // Protect verification_pin from unauthorized third parties
    const isAuthorizedRider = authUser && (authUser.id === trip.rider_id || authUser.isOwner);
    const isAuthorizedAdmin = adminCheck.authorized;
    if (!isAuthorizedRider && !isAuthorizedAdmin && !isMock) {
      delete sanitizedTrip.verification_pin;
    }

    // 2. Fetch assigned driver's live coordinates & profile if assigned
    let driverData: any = null;
    if (trip.driver_id) {
      const { data: profile } = await supabase
        .from('driver_profiles')
        .select('id, full_name, phone, vehicle_make, vehicle_model, vehicle_year, vehicle_color, license_plate, current_lat, current_lng, is_online, updated_at, rating_avg, rating_count')
        .eq('id', trip.driver_id)
        .maybeSingle();

      const liveLat = cachedLive?.lat ?? profile?.current_lat ?? null;
      const liveLng = cachedLive?.lng ?? profile?.current_lng ?? null;

      if (profile || liveLat !== null) {
        driverData = {
          id: trip.driver_id,
          fullName: profile?.full_name || 'Your Assigned Driver',
          phone: profile?.phone,
          vehicleMake: profile?.vehicle_make,
          vehicleModel: profile?.vehicle_model,
          vehicleYear: profile?.vehicle_year,
          vehicleColor: profile?.vehicle_color,
          licensePlate: profile?.license_plate,
          rating: profile?.rating_avg ? Number(profile.rating_avg) : 5.0,
          lat: liveLat,
          lng: liveLng,
          heading: cachedLive?.heading,
          speedKmh: cachedLive?.speedKmh,
          isOnline: profile?.is_online ?? true,
          updatedAt: cachedLive?.updatedAt ?? (profile?.updated_at ? new Date(profile.updated_at).getTime() : Date.now()),
        };
      }
    }

    return NextResponse.json({
      success: true,
      trip: sanitizedTrip,
      driver: driverData,
      driverCoords: driverData?.lat && driverData?.lng ? { lat: driverData.lat, lng: driverData.lng } : null,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tripId, driverId, lat, lng, heading = 0, speedKmh = 0 } = body;

    if (
      !tripId ||
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      isNaN(lat) ||
      isNaN(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return NextResponse.json(
        { success: false, error: 'Valid tripId, lat (-90 to 90), and lng (-180 to 180) are required' },
        { status: 400 }
      );
    }

    const now = Date.now();
    trackingCache.set(tripId, {
      driverId: driverId || 'driver',
      lat,
      lng,
      heading,
      speedKmh,
      updatedAt: now,
    });

    // Update PostGIS/driver_profiles in database if client is configured
    const supabase = getSupabaseServerClient();
    if (supabase && driverId) {
      try {
        await supabase
          .from('driver_profiles')
          .update({
            current_lat: lat,
            current_lng: lng,
            is_online: true,
            updated_at: new Date(now).toISOString(),
          })
          .eq('id', driverId);
      } catch (e) {
        console.warn('Could not update driver_profiles in tracking API:', e);
      }
    }

    return NextResponse.json({
      success: true,
      tripId,
      lat,
      lng,
      updatedAt: now,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Server error' }, { status: 500 });
  }
}
