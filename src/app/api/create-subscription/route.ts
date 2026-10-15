import { NextResponse } from 'next/server'
import { isPlatformOwner } from '@/utils/owner'

// In-memory cache for plan code so we don't call Paystack /plan on every request
let cachedPlanCode: string | null = null

async function getOrCreatePlanCode(secretKey: string): Promise<string | null> {
  // 1. If explicit env var is set, prioritize it
  if (process.env.PAYSTACK_DRIVER_PLAN_CODE) {
    return process.env.PAYSTACK_DRIVER_PLAN_CODE
  }

  if (cachedPlanCode) {
    return cachedPlanCode
  }

  try {
    // 2. Query Paystack plans to see if SOLO plan already exists
    const listRes = await fetch('https://api.paystack.co/plan', {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    })
    const listData = await listRes.json()

    if (listData.status && Array.isArray(listData.data)) {
      const existingPlan = listData.data.find(
        (p: { name?: string; interval?: string; amount?: number }) =>
          p.name?.toLowerCase().includes('solo driver') && p.interval === 'monthly'
      )
      if (existingPlan?.plan_code) {
        cachedPlanCode = existingPlan.plan_code
        return cachedPlanCode
      }
    }

    // 3. Create a new recurring plan if not found
    const createRes = await fetch('https://api.paystack.co/plan', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'SOLO Driver Pro Monthly',
        interval: 'monthly',
        amount: 49900, // R499.00 in ZAR cents
        currency: 'ZAR',
        description: 'SOLO Zero-Commission Driver Pro Monthly Subscription',
      }),
    })
    const createData = await createRes.json()

    if (createData.status && createData.data?.plan_code) {
      cachedPlanCode = createData.data.plan_code
      return cachedPlanCode
    }
  } catch (err) {
    console.warn('Could not auto-fetch/create Paystack plan; falling back to transaction charge:', err)
  }

  return null
}

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
        isOwner: true,
      })
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json({ error: 'PAYSTACK_SECRET_KEY is missing' }, { status: 500 })
    }

    // Try to get or create recurring plan code
    const planCode = await getOrCreatePlanCode(secretKey)

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
