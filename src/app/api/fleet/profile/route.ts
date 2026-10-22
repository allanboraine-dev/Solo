import { NextRequest, NextResponse } from 'next/server';
import {
  getFleetProfile,
  saveFleetProfile,
  getAllFleetProfiles,
  getActiveFleetProfile,
  setActiveFleetSession,
  clearActiveFleetSession,
  registerFleetProfile,
  loginFleetProfile,
  seedDefaultFleetIfNeeded,
} from '@/utils/fleetStore';
import { checkRateLimit, createRateLimitExceededResponse } from '@/utils/rateLimit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  seedDefaultFleetIfNeeded();

  const { searchParams } = new URL(req.url);
  const fleetId = searchParams.get('fleetId') || searchParams.get('id') || searchParams.get('email');
  const sessionCheck = searchParams.get('session');

  if (sessionCheck) {
    const active = getActiveFleetProfile();
    return NextResponse.json({ success: true, profile: active });
  }

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
    bucket: 'fleet_profile_action',
    limit: 30,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return createRateLimitExceededResponse(rateLimit, 'Rate limit exceeded. Please wait.');
  }

  try {
    const body = await req.json();
    const action = body.action || 'upsert';

    if (action === 'register') {
      const {
        companyName,
        contactPerson,
        ownerEmail,
        ownerPhone,
        operatingCity,
        registrationNumber,
        vatNumber,
        settlementBank,
        estimatedVehicles,
      } = body;

      if (!companyName || !ownerEmail || !contactPerson || !ownerPhone) {
        return NextResponse.json(
          { success: false, error: 'Company name, contact person, email, and phone are required.' },
          { status: 400 }
        );
      }

      const registered = registerFleetProfile({
        companyName,
        contactPerson,
        ownerEmail,
        ownerPhone,
        operatingCity: operatingCity || 'Johannesburg',
        registrationNumber,
        vatNumber,
        settlementBank,
        estimatedVehicles: Number(estimatedVehicles) || 1,
      });

      return NextResponse.json({ success: true, profile: registered });
    }

    if (action === 'login') {
      const { identifier } = body;
      if (!identifier) {
        return NextResponse.json(
          { success: false, error: 'Email, phone, or company name is required.' },
          { status: 400 }
        );
      }

      const found = loginFleetProfile(identifier);
      if (!found) {
        return NextResponse.json(
          { success: false, error: 'No fleet found matching those details.' },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true, profile: found });
    }

    if (action === 'logout') {
      clearActiveFleetSession();
      return NextResponse.json({ success: true });
    }

    // Default upsert
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
      subscriptionStatus: body.subscriptionStatus || 'active',
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
