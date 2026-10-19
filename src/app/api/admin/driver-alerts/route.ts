import { NextRequest, NextResponse } from 'next/server';
import { getRecentDriverSignupAlerts, markDriverSignupAlertRead, recordDriverSignupAlert } from '@/utils/kycStore';
import { validateAdminRequest } from '@/utils/adminAuth';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key'
);

export async function GET(req: NextRequest) {
  try {
    const auth = validateAdminRequest(req);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: 'Unauthorized: Administrative credentials required', reason: auth.reason },
        { status: 401 }
      );
    }

    const alerts = getRecentDriverSignupAlerts(30);
    return NextResponse.json({
      success: true,
      alerts,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to fetch driver signup alerts' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = validateAdminRequest(req);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: 'Unauthorized: Administrative credentials required', reason: auth.reason },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { action, alertId, alert } = body;

    if (action === 'mark_read' && alertId) {
      markDriverSignupAlertRead(alertId);
      return NextResponse.json({ success: true, message: `Alert ${alertId} marked as read` });
    }

    if (action === 'broadcast' && alert) {
      const saved = recordDriverSignupAlert(alert);
      try {
        await supabase.channel('solo-admin-alerts').send({
          type: 'broadcast',
          event: 'NEW_DRIVER_SIGNUP',
          payload: saved,
        });
      } catch (broadcastErr) {
        console.warn('[DriverAlertsAPI] Realtime broadcast notice:', broadcastErr);
      }
      return NextResponse.json({ success: true, alert: saved });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to process alert action' },
      { status: 500 }
    );
  }
}
