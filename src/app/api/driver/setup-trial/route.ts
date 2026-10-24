import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isPlatformOwner } from '@/utils/owner';
import { getOrCreateDriverPlan } from '@/utils/paystackPlan';
import { saveKycDriverProfile } from '@/utils/kycStore';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key'
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { driverId, email, reference } = body;

    if (!driverId) {
      return NextResponse.json({ error: 'Driver ID is required' }, { status: 400 });
    }
    if (!email) {
      return NextResponse.json({ error: 'Driver email is required' }, { status: 400 });
    }

    if (isPlatformOwner(email)) {
      return NextResponse.json({
        success: true,
        exempt: true,
        message: 'Platform owner exempt from subscription fees',
      });
    }



    if (!reference) {
      return NextResponse.json({ error: 'Paystack transaction reference is required' }, { status: 400 });
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json(
        { error: 'PAYSTACK_SECRET_KEY is missing from environment.' },
        { status: 500 }
      );
    }

    // 1. Verify transaction with Paystack to extract card authorization code
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    });

    const verifyData = await verifyRes.json();

    if (!verifyData.status || verifyData.data?.status !== 'success') {
      return NextResponse.json(
        { error: verifyData.message || 'Card authorization verification was unsuccessful.' },
        { status: 400 }
      );
    }

    const auth = verifyData.data?.authorization;
    if (!auth?.authorization_code) {
      return NextResponse.json(
        { error: 'No reusable card authorization returned by Paystack.' },
        { status: 400 }
      );
    }

    const authCode = auth.authorization_code;
    const cardLast4 = auth.last4 || '••••';
    const cardBrand = auth.brand || auth.card_type || 'Visa/Mastercard';
    const cardExpMonth = auth.exp_month || null;
    const cardExpYear = auth.exp_year || null;
    const customerCode = verifyData.data?.customer?.customer_code;

    // 2. Fetch or create Paystack SOLO Driver Pro recurring monthly plan (R499/month)
    const planCode = await getOrCreateDriverPlan(secretKey);

    // 3. Compute 7-day trial expiration date
    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    let subscriptionCode: string | null = null;
    let nextBillingDate = trialEndsAt.toISOString();

    // 4. Create Paystack subscription scheduled to start on Day 7
    if (planCode) {
      try {
        const subRes = await fetch('https://api.paystack.co/subscription', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customer: customerCode || email,
            plan: planCode,
            authorization: authCode,
            start_date: trialEndsAt.toISOString(),
          }),
        });

        const subData = await subRes.json();
        if (subData.status && subData.data?.subscription_code) {
          subscriptionCode = subData.data.subscription_code;
          if (subData.data.next_payment_date) {
            nextBillingDate = subData.data.next_payment_date;
          }
        } else {
          console.warn('[setup-trial] Paystack subscription schedule notice:', subData.message);
        }
      } catch (subErr) {
        console.warn('[setup-trial] Error creating Paystack subscription schedule:', subErr);
      }
    }

    // 5. Automatically initiate refund of the R1.00 card tokenization fee
    try {
      await fetch('https://api.paystack.co/refund', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transaction: reference,
          amount: 100, // 100 cents (R1.00)
          merchant_note: 'SOLO 7-day free trial card verification refund',
        }),
      });
    } catch (refundErr) {
      console.warn('[setup-trial] Non-fatal notice on R1 verification refund:', refundErr);
    }

    // 6. Update in-memory kyc store
    saveKycDriverProfile({
      id: driverId,
      email,
      subscriptionPlan: 'trial',
      trialStartedAt: new Date().toISOString(),
      trialEndsAt: trialEndsAt.toISOString(),
      cardLast4,
      cardBrand,
      cardExpMonth: cardExpMonth ? String(cardExpMonth) : null,
      cardExpYear: cardExpYear ? String(cardExpYear) : null,
      paystackSubscriptionCode: subscriptionCode,
      paystackAuthorizationCode: authCode,
      nextBillingDate,
      cardCaptured: true,
    });

    // 7. Update Supabase driver_profiles
    try {
      await supabase
        .from('driver_profiles')
        .update({
          subscription_plan: 'trial',
          subscription_status: 'trial',
          subscription_active: true,
          trial_started_at: new Date().toISOString(),
          trial_ends_at: trialEndsAt.toISOString(),
          card_last4: cardLast4,
          card_brand: cardBrand,
          card_exp_month: cardExpMonth ? String(cardExpMonth) : null,
          card_exp_year: cardExpYear ? String(cardExpYear) : null,
          paystack_authorization_code: authCode,
          paystack_subscription_code: subscriptionCode,
          next_billing_date: nextBillingDate,
          card_captured: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', driverId);
    } catch (dbErr) {
      console.warn('[setup-trial] Non-fatal DB update notice:', dbErr);
    }

    return NextResponse.json({
      success: true,
      message: '7-Day Free Trial activated. Card linked for auto-billing after 7 days.',
      trialStartedAt: new Date().toISOString(),
      trialEndsAt: trialEndsAt.toISOString(),
      nextBillingDate,
      subscriptionCode,
      card: {
        last4: cardLast4,
        brand: cardBrand,
        expMonth: cardExpMonth,
        expYear: cardExpYear,
      },
    });
  } catch (err: unknown) {
    console.error('[setup-trial] Exception:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
