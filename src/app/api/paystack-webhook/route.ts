import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

// Initialize a service role Supabase client for admin db bypass
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: Request) {
  try {
    const body = await req.text()
    
    // Validate Paystack Signature
    const secret = process.env.PAYSTACK_SECRET_KEY!
    const hash = crypto.createHmac('sha512', secret).update(body).digest('hex')
    if (hash !== req.headers.get('x-paystack-signature')) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const event = JSON.parse(body)

    if (event.event === 'charge.success') {
      const { metadata, reference } = event.data
      
      if (metadata.payment_type === 'solo_saas_subscription') {
        const driverId = metadata.driverId
        
        // Upgrade the driver profile in Supabase
        const { error } = await supabase
          .from('driver_profiles')
          .update({ 
            subscription_plan: 'paid',
            subscription_active: true
          })
          .eq('id', driverId)

        if (error) throw error
        console.log(`Successfully upgraded driver ${driverId} to paid subscription. (Ref: ${reference})`)
      }
    }

    return NextResponse.json({ status: 'success' })
  } catch (error: unknown) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
