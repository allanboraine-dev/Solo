import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function verifyTransaction(reference: string, clientTripId?: string) {
  if (!reference) {
    return { success: false, error: 'Payment reference is required', status: 400 }
  }

  if (!process.env.PAYSTACK_SECRET_KEY) {
    return { success: false, error: 'PAYSTACK_SECRET_KEY is missing', status: 500 }
  }

  // Call Paystack verify endpoint
  const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })

  const paystackData = await paystackRes.json()

  if (!paystackData.status || !paystackData.data) {
    return { success: false, error: paystackData.message || 'Verification failed with Paystack', status: 400 }
  }

  const txData = paystackData.data

  if (txData.status !== 'success') {
    return { 
      success: false, 
      error: `Payment status is ${txData.status}: ${txData.gateway_response || 'Transaction was not successful'}`, 
      status: 400 
    }
  }

  const resolvedTripId = txData.metadata?.trip_id || clientTripId

  if (resolvedTripId) {
    // Fare amount validation: Ensure paid amount matches or exceeds trip fare in cents
    try {
      const { data: trip } = await supabase
        .from('trips')
        .select('fare_amount')
        .eq('id', resolvedTripId)
        .maybeSingle();

      if (trip?.fare_amount) {
        const expectedCents = Math.round(Number(trip.fare_amount) * 100);
        if (txData.amount < expectedCents) {
          return {
            success: false,
            error: `Insufficient payment: Amount paid (${txData.amount / 100} ZAR) is less than trip fare (${trip.fare_amount} ZAR)`,
            status: 400,
          };
        }
      }
    } catch (fareCheckErr) {
      console.warn('Fare check warning during payment verification:', fareCheckErr);
    }

    // Mark trip completed in Supabase database (both SECURITY DEFINER RPC + direct update)
    try {
      await supabase.rpc('complete_trip', {
        p_trip_id: resolvedTripId,
        p_payment_method: 'in_app',
      })

      const { error: dbError } = await supabase
        .from('trips')
        .update({
          status: 'completed',
          payment_status: 'paid',
          payment_method: 'in_app',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', resolvedTripId)

      if (dbError) {
        console.warn('Direct trip update warning after payment verification:', dbError.message)
      }
    } catch (dbErr) {
      console.error('Error updating trip after payment verification:', dbErr)
    }
  }

  return {
    success: true,
    tripId: resolvedTripId,
    amount: txData.amount / 100,
    reference: txData.reference,
    paidAt: txData.paid_at,
    status: 200
  }
}

export async function POST(req: Request) {
  try {
    const { reference, tripId } = await req.json()
    const result = await verifyTransaction(reference, tripId)
    return NextResponse.json(result, { status: result.status })
  } catch (error: unknown) {
    console.error('Verify trip payment error:', error)
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const reference = url.searchParams.get('reference') || ''
    const tripId = url.searchParams.get('tripId') || url.searchParams.get('trip_id') || undefined
    const result = await verifyTransaction(reference, tripId)
    return NextResponse.json(result, { status: result.status })
  } catch (error: unknown) {
    console.error('Verify trip payment error:', error)
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 })
  }
}
