import { NextRequest, NextResponse } from 'next/server';
import {
  getFleetShiftAudits,
  recordFleetShiftAudit,
  seedDefaultFleetIfNeeded,
} from '@/utils/fleetStore';
import { checkRateLimit, createRateLimitExceededResponse } from '@/utils/rateLimit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  seedDefaultFleetIfNeeded();

  const { searchParams } = new URL(req.url);
  const fleetId = searchParams.get('fleetId') || 'fleet-apex-capetown';
  const vehicleId = searchParams.get('vehicleId') || undefined;

  const audits = getFleetShiftAudits(fleetId, vehicleId);
  return NextResponse.json({ success: true, count: audits.length, audits });
}

export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, {
    bucket: 'fleet_audit_record',
    limit: 100,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return createRateLimitExceededResponse(rateLimit, 'Rate limit exceeded.');
  }

  try {
    const audit = await req.json();
    if (!audit || !audit.fleetId || !audit.vehicleId || !audit.driverName) {
      return NextResponse.json(
        { success: false, error: 'fleetId, vehicleId, and driverName are required' },
        { status: 400 }
      );
    }

    const recorded = recordFleetShiftAudit(audit);
    return NextResponse.json({ success: true, audit: recorded });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 });
  }
}
