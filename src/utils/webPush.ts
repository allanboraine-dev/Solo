import webpush from 'web-push';

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushPayload {
  title: string;
  body: string;
  role?: 'driver' | 'rider';
  icon?: string;
  url?: string;
  tripId?: string;
  tag?: string;
}

// Sanitize VAPID keys (handles accidental `KEY_NAME=...` paste, quotes, whitespace, and trailing `=` padding)
export function sanitizeVapidKey(raw?: string): string {
  if (!raw) return '';
  return raw
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/^[A-Z0-9_]+\s*=\s*/i, '')
    .trim()
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function sanitizeVapidSubject(raw?: string): string {
  const cleaned = (raw || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/^[A-Z0-9_]+\s*=\s*/i, '')
    .trim();
  if (cleaned.startsWith('mailto:') || cleaned.startsWith('https://')) {
    return cleaned;
  }
  if (cleaned.includes('@')) {
    return `mailto:${cleaned}`;
  }
  return 'mailto:admin@solo-app.co.za';
}

// Initialize VAPID configuration safely
const vapidPublicKey = sanitizeVapidKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
const vapidPrivateKey = sanitizeVapidKey(process.env.VAPID_PRIVATE_KEY);
const vapidSubject = sanitizeVapidSubject(process.env.VAPID_SUBJECT);

if (vapidPublicKey && vapidPrivateKey) {
  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  } catch (err) {
    console.warn('[WebPush] Skipping VAPID initialization at build/import time:', (err as Error)?.message || err);
  }
}

export async function sendWebPushNotification(
  subscription: PushSubscriptionData,
  payload: PushPayload
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  try {
    const response = await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
      JSON.stringify(payload)
    );

    return {
      success: true,
      statusCode: response.statusCode,
    };
  } catch (err: unknown) {
    const error = err as { statusCode?: number; message?: string };
    console.error('[WebPush] Send notification error:', error.message || error);
    return {
      success: false,
      statusCode: error.statusCode,
      error: error.message || 'Failed to dispatch push notification',
    };
  }
}

// 1. Driver Dispatch Alert
export function createDriverRideAlertPayload(params: {
  tripId: string;
  pickupAddress: string;
  dropoffAddress: string;
  distanceKm: number;
  fareZar: number;
}): PushPayload {
  return {
    title: '🚖 New Trip Request!',
    body: `R${params.fareZar} • ${params.distanceKm.toFixed(1)} km\nPickup: ${params.pickupAddress}`,
    role: 'driver',
    icon: '/driver-icon-192.png',
    url: `/driver?tripId=${params.tripId}`,
    tripId: params.tripId,
    tag: `trip-request-${params.tripId}`,
  };
}

// 2. Rider Driver Accepted Alert
export function createRiderDriverAcceptedPayload(params: {
  tripId: string;
  driverName: string;
  vehicleModel: string;
  vehiclePlate: string;
  otpPin: string;
  etaMinutes: number;
}): PushPayload {
  return {
    title: 'Driver Accepted Your Ride!',
    body: `${params.driverName} (${params.vehicleModel} • ${params.vehiclePlate}) is ~${params.etaMinutes} min away. Ride PIN: ${params.otpPin}`,
    role: 'rider',
    icon: '/rider-icon-192.png',
    url: `/rider?tripId=${params.tripId}`,
    tripId: params.tripId,
    tag: `trip-status-${params.tripId}`,
  };
}

// 3. Rider Driver Arrived Alert
export function createRiderDriverArrivedPayload(params: {
  tripId: string;
  driverName: string;
  otpPin: string;
}): PushPayload {
  return {
    title: 'Your Driver Has Arrived! 📍',
    body: `${params.driverName} is waiting at the pickup location. Share PIN ${params.otpPin} to start trip.`,
    role: 'rider',
    icon: '/rider-icon-192.png',
    url: `/rider?tripId=${params.tripId}`,
    tripId: params.tripId,
    tag: `trip-arrived-${params.tripId}`,
  };
}

// 4. Trip Payment Completed Alert
export function createPaymentCompletedPayload(params: {
  tripId: string;
  amountZar: number;
  role: 'driver' | 'rider';
}): PushPayload {
  const isDriver = params.role === 'driver';
  return {
    title: isDriver ? 'Payment Received! 💳' : 'Trip Payment Confirmed! 💳',
    body: isDriver
      ? `You received R${params.amountZar} directly for trip #${params.tripId.slice(0, 6)}.`
      : `Payment of R${params.amountZar} was processed successfully. Thank you for riding with SOLO!`,
    role: params.role,
    icon: isDriver ? '/driver-icon-192.png' : '/rider-icon-192.png',
    url: isDriver ? '/driver' : '/rider',
    tripId: params.tripId,
    tag: `trip-payment-${params.tripId}`,
  };
}
