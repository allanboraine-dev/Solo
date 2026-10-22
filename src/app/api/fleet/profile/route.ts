import { NextRequest, NextResponse } from 'next/server';
import {
  getFleetProfile,
  saveFleetProfile,
  getAllFleetProfiles,
  seedDefaultFleetIfNeeded,
} from '@/utils/fleetStore';
import { checkRateLimit, createRateLimitExceededResponse } from '@/utils/rateLimit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Ensure default seed exists if needed
  seedDefaultFleetIfNeeded();

  const { searchParams } = new URL(req.url);
  const fleetId = searchParams.get('fleetId') || searchParams.get('id') || searchParams.get('email');

  if (fleetId) {
    const profile = getFleetProfile(fleetId);
    if (!profile) {
      return NextResponse.json({ success: false, error: 'Fleet not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, profile });
  }

  const profiles = getAllFleetProfiles();
  return NextResponse.json({ success: true, profiles });
}

export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, {
    bucket: 'fleet_profile_upsert',
    limit: 20,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return createRateLimitExceededResponse(rateLimit, 'Rate limit exceeded. Please wait.');
  }

  try {
    const body = await req.json();
    if (!body || !body.companyName || !body.ownerEmail) {
      return NextResponse.json(
        { success: false, error: 'Company name and owner email are required' },
        { status: 400 }
      );
    }

    const saved = saveFleetProfile({
      id: body.id || `fleet-${Date.now()}`,
      ownerEmail: body.ownerEmail.trim().toLowerCase(),
      ownerPhone: body.ownerPhone || '',
      companyName: body.companyName.trim(),
      registrationNumber: body.registrationNumber?.trim(),
      vatNumber: body.vatNumber?.trim(),
      contactPerson: body.contactPerson || 'Fleet Manager',
      operatingCity: body.operatingCity || 'Cape Town',
      settlementBank: body.settlementBank,
      subscriptionStatus: body.subscriptionStatus || 'trial',
      subscriptionTier: body.subscriptionTier || 'fleet_starter',
      activeVehiclesCount: body.activeVehiclesCount || 0,
      trialEndsAt: body.trialEndsAt,
      subscriptionRenewsAt: body.subscriptionRenewsAt,
      createdAt: body.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, profile: saved });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 });
  }
}
