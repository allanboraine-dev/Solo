/**
 * In-memory fallback store for push subscriptions
 * Ensures reliable push notification delivery even in offline/development/mock environments
 */

export interface StoredPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  role: 'driver' | 'rider';
  user_id?: string | null;
  user_agent?: string | null;
  updated_at: string;
}

const memorySubscriptions = new Map<string, StoredPushSubscription>();

export const saveMemorySubscription = (sub: StoredPushSubscription): void => {
  if (sub && sub.endpoint) {
    memorySubscriptions.set(sub.endpoint, sub);
  }
};

export const getMemorySubscriptions = (role?: 'driver' | 'rider', userId?: string): StoredPushSubscription[] => {
  const all = Array.from(memorySubscriptions.values());
  return all.filter((sub) => {
    if (role && sub.role !== role) return false;
    if (userId && sub.user_id !== userId) return false;
    return true;
  });
};

export const removeMemorySubscription = (endpoint: string): void => {
  memorySubscriptions.delete(endpoint);
};
