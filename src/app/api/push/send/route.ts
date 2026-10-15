import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWebPushNotification, PushPayload } from '@/utils/webPush';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key'
);

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { target, role, userId, subscription, payload } = body;

    if (!payload || !payload.title || !payload.body) {
      return NextResponse.json(
        { error: 'Payload must contain title and body' },
        { status: 400 }
      );
    }

    // Direct single subscription test dispatch
    if (subscription && subscription.endpoint && subscription.keys) {
      const result = await sendWebPushNotification(subscription, payload as PushPayload);
      return NextResponse.json({
        success: result.success,
        statusCode: result.statusCode,
        error: result.error,
      });
    }

    // Role or User target lookup from database
    let query = supabase.from('push_subscriptions').select('*');
    if (userId) {
      query = query.eq('user_id', userId);
    }
    if (role) {
      query = query.eq('role', role);
    }

    const { data: subscriptions, error } = await query;
    if (error) {
      console.error('[PushSendAPI] Database query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({
        success: true,
        sentCount: 0,
        message: 'No active push subscriptions found for target criteria',
      });
    }

    let sentCount = 0;
    let failureCount = 0;
    const staleEndpoints: string[] = [];

    for (const sub of subscriptions) {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      const result = await sendWebPushNotification(pushSub, payload as PushPayload);
      if (result.success) {
        sentCount++;
      } else {
        failureCount++;
        // 404 Not Found or 410 Gone indicates the browser unsubscribed or revoked permission
        if (result.statusCode === 404 || result.statusCode === 410) {
          staleEndpoints.push(sub.endpoint);
        }
      }
    }

    // Clean up stale/expired subscriptions
    if (staleEndpoints.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('endpoint', staleEndpoints);
    }

    return NextResponse.json({
      success: true,
      sentCount,
      failureCount,
      cleanedStaleCount: staleEndpoints.length,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[PushSendAPI] Exception:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error sending push notification' },
      { status: 500 }
    );
  }
}
