import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWebPushNotification, PushPayload } from '@/utils/webPush';
import { getMemorySubscriptions, removeMemorySubscription } from '@/utils/pushStore';

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

    let dbSubscriptions: any[] = [];
    const { data, error } = await query;
    if (error) {
      console.warn('[PushSendAPI] Database query warning (falling back to memory store):', error.message);
    } else if (data) {
      dbSubscriptions = data;
    }

    // Retrieve matching subscriptions from in-memory fallback store
    const memSubscriptions = getMemorySubscriptions(role, userId);

    // Merge and deduplicate by endpoint
    const subscriptionMap = new Map<string, any>();
    for (const sub of dbSubscriptions) {
      if (sub.endpoint) subscriptionMap.set(sub.endpoint, sub);
    }
    for (const sub of memSubscriptions) {
      if (sub.endpoint && !subscriptionMap.has(sub.endpoint)) {
        subscriptionMap.set(sub.endpoint, sub);
      }
    }

    const subscriptions = Array.from(subscriptionMap.values());

    if (subscriptions.length === 0) {
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
      for (const ep of staleEndpoints) {
        removeMemorySubscription(ep);
      }
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
