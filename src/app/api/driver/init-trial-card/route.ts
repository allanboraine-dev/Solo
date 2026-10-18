import { NextRequest, NextResponse } from 'next/server';
import { isPlatformOwner } from '@/utils/owner';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { driverId, email, fullName, phone } = body;

    if (!driverId) {
      return NextResponse.json({ error: 'Driver ID is required' }, { status: 400 });
    }
    if (!email) {
      return NextResponse.json({ error: 'Driver email is required' }, { status: 400 });
    }

    // Platform Owner exemption: Allan Boraine has lifetime free driver access with no card requirement
    if (isPlatformOwner(email)) {
      return NextResponse.json({
        success: true,
        isOwner: true,
        message: 'Platform owner exempt from card capture and subscription charges.',
      });
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json(
        { error: 'PAYSTACK_SECRET_KEY is missing from environment.' },
        { status: 500 }
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const callbackUrl = `${siteUrl}/driver/register?card_setup=success&driver_id=${encodeURIComponent(driverId)}`;

    // Initialize Paystack nominal R1.00 card tokenization transaction
    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: 100, // R1.00 in ZAR cents for 3DS card tokenization
        currency: 'ZAR',
        callback_url: callbackUrl,
        metadata: {
          driverId,
          email,
          fullName: fullName || 'SOLO Driver',
          phone: phone || '',
          payment_type: 'driver_trial_card_capture',
          custom_fields: [
            {
              display_name: 'Trial Duration',
              variable_name: 'trial_duration',
              value: '7 Days Free Trial (R0.00)',
            },
            {
              display_name: 'Subsequent Billing',
              variable_name: 'subsequent_billing',
              value: 'R499.00 / month after 7-day trial',
            },
            {
              display_name: 'Driver ID',
              variable_name: 'driver_id',
              value: driverId,
            },
          ],
        },
      }),
    });

    const data = await paystackRes.json();

    if (!data.status) {
      throw new Error(data.message || 'Failed to initialize card authorization with Paystack');
    }

    return NextResponse.json({
      success: true,
      authorization_url: data.data.authorization_url,
      access_code: data.data.access_code,
      reference: data.data.reference,
    });
  } catch (err: unknown) {
    console.error('[init-trial-card] Error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
