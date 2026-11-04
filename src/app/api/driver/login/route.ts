import { NextRequest, NextResponse } from 'next/server';
import { verifyKycDriverPassword } from '@/utils/kycStore';
import { isPlatformOwner, isOwnerPassword, FOUNDER_DRIVER_UUID } from '@/utils/owner';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { authenticated: false, error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPassword = String(password);

    if (isPlatformOwner(cleanEmail) && isOwnerPassword(cleanPassword)) {
      return NextResponse.json({
        authenticated: true,
        driver: {
          id: FOUNDER_DRIVER_UUID,
          fullName: 'Allan Boraine (Founder)',
          email: cleanEmail,
          phone: '0829245136',
          vehicleMake: 'Kia',
          vehicleModel: 'Sportage',
          vehicleColor: 'Blue',
          licensePlate: 'CWT 143 NC',
          prdpNumber: 'PRDP-FOUNDER-001',
          hasLicense: true,
          hasPrdp: true,
          hasRoadworthy: true,
          isVerified: true,
          subscriptionActive: true,
          subscriptionPlan: 'owner',
        },
      });
    }

    const verifiedProfile = verifyKycDriverPassword(cleanEmail, cleanPassword);
    if (!verifiedProfile) {
      return NextResponse.json(
        { authenticated: false, error: 'Invalid login credentials' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      authenticated: true,
      driver: {
        id: verifiedProfile.id,
        fullName: verifiedProfile.fullName || cleanEmail.split('@')[0] || 'SOLO Driver',
        email: verifiedProfile.email,
        phone: verifiedProfile.phone || '',
        vehicleMake: verifiedProfile.vehicleMake || 'Toyota',
        vehicleModel: verifiedProfile.vehicleModel || 'Corolla Quest',
        licensePlate: verifiedProfile.licensePlate || 'PENDING',
        prdpNumber: verifiedProfile.prdpNumber || 'PENDING',
        hasLicense: true,
        hasPrdp: true,
        hasRoadworthy: true,
        isVerified: verifiedProfile.isVerified ?? true,
        subscriptionActive: verifiedProfile.subscriptionActive ?? true,
        subscriptionPlan: verifiedProfile.subscriptionPlan || 'trial',
        trialStartedAt: verifiedProfile.trialStartedAt
          ? new Date(verifiedProfile.trialStartedAt).getTime()
          : Date.now(),
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { authenticated: false, error: (err as Error).message || 'Authentication error' },
      { status: 500 }
    );
  }
}
