import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: Request) {
  try {
    const { tripId, email: rawEmail, amount: rawAmount } = await req.json()

    if (!tripId) {
      return NextResponse.json({ error: 'Trip ID is required' }, { status: 400 })
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
      return NextResponse.json({ error: 'Paystack Secret Key is missing from environment' }, { status: 500 })
    }

    // Attempt to verify trip details in Supabase
    let fareAmount = rawAmount
    let riderId = ''
    let driverId = ''

    try {
      const { data: trip } = await supabase
        .from('trips')
        .select('id, rider_id, driver_id, fare_amount, status')
        .eq('id', tripId)
        .single()

      if (trip) {
        fareAmount = Number(trip.fare_amount)
        riderId = trip.rider_id
        driverId = trip.driver_id || ''
      }
    } catch (e) {
      console.warn('Could not query trip from Supabase, falling back to payload values:', e)
    }

    if (!fareAmount || isNaN(fareAmount) || fareAmount <= 0) {
      return NextResponse.json({ error: 'Invalid fare amount' }, { status: 400 })
    }

    // Format fare into ZAR cents (e.g., R120.50 -> 12050 cents)
    const amountInCents = Math.round(fareAmount * 100)

    // Paystack requires a valid email string
    const email = (rawEmail && rawEmail.includes('@'))
      ? rawEmail
      : `rider-${tripId.substring(0, 8)}@solorides.co.za`

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: amountInCents,
        currency: 'ZAR',
        callback_url: `${siteUrl}/rider?payment=success&trip_id=${encodeURIComponent(tripId)}`,
        metadata: {
          payment_type: 'solo_trip_fare',
          trip_id: tripId,
          rider_id: riderId,
          driver_id: driverId,
          custom_fields: [
            {
              display_name: 'Payment Description',
              variable_name: 'description',
              value: `SOLO Trip Fare (${tripId.slice(0, 8)})`,
            },
            {
              display_name: 'Trip ID',
              variable_name: 'trip_id',
              value: tripId,
            },
          ],
        },
      }),
    })

    const data = await paystackResponse.json()

    if (!data.status) {
      throw new Error(data.message || 'Paystack initialization failed')
    }

    return NextResponse.json({
      success: true,
      url: data.data.authorization_url,
      access_code: data.data.access_code,
      reference: data.data.reference,
    })
  } catch (error: unknown) {
    console.error('Paystack fare initialization error:', error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
