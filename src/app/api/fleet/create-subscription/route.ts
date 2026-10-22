import { NextResponse } from 'next/server';
import {
  getFleetProfile,
  getFleetVehicles,
  calculateFleetMonthlyBilling,
  seedDefaultFleetIfNeeded,
  DISABLE_FLEET_PAYMENT_FOR_TESTING,
} from '@/utils/fleetStore';
import { checkRateLimit, createRateLimitExceededResponse } from '@/utils/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const rateLimit = checkRateLimit(req, {
    bucket: 'fleet_create_subscription',
    limit: 25,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return createRateLimitExceededResponse(rateLimit, 'Rate limit exceeded. Please wait.');
  }

  try {
    seedDefaultFleetIfNeeded();

    const body = await req.json();
    const { fleetId, email } = body || {};

    if (!fleetId) {
      return NextResponse.json({ success: false, error: 'Fleet ID is required' }, { status: 400 });
    }

    const fleet = getFleetProfile(fleetId);
    if (!fleet) {
      return NextResponse.json({ success: false, error: 'Fleet profile not found' }, { status: 404 });
    }

    const targetEmail = (email || fleet.ownerEmail || '').trim().toLowerCase();
    if (!targetEmail) {
      return NextResponse.json({ success: false, error: 'Company owner email is required' }, { status: 400 });
    }

    // Retrieve active registered vehicles to compute exact Option C fee
    const vehicles = getFleetVehicles(fleetId);
    const billing = calculateFleetMonthlyBilling(vehicles.length);
    const amountInCents = Math.round(billing.totalMonthlyZar * 100);

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const callbackUrl = `${siteUrl}/fleet?payment=success&fleet_id=${encodeURIComponent(fleetId)}&amount=${billing.totalMonthlyZar}`;

    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    // Resilient testing bypass / dev mode: When payment function is disabled for testing or when PAYSTACK_SECRET_KEY is absent
    if (DISABLE_FLEET_PAYMENT_FOR_TESTING || !secretKey) {
      console.warn('[Paystack Fleet] Testing mode active (DISABLE_FLEET_PAYMENT_FOR_TESTING = true). Payment gateway bypassed.');
      const mockReference = `SOLO-FLEET-TEST-${Date.now()}`;
      return NextResponse.json({
        success: true,
        mock: true,
        url: `${callbackUrl}&mock=true&ref=${mockReference}`,
        reference: mockReference,
        amountZar: billing.totalMonthlyZar,
        message: 'Testing mode: Payment function disabled. Instant activation granted with R0.00 charge.',
      });
    }

    const payload = {
      email: targetEmail,
      amount: amountInCents,
      currency: 'ZAR',
      callback_url: callbackUrl,
      metadata: {
        fleetId,
        fleet_name: fleet.companyName,
        payment_type: 'solo_fleet_subscription',
        vehicle_count: vehicles.length,
        base_fee_zar: billing.basePlatformFeeZar,
        vehicles_subtotal_zar: billing.vehiclesSubtotalZar,
        vat_amount_zar: billing.vatAmountZar,
        total_monthly_zar: billing.totalMonthlyZar,
        custom_fields: [
          {
            display_name: 'Fleet Partner',
            variable_name: 'fleet_name',
            value: fleet.companyName,
          },
          {
            display_name: 'Active Vehicles',
            variable_name: 'vehicle_count',
            value: `${vehicles.length} vehicle slots`,
          },
          {
            display_name: 'Total Monthly Bill',
            variable_name: 'monthly_total',
            value: `R${billing.totalMonthlyZar.toLocaleString()} (incl. VAT)`,
          },
        ],
      },
    };

    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await paystackRes.json();

    if (!data.status || !data.data?.authorization_url) {
      throw new Error(data.message || 'Failed to initialize Paystack checkout');
    }

    return NextResponse.json({
      success: true,
      url: data.data.authorization_url,
      access_code: data.data.access_code,
      reference: data.data.reference,
      amountZar: billing.totalMonthlyZar,
      billing,
    });
  } catch (err: any) {
    console.error('Fleet Paystack subscription error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to initialize Paystack subscription' },
      { status: 500 }
    );
  }
}
