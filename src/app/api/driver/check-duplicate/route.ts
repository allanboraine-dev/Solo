import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkDuplicateKycDriver } from '@/utils/kycStore';
import { checkDriverDuplicatesInMemory, type DuplicateCheckParams } from '@/utils/driverValidation';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key'
);

export async function POST(req: NextRequest) {
  try {
    const body: DuplicateCheckParams = await req.json();
    const { email, phone, licensePlate, prdpNumber, driverId } = body;

    // 1. In-memory check first (instant response)
    const memCheck = checkDuplicateKycDriver({
      email,
      phone,
      licensePlate,
      prdpNumber,
      driverId,
    });

    if (memCheck.isDuplicate) {
      return NextResponse.json({
        isDuplicate: true,
        field: memCheck.field,
        message: memCheck.message,
      });
    }

    // 2. Supabase DB check across driver_profiles
    try {
      let query = supabase
        .from('driver_profiles')
        .select('id, email, phone, license_plate, prdp_number');

      if (driverId) {
        query = query.neq('id', driverId);
      }

      const { data: dbDrivers, error: dbErr } = await query;

      if (!dbErr && Array.isArray(dbDrivers) && dbDrivers.length > 0) {
        const dbCheck = checkDriverDuplicatesInMemory(
          { email, phone, licensePlate, prdpNumber, driverId },
          dbDrivers
        );

        if (dbCheck.isDuplicate) {
          return NextResponse.json({
            isDuplicate: true,
            field: dbCheck.field,
            message: dbCheck.message,
          });
        }
      }
    } catch (dbError) {
      console.warn('[CheckDuplicateAPI] Supabase query notice:', dbError);
    }

    return NextResponse.json({
      isDuplicate: false,
    });
  } catch (err: unknown) {
    console.error('[CheckDuplicateAPI] Error:', err);
    return NextResponse.json(
      { isDuplicate: false, error: (err as Error).message },
      { status: 200 }
    );
  }
}
