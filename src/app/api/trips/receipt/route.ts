import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tripId = searchParams.get('tripId');

    if (!tripId || typeof tripId !== 'string') {
      return NextResponse.json({ success: false, error: 'tripId is required' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ success: false, notFound: true, message: 'Database connection unavailable' }, { status: 404 });
    }

    // 1. Fetch trip record from authoritative database
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('*')
      .eq('id', tripId)
      .maybeSingle();

    if (tripError) {
      return NextResponse.json({ success: false, error: tripError.message }, { status: 500 });
    }

    if (!trip) {
      return NextResponse.json({ success: false, notFound: true, message: 'Trip not found in database' }, { status: 404 });
    }

    // 2. Fetch driver profile if assigned
    let driverData: any = null;
    if (trip.driver_id) {
      const { data: driver } = await supabase
        .from('driver_profiles')
        .select('id, full_name, phone, email, vehicle_make, vehicle_model, vehicle_year, vehicle_color, license_plate, prdp_number')
        .eq('id', trip.driver_id)
        .maybeSingle();

      if (driver) {
        driverData = {
          fullName: driver.full_name || 'Verified SOLO Driver',
          phone: driver.phone || '',
          email: driver.email || '',
          vehicleMake: driver.vehicle_make || '',
          vehicleModel: driver.vehicle_model || '',
          vehicleYear: driver.vehicle_year || undefined,
          vehicleColor: driver.vehicle_color || '',
          licensePlate: driver.license_plate || '',
          prdpNumber: driver.prdp_number || '',
        };
      }
    }

    // 3. Fetch rider profile if registered
    let riderData: any = null;
    if (trip.rider_id) {
      const { data: rider } = await supabase
        .from('profiles')
        .select('id, full_name, phone, email')
        .eq('id', trip.rider_id)
        .maybeSingle();

      if (rider) {
        riderData = {
          fullName: rider.full_name || '',
          phone: rider.phone || '',
          email: rider.email || '',
        };
      }
    }

    return NextResponse.json({
      success: true,
      trip,
      driver: driverData,
      rider: riderData,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error fetching receipt';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
