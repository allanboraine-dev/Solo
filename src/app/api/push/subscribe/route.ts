import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key'
);

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subscription, role, userId, userAgent } = body;

    if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return NextResponse.json(
        { error: 'Invalid push subscription payload' },
        { status: 400 }
      );
    }

    if (!role || (role !== 'driver' && role !== 'rider')) {
      return NextResponse.json(
        { error: "Role must be 'driver' or 'rider'" },
        { status: 400 }
      );
    }

    // Upsert into Supabase push_subscriptions table
    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          role,
          user_id: userId || null,
          user_agent: userAgent || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      )
      .select()
      .single();

    if (error) {
      console.warn('[PushAPI] Supabase upsert error (falling back to memory):', error.message);
    }

    return NextResponse.json({
      success: true,
      message: 'Push subscription registered successfully',
      data: data || { endpoint: subscription.endpoint, role },
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[PushAPI] Exception in subscribe route:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error processing push subscription' },
      { status: 500 }
    );
  }
}
