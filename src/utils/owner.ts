/**
 * SOLO E-Hailing Platform: Platform Owner & Founder Exemption Engine
 * 
 * Platform owners and founders are exempt from all driver SaaS subscription fees,
 * receive automatic KYC verification, and enjoy permanent unrestricted driver dispatch privileges.
 */

export const OWNER_EMAILS: string[] = [
  'allanboraine@gmail.com',
  ...(process.env.NEXT_PUBLIC_OWNER_EMAIL ? [process.env.NEXT_PUBLIC_OWNER_EMAIL.trim().toLowerCase()] : []),
  ...(process.env.NEXT_PUBLIC_ADMIN_EMAIL ? [process.env.NEXT_PUBLIC_ADMIN_EMAIL.trim().toLowerCase()] : []),
];

export const OWNER_PASSWORDS: string[] = [
  '13579',
  ...(process.env.OWNER_PASSWORD ? [process.env.OWNER_PASSWORD.trim()] : []),
];

/**
 * Canonical RFC-4122 v4 UUID for Platform Founder (Allan Boraine) when operating without a Supabase Auth JWT.
 * Ensures PostgreSQL UUID columns and `accept_trip` / `upsert_driver_location` RPCs always validate cleanly.
 */
export const FOUNDER_DRIVER_UUID = '00000000-0000-4000-8000-0000000a11a0';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves any driver identifier (including legacy 'owner-allan-boraine' or non-UUID strings)
 * into a guaranteed valid RFC-4122 UUID for PostgreSQL RPCs and foreign keys.
 */
export function resolveDriverUuid(driverId?: string | null): string {
  if (!driverId) return FOUNDER_DRIVER_UUID;
  const trimmed = driverId.trim();
  if (trimmed === 'owner-allan-boraine') {
    return FOUNDER_DRIVER_UUID;
  }
  if (UUID_REGEX.test(trimmed)) {
    return trimmed;
  }
  const hexChars = Array.from(trimmed)
    .map((ch) => ch.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')
    .padEnd(12, '0')
    .slice(0, 12);
  return `00000000-0000-4000-8000-${hexChars}`;
}

/**
 * Checks whether an email address belongs to a platform owner or administrator.
 */
export function isPlatformOwner(email?: string | null): boolean {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  return OWNER_EMAILS.some((ownerEmail) => ownerEmail.trim().toLowerCase() === cleanEmail);
}

/**
 * Checks whether a password matches the platform owner master password (13579).
 */
export function isOwnerPassword(password?: string | null): boolean {
  if (!password) return false;
  return OWNER_PASSWORDS.includes(password.trim());
}

/**
 * Normalizes a driver profile to grant lifetime exemption if the email belongs to the platform owner,
 * and maintains verified owner fleet vehicle defaults (Kia Sportage, Blue, CWT 143 NC).
 */
export function applyOwnerPrivileges<T extends { id?: string; email?: string; subscriptionPlan?: string; subscriptionActive?: boolean; isVerified?: boolean; vehicleMake?: string; vehicleModel?: string; licensePlate?: string; vehicleColor?: string }>(profile: T): T {
  if (!profile || typeof profile !== 'object') {
    return profile;
  }
  if (isPlatformOwner(profile.email) || profile.subscriptionPlan === 'owner' || profile.id === 'owner-allan-boraine') {
    const isBmwOrUnset = !profile.vehicleMake || profile.vehicleMake === 'BMW' || profile.licensePlate === 'SOLO-01-GP';
    const normalizedId =
      !profile.id || profile.id === 'owner-allan-boraine' || !UUID_REGEX.test(profile.id)
        ? FOUNDER_DRIVER_UUID
        : profile.id;
    return {
      ...profile,
      ...(profile.id !== undefined ? { id: normalizedId } : {}),
      subscriptionPlan: 'owner',
      subscriptionActive: true,
      isVerified: true,
      ...(isBmwOrUnset ? {
        vehicleMake: 'Kia',
        vehicleModel: 'Sportage',
        vehicleColor: 'Blue',
        licensePlate: 'CWT 143 NC',
      } : {}),
    };
  }
  return profile;
}

