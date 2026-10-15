import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function verifyDriverSubscription(reference: string, clientDriverId?: string) {
  if (!reference) {
    return { success: false, error: 'Payment reference is required', status: 400 }
  }

  if (!process.env.PAYSTACK_SECRET_KEY) {
    return { success: false, error: 'PAYSTACK_SECRET_KEY is missing', status: 500 }
  }

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
      error: `Subscription payment status is ${txData.status}: ${txData.gateway_response || 'Payment unsuccessful'}`, 
      status: 400 
    }
  }

  const driverId = txData.metadata?.driverId || clientDriverId

  if (driverId) {
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const { error: dbError } = await supabase
      .from('driver_profiles')
      .update({
        subscription_plan: 'paid',
        subscription_status: 'active',
        subscription_active: true,
        subscription_expires_at: thirtyDaysFromNow,
        updated_at: new Date().toISOString(),
      })
      .eq('id', driverId)

    if (dbError) {
      console.error('Failed to update driver profile in Supabase:', dbError)
    }
  }

  return {
    success: true,
    driverId,
    amount: txData.amount / 100,
    reference: txData.reference,
    paidAt: txData.paid_at,
    status: 200,
  }
}

export async function POST(req: Request) {
  try {
    const { reference, driverId } = await req.json()
    const result = await verifyDriverSubscription(reference, driverId)
    return NextResponse.json(result, { status: result.status })
  } catch (error: unknown) {
    console.error('Verify subscription error:', error)
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const reference = url.searchParams.get('reference') || ''
    const driverId = url.searchParams.get('driverId') || url.searchParams.get('driver_id') || undefined
    const result = await verifyDriverSubscription(reference, driverId)
    return NextResponse.json(result, { status: result.status })
  } catch (error: unknown) {
    console.error('Verify subscription error:', error)
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 })
  }
}
