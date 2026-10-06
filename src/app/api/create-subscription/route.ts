import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { driverId, email } = await req.json()

    // Initialize a Paystack Transaction for the R999/mo subscription
    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email,
        amount: 99900, // R999.00 in cents (ZAR)
        currency: 'ZAR',
        // Optional: If you create a Subscription Plan in Paystack, uncomment the line below and add the Plan Code
        // plan: 'PLN_your_plan_code', 
        callback_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/driver?payment=success`,
        metadata: {
          driverId: driverId,
          payment_type: 'solo_saas_subscription'
        }
      })
    })

    const data = await paystackResponse.json()

    if (!data.status) {
      throw new Error(data.message)
    }

    // Return the Paystack hosted checkout URL to the frontend
    return NextResponse.json({ url: data.data.authorization_url })

  } catch (error: unknown) {
    console.error('Paystack error:', error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
