import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isPlatformOwner } from '@/utils/owner';
import { saveKycDriverProfile, getKycDriverProfile } from '@/utils/kycStore';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key'
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { driverId, email, reason } = body;

    if (!driverId && !email) {
      return NextResponse.json({ error: 'Driver ID or email is required' }, { status: 400 });
    }

    if (email && isPlatformOwner(email)) {
      return NextResponse.json(
        { error: 'Platform Owner account cannot be cancelled. Lifetime free access is permanent.' },
        { status: 400 }
      );
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    // 1. Retrieve driver KYC profile to see if there is an active Paystack subscription code
    let subCode: string | null = null;
    let driverEmail = email;

    if (driverId) {
      const kycProf = getKycDriverProfile(driverId);
      if (kycProf?.paystackSubscriptionCode) {
        subCode = kycProf.paystackSubscriptionCode;
      }
      if (!driverEmail && kycProf?.email) {
        driverEmail = kycProf.email;
      }
    }

    // Also check Supabase for subscription code if not found in kyc store
    if (!subCode && driverId) {
      try {
        const { data: dbDriver } = await supabase
          .from('driver_profiles')
          .select('paystack_subscription_code, email')
          .eq('id', driverId)
          .single();

        if (dbDriver?.paystack_subscription_code) {
          subCode = dbDriver.paystack_subscription_code;
        }
        if (!driverEmail && dbDriver?.email) {
          driverEmail = dbDriver.email;
        }
      } catch {}
    }

    // 2. If Paystack subscription code exists, disable with Paystack API
    let paystackDisabled = false;
    if (subCode && secretKey) {
      try {
        // Fetch subscription details to get email_token required by Paystack disable endpoint
        const getSubRes = await fetch(`https://api.paystack.co/subscription/${encodeURIComponent(subCode)}`, {
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
          },
        });
        const getSubData = await getSubRes.json();
        const emailToken = getSubData.data?.email_token;

        if (emailToken) {
          const disableRes = await fetch('https://api.paystack.co/subscription/disable', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${secretKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              code: subCode,
              token: emailToken,
            }),
          });
          const disableData = await disableRes.json();
          paystackDisabled = !!disableData.status;
        }
      } catch (paystackErr) {
        console.warn('[cancel-subscription] Paystack disable call notice:', paystackErr);
      }
    }

    // 3. Update KYC store: mark as cancelled and revoke platform access
    if (driverId) {
      saveKycDriverProfile({
        id: driverId,
        email: driverEmail,
        subscriptionPlan: 'cancelled',
        subscriptionActive: false,
        paystackSubscriptionCode: null,
      });
    }

    // 4. Update Supabase driver_profiles: mark cancelled and deactivate
    try {
      let query = supabase
        .from('driver_profiles')
        .update({
          subscription_plan: 'cancelled',
          subscription_status: 'cancelled',
          subscription_active: false,
          paystack_subscription_code: null,
          updated_at: new Date().toISOString(),
        });

      if (driverId) {
        query = query.eq('id', driverId);
      } else if (driverEmail) {
        query = query.eq('email', driverEmail);
      }
      await query;
    } catch (dbErr) {
      console.warn('[cancel-subscription] DB update notice:', dbErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Subscription successfully cancelled. Platform access has been revoked until subscription is paid.',
      paystackDisabled,
      subscriptionActive: false,
      subscriptionPlan: 'cancelled',
    });
  } catch (err: unknown) {
    console.error('[cancel-subscription] Error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
