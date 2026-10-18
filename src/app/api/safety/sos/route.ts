import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWebPushNotification } from '@/utils/webPush';
import { getMemorySubscriptions } from '@/utils/pushStore';

// In-memory incident ring buffer for instant serverless fallback & control-room queries
const recentSafetyIncidents: any[] = [];

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      incidentCode,
      role = 'rider',
      category = 'armed_response',
      silentDuress = false,
      userId,
      userName = 'Verified SOLO User',
      userPhone = '',
      lat,
      lng,
      geohash6 = '',
      googleMapsUrl = '',
      tripId,
      pickupLocation,
      dropoffLocation,
      driverName,
      driverPhone,
      vehicleMake,
      vehicleModel,
      licensePlate,
      verificationPin,
      notes,
      createdAt,
    } = body || {};

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Valid GPS coordinates (lat, lng) are required for SOS dispatch.' },
        { status: 400 }
      );
    }

    const code =
      typeof incidentCode === 'string' && incidentCode.startsWith('SOS-ZA-')
        ? incidentCode
        : `SOS-ZA-${Math.floor(100000 + Math.random() * 900000)}`;

    const channels: string[] = [
      'SOLO_CONTROL_ROOM_LOG',
      'SUPABASE_REALTIME_GEOHASH_MESH',
    ];

    const incidentRecord = {
      id: id || crypto.randomUUID(),
      incident_code: code,
      role,
      category,
      silent_duress: Boolean(silentDuress),
      user_id: userId || null,
      user_name: userName,
      user_phone: userPhone,
      lat,
      lng,
      geohash6,
      google_maps_url:
        googleMapsUrl || `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`,
      trip_id: tripId || null,
      pickup_location: pickupLocation || null,
      dropoff_location: dropoffLocation || null,
      driver_name: driverName || null,
      driver_phone: driverPhone || null,
      vehicle_make: vehicleMake || null,
      vehicle_model: vehicleModel || null,
      license_plate: licensePlate || null,
      verification_pin: verificationPin || null,
      notes: notes || null,
      status: 'dispatched',
      created_at: createdAt || new Date().toISOString(),
    };

    // 1. Store in serverless ring buffer (keep latest 100 incidents)
    recentSafetyIncidents.unshift(incidentRecord);
    if (recentSafetyIncidents.length > 100) {
      recentSafetyIncidents.pop();
    }

    // 2. Persist to Supabase `safety_incidents` table if available
    const supabase = getSupabaseAdmin();
    if (supabase) {
      try {
        const { error } = await supabase.from('safety_incidents').insert({
          id: incidentRecord.id,
          incident_code: incidentRecord.incident_code,
          role: incidentRecord.role,
          category: incidentRecord.category,
          silent_duress: incidentRecord.silent_duress,
          user_name: incidentRecord.user_name,
          user_phone: incidentRecord.user_phone,
          lat: incidentRecord.lat,
          lng: incidentRecord.lng,
          geohash6: incidentRecord.geohash6,
          google_maps_url: incidentRecord.google_maps_url,
          trip_id: incidentRecord.trip_id,
          license_plate: incidentRecord.license_plate,
          vehicle_details: [vehicleMake, vehicleModel].filter(Boolean).join(' ') || null,
          status: 'dispatched',
        });
        if (!error) {
          channels.push('POSTGIS_SAFETY_INCIDENTS_DB');
        }
      } catch (dbErr) {
        console.warn('[SOS Dispatch] Non-blocking DB insert notice:', dbErr);
      }
    }

    // 3. Forward to Private Armed Response Webhook (Aura / Namola / Fidelity ADT / Secura standard)
    const armedWebhookUrl = process.env.ARMED_RESPONSE_WEBHOOK_URL;
    if (armedWebhookUrl) {
      try {
        await fetch(armedWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Solo-Safety-Signature': code,
          },
          body: JSON.stringify({
            event: 'SOLO_PANIC_SOS_DISPATCH',
            country: 'ZA',
            incident: incidentRecord,
          }),
        });
        channels.push('PRIVATE_ARMED_RESPONSE_WEBHOOK');
      } catch (whErr) {
        console.warn('[SOS Dispatch] Armed response webhook warning:', whErr);
      }
    }

    // 4. Broadcast High-Priority Web Push Alert to active nearby Responders / Drivers
    try {
      const driverSubs = getMemorySubscriptions('driver');
      if (driverSubs.length > 0) {
        await Promise.allSettled(
          driverSubs.slice(0, 25).map(sub =>
            sendWebPushNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              {
                title: `🚨 SOLO SOS ALERT (${code})`,
                body: `${role.toUpperCase()} emergency in Sector ${geohash6.toUpperCase()} ${licensePlate ? `• Vehicle ${licensePlate}` : ''}. Tap to view live GPS pin.`,
                url: `/driver`,
                tag: `sos-${code}`,
                requireInteraction: true,
              }
            )
          )
        );
        channels.push('WEB_PUSH_RESPONDER_NETWORK');
      }
    } catch {
      // Non-blocking push notification
    }

    return NextResponse.json({
      success: true,
      incidentCode: code,
      status: 'dispatched',
      channels,
      incident: incidentRecord,
    });
  } catch (err: any) {
    console.error('[SOS Dispatch API Error]:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to process SOS dispatch' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    incidents: recentSafetyIncidents.slice(0, 30),
  });
}
