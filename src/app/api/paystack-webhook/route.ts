import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase service role client (or fallback to anon key)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: Request) {
  try {
    const body = await req.text()
    const signature = req.headers.get('x-paystack-signature')
    const secret = process.env.PAYSTACK_SECRET_KEY

    if (!secret) {
      console.error('PAYSTACK_SECRET_KEY is missing from environment')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    // Validate Paystack HMAC SHA512 Signature
    const hash = crypto.createHmac('sha512', secret).update(body).digest('hex')
    if (hash !== signature) {
      console.warn('Invalid Paystack webhook signature detected')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const event = JSON.parse(body)
    const eventType = event.event
    const data = event.data

    console.log(`[Paystack Webhook] Received event: ${eventType} (Reference: ${data?.reference || 'N/A'})`)

    if (eventType === 'charge.success') {
      const metadata = data.metadata || {}
      const paymentType = metadata.payment_type

      // 1. SOLO DRIVER SAAS SUBSCRIPTION (Both initial upgrades and automated 7-day trial renewals)
      const isDriverSub = 
        paymentType === 'solo_saas_subscription' ||
        paymentType === 'driver_trial_card_capture' ||
        metadata.driverId ||
        (data.plan && data.plan.amount === 49900) ||
        data.amount === 49900;

      if (isDriverSub && paymentType !== 'solo_trip_fare') {
        const driverId = metadata.driverId
        const customerEmail = data.customer?.email
        const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

        try {
          let query = supabase
            .from('driver_profiles')
            .update({
              subscription_plan: 'paid',
              subscription_status: 'active',
              subscription_active: true,
              subscription_expires_at: thirtyDaysFromNow,
              next_billing_date: thirtyDaysFromNow,
              updated_at: new Date().toISOString(),
            })

          if (driverId) {
            query = query.eq('id', driverId)
          } else if (customerEmail) {
            query = query.eq('email', customerEmail)
          }

          const { error } = await query

          if (error) {
            console.error(`Failed to activate subscription for driver (ID: ${driverId}, Email: ${customerEmail}):`, error)
          } else {
            console.log(`[Paystack Webhook] Successfully upgraded driver (ID: ${driverId || 'N/A'}, Email: ${customerEmail}) to paid subscription. (Ref: ${data.reference})`)
          }
        } catch (dbErr) {
          console.warn('[Paystack Webhook] DB error updating driver:', dbErr)
        }
      }

      // 2. SOLO RIDER TRIP FARE SETTLEMENT
      if (paymentType === 'solo_trip_fare' || metadata.trip_id) {
        const tripId = metadata.trip_id
        if (tripId) {
          const { error } = await supabase
            .from('trips')
            .update({
              status: 'completed',
              payment_status: 'paid',
              payment_method: 'in_app',
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', tripId)

          if (error) {
            console.error(`Failed to complete trip ${tripId} upon fare payment:`, error)
          } else {
            console.log(`[Paystack Webhook] Fare received for trip ${tripId}. Trip marked as completed. (Ref: ${data.reference})`)
          }
        }
      }
    } else if (eventType === 'subscription.disable' || eventType === 'invoice.payment_failed') {
      // Driver subscription renewal failed or cancelled
      const customerEmail = data?.customer?.email
      if (customerEmail) {
        const { error } = await supabase
          .from('driver_profiles')
          .update({
            subscription_status: 'past_due',
            updated_at: new Date().toISOString(),
          })
          .eq('email', customerEmail)

        if (error) console.error(`Error updating subscription failure for ${customerEmail}:`, error)
      }
    }

    return NextResponse.json({ status: 'success' })
  } catch (error: unknown) {
    console.error('Paystack Webhook error:', error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
