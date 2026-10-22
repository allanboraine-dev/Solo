import { NextRequest, NextResponse } from 'next/server';
import {
  getFleetVehicles,
  saveFleetVehicle,
  deleteFleetVehicle,
  assignDriverToVehicle,
  unassignDriverFromVehicle,
  toggleVehicleDispatchSuspension,
  seedDefaultFleetIfNeeded,
} from '@/utils/fleetStore';
import { checkRateLimit, createRateLimitExceededResponse } from '@/utils/rateLimit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  seedDefaultFleetIfNeeded();

  const { searchParams } = new URL(req.url);
  const fleetId = searchParams.get('fleetId') || 'fleet-apex-capetown';

  const vehicles = getFleetVehicles(fleetId);
  return NextResponse.json({ success: true, count: vehicles.length, vehicles });
}

export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, {
    bucket: 'fleet_vehicles_action',
    limit: 50,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return createRateLimitExceededResponse(rateLimit, 'Rate limit exceeded. Please wait.');
  }

  try {
    const body = await req.json();
    const action = body.action || 'upsert';

    if (action === 'assign_driver') {
      const { fleetId, vehicleId, driverId, driverName, driverPhone, shiftType, rentalRateWeeklyZar } = body;
      if (!fleetId || !vehicleId || !driverId || !driverName) {
        return NextResponse.json({ success: false, error: 'Missing required driver assignment fields' }, { status: 400 });
      }
      const updated = assignDriverToVehicle(fleetId, vehicleId, {
        id: driverId,
        name: driverName,
        phone: driverPhone || '',
        shiftType,
        rentalRateWeeklyZar,
      });
      return NextResponse.json({ success: !!updated, vehicle: updated });
    }

    if (action === 'unassign_driver') {
      const { fleetId, vehicleId } = body;
      if (!fleetId || !vehicleId) {
        return NextResponse.json({ success: false, error: 'fleetId and vehicleId required' }, { status: 400 });
      }
      const updated = unassignDriverFromVehicle(fleetId, vehicleId);
      return NextResponse.json({ success: !!updated, vehicle: updated });
    }

    if (action === 'toggle_suspension') {
      const { fleetId, vehicleId, suspended, reason } = body;
      if (!fleetId || !vehicleId) {
        return NextResponse.json({ success: false, error: 'fleetId and vehicleId required' }, { status: 400 });
      }
      const updated = toggleVehicleDispatchSuspension(fleetId, vehicleId, !!suspended, reason);
      return NextResponse.json({ success: !!updated, vehicle: updated });
    }

    // Default upsert
    const { vehicle } = body;
    if (!vehicle || !vehicle.fleetId || !vehicle.licensePlate || !vehicle.make) {
      return NextResponse.json(
        { success: false, error: 'Vehicle details (fleetId, licensePlate, make) are required' },
        { status: 400 }
      );
    }

    const saved = saveFleetVehicle(vehicle);
    return NextResponse.json({ success: true, vehicle: saved });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fleetId = searchParams.get('fleetId');
    const vehicleId = searchParams.get('vehicleId');

    if (!fleetId || !vehicleId) {
      return NextResponse.json({ success: false, error: 'fleetId and vehicleId parameters are required' }, { status: 400 });
    }

    const deleted = deleteFleetVehicle(fleetId, vehicleId);
    return NextResponse.json({ success: deleted });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 });
  }
}
