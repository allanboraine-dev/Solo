import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWebPushNotification } from '@/utils/webPush';
import { getMemorySubscriptions } from '@/utils/pushStore';
import { checkRateLimit } from '@/utils/rateLimit';

// Memory store for serverless fallback
const inMemoryTickets: any[] = [];

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function generateTicketCode(): string {
  const randomDigits = Math.floor(10000 + Math.random() * 90000).toString();
  return `SOLO-LOST-${randomDigits}`;
}

export async function POST(req: NextRequest) {
  // Rate limit: 10 reports per 15 minutes per IP to prevent spam
  const rateLimit = checkRateLimit(req, {
    bucket: 'support_lost_phone',
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  try {
    const body = await req.json();
    const {
      riderIdentifier,
      riderName = 'Valued Passenger',
      alternativeContactName = 'Emergency Contact',
      alternativeContactPhone,
      phoneMakeModel,
      phoneColor = 'Not specified',
      caseOrFeatures = '',
      lockScreenInfo = '',
      seatLocation = 'unknown',
      tripDate = 'Today',
      tripTime = '',
      tripPickup = '',
      tripDropoff = '',
      notes = '',
    } = body || {};

    if (!riderIdentifier || typeof riderIdentifier !== 'string' || !riderIdentifier.trim()) {
      return NextResponse.json(
        { success: false, error: 'Your registered cell number or email is required.' },
        { status: 400 }
      );
    }

    if (!alternativeContactPhone || typeof alternativeContactPhone !== 'string' || !alternativeContactPhone.trim()) {
      return NextResponse.json(
        { success: false, error: 'An alternative contact number is required so we can reach you.' },
        { status: 400 }
      );
    }

    if (!phoneMakeModel || typeof phoneMakeModel !== 'string' || !phoneMakeModel.trim()) {
      return NextResponse.json(
        { success: false, error: 'Please describe the brand and model of your phone.' },
        { status: 400 }
      );
    }

    const ticketCode = generateTicketCode();
    const ticketId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    let matchedTrip: any = null;
    let matchedDriver: any = null;

    // 1. Attempt lookup in Supabase
    const supabase = getSupabaseAdmin();
    if (supabase) {
      try {
        // Query recent trips
        const { data: trips } = await supabase
          .from('trips')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20);

        if (trips && trips.length > 0) {
          const cleanId = riderIdentifier.trim().toLowerCase();
          // Find closest trip matching rider identifier or locations
          const candidate = trips.find((t: any) => {
            const riderMatch = t.rider_id && t.rider_id.toLowerCase().includes(cleanId);
            const pickupMatch = tripPickup && t.pickup_location && t.pickup_location.toLowerCase().includes(tripPickup.toLowerCase());
            return riderMatch || pickupMatch;
          });

          if (candidate) {
            matchedTrip = candidate;
            if (candidate.driver_id) {
              const { data: driver } = await supabase
                .from('drivers')
                .select('*')
                .eq('id', candidate.driver_id)
                .single();
              matchedDriver = driver;
            }
          }
        }
      } catch (dbErr) {
        console.warn('Supabase trip lookup notice:', dbErr);
      }
    }

    // 2. Assemble support ticket payload
    const ticket = {
      id: ticketId,
      ticketCode,
      category: 'lost_phone',
      status: matchedTrip ? 'driver_notified' : 'investigating',
      createdAt: nowIso,
      updatedAt: nowIso,
      riderIdentifier: riderIdentifier.trim(),
      riderName: riderName.trim(),
      alternativeContactName: alternativeContactName.trim(),
      alternativeContactPhone: alternativeContactPhone.trim(),
      tripId: matchedTrip?.id || null,
      driverId: matchedTrip?.driver_id || null,
      driverName: matchedDriver?.fullName || matchedTrip?.driver_name || null,
      driverPhone: matchedDriver?.phone || null,
      vehiclePlate: matchedDriver?.licensePlate || null,
      vehicleModel: matchedDriver?.vehicleModel || null,
      pickupLocation: matchedTrip?.pickup_location || tripPickup || null,
      dropoffLocation: matchedTrip?.dropoff_location || tripDropoff || null,
      tripDate: tripDate || 'Recent',
      fareZar: matchedTrip?.fare_amount || null,
      itemDetails: {
        itemType: 'phone',
        brandModel: phoneMakeModel.trim(),
        color: phoneColor.trim(),
        caseOrFeatures: caseOrFeatures.trim(),
        lockScreenInfo: lockScreenInfo.trim(),
        approximateSeatLocation: seatLocation,
      },
      subject: `Urgent Lost Phone: ${phoneMakeModel.trim()} (${phoneColor.trim()})`,
      description: `Rider reported phone left in vehicle. Alternative Contact: ${alternativeContactName.trim()} (${alternativeContactPhone.trim()}). Notes: ${notes.trim()}`,
    };

    // Store in memory
    inMemoryTickets.unshift(ticket);
    if (inMemoryTickets.length > 100) {
      inMemoryTickets.pop();
    }

    // 3. Dispatch web push notification to driver if driver ID is available
    if (ticket.driverId) {
      try {
        const subs = getMemorySubscriptions('driver', ticket.driverId);
        const payload = JSON.stringify({
          title: '🚨 URGENT: Passenger Lost Phone Alert',
          body: `Passenger left a ${phoneMakeModel} in your vehicle. Alternative Contact: ${alternativeContactPhone}`,
          data: {
            type: 'lost_item_alert',
            ticketCode,
            ticketId,
            driverId: ticket.driverId,
            alternativePhone: alternativeContactPhone,
          },
        });

        for (const sub of subs) {
          sendWebPushNotification(sub, payload).catch(() => {});
        }
      } catch (pushErr) {
        console.warn('Driver web push dispatch error:', pushErr);
      }
    }

    return NextResponse.json({
      success: true,
      ticketCode,
      ticket,
      matched: !!matchedTrip,
      driverSummary: matchedDriver
        ? {
            name: matchedDriver.fullName || 'Verified SOLO Driver',
            vehicle: `${matchedDriver.vehicleMake || ''} ${matchedDriver.vehicleModel || ''}`.trim() || 'Vehicle',
            licensePlate: matchedDriver.licensePlate || 'Registered Plate',
          }
        : null,
      message: matchedTrip
        ? 'Your ride was found! A priority alert has been dispatched to your driver.'
        : 'Your lost phone ticket has been logged with SOLO Operations. Our compliance team is tracing your driver now.',
    });
  } catch (err: any) {
    console.error('Lost phone API error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error processing lost phone report.' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');

  if (code) {
    const found = inMemoryTickets.find(
      (t) => t.ticketCode.toUpperCase() === code.trim().toUpperCase()
    );
    if (found) {
      return NextResponse.json({ success: true, ticket: found });
    }
    return NextResponse.json({ success: false, error: 'Ticket not found' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    tickets: inMemoryTickets.slice(0, 30),
  });
}
