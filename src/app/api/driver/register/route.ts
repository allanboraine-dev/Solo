import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { saveKycDriverProfile } from '@/utils/kycStore';
import { isPlatformOwner } from '@/utils/owner';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key'
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      fullName,
      email,
      phone,
      vehicleMake,
      vehicleModel,
      licensePlate,
      prdpNumber,
      hasLicense,
      hasPrdp,
      hasRoadworthy,
      isVerified,
      subscriptionPlan,
      trialStartedAt,
    } = body;

    const driverId = id || crypto.randomUUID();
    const isOwner = isPlatformOwner(email);

    // 1. Save into resilient in-memory server kycStore
    const savedDriver = saveKycDriverProfile({
      id: driverId,
      fullName,
      email,
      phone,
      vehicleMake,
      vehicleModel,
      licensePlate,
      prdpNumber,
      isVerified: isOwner ? true : (isVerified ?? false),
      subscriptionPlan: isOwner ? 'owner' : (subscriptionPlan || 'trial'),
      trialStartedAt: trialStartedAt ? new Date(trialStartedAt).toISOString() : new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    // 2. Also attempt to save into Supabase driver_profiles
    try {
      const dbPayload = {
        id: driverId,
        full_name: fullName,
        email: email,
        phone: phone,
        vehicle_make: vehicleMake,
        vehicle_model: vehicleModel,
        license_plate: licensePlate,
        prdp_number: prdpNumber,
        has_license: hasLicense ?? false,
        has_prdp: hasPrdp ?? false,
        has_roadworthy: hasRoadworthy ?? false,
        is_verified: isOwner ? true : (isVerified ?? false),
        subscription_active: true,
        subscription_plan: isOwner ? 'owner' : (subscriptionPlan || 'trial'),
        trial_started_at: trialStartedAt ? new Date(trialStartedAt).toISOString() : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: dbErr } = await supabase
        .from('driver_profiles')
        .upsert(dbPayload, { onConflict: 'id' });

      if (dbErr) {
        console.warn('[DriverRegisterAPI] Supabase driver_profiles notice:', dbErr.message);
      }
    } catch (e) {
      console.warn('[DriverRegisterAPI] Supabase exception notice:', e);
    }

    return NextResponse.json({
      success: true,
      driver: savedDriver,
      message: 'SOLO driver profile registered and available in manager console',
    });
  } catch (err: unknown) {
    console.error('[DriverRegisterAPI] Route error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to register driver' },
      { status: 500 }
    );
  }
}
