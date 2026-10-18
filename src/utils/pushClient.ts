export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

export function getPushPermissionStatus(): PushPermissionStatus {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as PushPermissionStatus;
}

export async function registerForPushNotifications(
  role: 'driver' | 'rider',
  userId?: string
): Promise<{ success: boolean; error?: string; subscription?: PushSubscription }> {
  try {
    const status = getPushPermissionStatus();
    if (status === 'unsupported') {
      return { success: false, error: 'Push notifications are not supported on this browser/device.' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Notification permission was denied.' };
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      return { success: false, error: 'VAPID public key is not configured.' };
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // @ts-expect-error PushManager applicationServerKey expects BufferSource
        applicationServerKey: convertedVapidKey,
      });
    }

    // Send subscription to server
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        role,
        userId: userId || null,
        userAgent: navigator.userAgent,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return { success: false, error: errorData.error || 'Failed to persist push subscription on server.' };
    }

    return { success: true, subscription };
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[PushClient] Registration error:', error);
    return { success: false, error: error.message || 'Error subscribing to push notifications' };
  }
}

export async function unsubscribeFromPushNotifications(): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator)) return false;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const unsubscribed = await subscription.unsubscribe();
      return unsubscribed;
    }
    return true;
  } catch (err) {
    console.error('[PushClient] Unsubscribe error:', err);
    return false;
  }
}

/**
 * Dispatches a Web Push notification to all online/registered drivers
 * when a rider requests a trip.
 */
export async function dispatchRideRequestPush(params: {
  tripId: string;
  pickupAddress: string;
  dropoffAddress: string;
  fareZar: number;
}): Promise<boolean> {
  try {
    const payload = {
      title: '🚖 New Trip Request!',
      body: `R${params.fareZar} • Pickup: ${params.pickupAddress}`,
      role: 'driver' as const,
      icon: '/driver-icon-192.png',
      url: `/driver?tripId=${params.tripId}`,
      tripId: params.tripId,
      tag: `trip-request-${params.tripId}`,
    };

    const res = await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'driver',
        payload,
      }),
    });

    if (!res.ok) {
      console.warn('[PushClient] Dispatch request returned status:', res.status);
      return false;
    }

    const data = await res.json();
    return !!data.success;
  } catch (err) {
    console.error('[PushClient] Failed to dispatch driver push notification:', err);
    return false;
  }
}

/**
 * Dispatches an arrival alert to the rider with the trip verification PIN
 */
export async function dispatchDriverArrivedPush(params: {
  tripId: string;
  driverName: string;
  otpPin: string;
}): Promise<boolean> {
  try {
    const payload = {
      title: 'Your Driver Has Arrived! 📍',
      body: `${params.driverName} is waiting at the pickup location. Share PIN ${params.otpPin} to start trip.`,
      role: 'rider' as const,
      icon: '/rider-icon-192.png',
      url: `/rider?tripId=${params.tripId}`,
      tripId: params.tripId,
      tag: `trip-arrived-${params.tripId}`,
    };

    const res = await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'rider',
        payload,
      }),
    });

    if (!res.ok) return false;
    const data = await res.json();
    return !!data.success;
  } catch (err) {
    console.warn('[PushClient] Failed to dispatch driver arrival push notification:', err);
    return false;
  }
}

