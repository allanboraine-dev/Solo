import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  validatePaystackSignature,
  handlePaystackWebhookEvent,
} from '@/utils/paystackWebhookHandler'

// Initialize Supabase service role client (or fallback to anon key)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key'
)

export async function POST(req: Request) {
  try {
    const body = await req.text()
    const signature = req.headers.get('x-paystack-signature')
    const secret = process.env.PAYSTACK_SECRET_KEY

    // 1. Timing-safe cryptographic HMAC-SHA512 verification
    const sigResult = validatePaystackSignature(body, signature, secret)
    if (!sigResult.valid) {
      if (sigResult.status === 500) {
        console.error('[Paystack Webhook] PAYSTACK_SECRET_KEY is missing from environment')
      } else {
        console.warn(`[Paystack Webhook] Webhook signature validation rejected: ${sigResult.error}`)
      }
      return NextResponse.json({ error: sigResult.error }, { status: sigResult.status })
    }

    // 2. Parse event payload
    let event: any
    try {
      event = JSON.parse(body)
    } catch (parseErr) {
      console.error('[Paystack Webhook] Malformed JSON payload:', parseErr)
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    console.log(
      `[Paystack Webhook] Processing event: ${event?.event} (Ref: ${event?.data?.reference || 'N/A'}, Type: ${event?.data?.metadata?.payment_type || 'standard'})`
    )

    // 3. Process event through core business logic engine
    const result = await handlePaystackWebhookEvent(event, supabase)

    console.log(`[Paystack Webhook] Successfully processed ${result.eventType} -> Action: ${result.action}`)

    // 4. Return fast HTTP 200 to acknowledge Paystack receipt
    return NextResponse.json({
      status: 'success',
      received: true,
      event: result.eventType,
      action: result.action,
      reference: result.reference || null,
    })
  } catch (error: unknown) {
    console.error('[Paystack Webhook] Uncaught handler error:', error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
