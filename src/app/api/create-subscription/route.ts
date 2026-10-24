import { NextResponse } from 'next/server'
import { isPlatformOwner } from '@/utils/owner'
import { getOrCreateDriverPlan } from '@/utils/paystackPlan'

export async function POST(req: Request) {
  try {
    const { driverId, email } = await req.json()

    if (!driverId) {
      return NextResponse.json({ error: 'Driver ID is required' }, { status: 400 })
    }

    if (!email) {
      return NextResponse.json({ error: 'Driver email is required' }, { status: 400 })
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

    // Owner Lifetime Exemption Bypass: Do not charge the platform owner
    if (isPlatformOwner(email)) {
      return NextResponse.json({
        url: `${siteUrl}/driver?payment=success&driver_id=${encodeURIComponent(driverId)}&owner=true`,
        message: 'Platform owner exempt from driver subscription charges',
        exempt: true,
        isOwner: true,
      })
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json({ error: 'PAYSTACK_SECRET_KEY is missing' }, { status: 500 })
    }

    // Try to get or create recurring plan code
    const planCode = await getOrCreateDriverPlan(secretKey)

    const payload: Record<string, unknown> = {
      email,
      amount: 49900, // R499.00 in cents (ZAR)
      currency: 'ZAR',
      callback_url: `${siteUrl}/driver?payment=success&driver_id=${encodeURIComponent(driverId)}`,
      metadata: {
        driverId,
        payment_type: 'solo_saas_subscription',
        plan_code: planCode,
        custom_fields: [
          {
            display_name: 'Membership',
            variable_name: 'membership',
            value: 'SOLO Driver Pro (Zero-Commission)',
          },
          {
            display_name: 'Driver ID',
            variable_name: 'driver_id',
            value: driverId,
          },
        ],
      },
    }

    if (planCode) {
      payload.plan = planCode
    }

    // Initialize Paystack transaction
    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await paystackResponse.json()

    if (!data.status) {
      throw new Error(data.message || 'Failed to initialize Paystack checkout')
    }

    // Return hosted checkout URL, access_code and reference
    return NextResponse.json({
      success: true,
      url: data.data.authorization_url,
      access_code: data.data.access_code,
      reference: data.data.reference,
      plan: planCode,
    })
  } catch (error: unknown) {
    console.error('Paystack driver subscription error:', error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
