import { NextRequest, NextResponse } from 'next/server';
import { checkVehicleFleetCoverage, seedDefaultFleetIfNeeded } from '@/utils/fleetStore';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  seedDefaultFleetIfNeeded();

  const { searchParams } = new URL(req.url);
  const driverId = searchParams.get('driverId');
  const licensePlate = searchParams.get('licensePlate');

  if (!driverId && !licensePlate) {
    return NextResponse.json(
      { success: false, error: 'driverId or licensePlate parameter is required' },
      { status: 400 }
    );
  }

  const coverage = checkVehicleFleetCoverage({ driverId, licensePlate });
  return NextResponse.json({ success: true, coverage });
}
