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

/**
 * Checks whether an email address belongs to a platform owner or administrator.
 */
export function isPlatformOwner(email?: string | null): boolean {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  return OWNER_EMAILS.some((ownerEmail) => ownerEmail.trim().toLowerCase() === cleanEmail);
}

/**
 * Normalizes a driver profile to grant lifetime exemption if the email belongs to the platform owner.
 */
export function applyOwnerPrivileges<T extends { email?: string; subscriptionPlan?: string; subscriptionActive?: boolean; isVerified?: boolean }>(profile: T): T {
  if (isPlatformOwner(profile.email) || profile.subscriptionPlan === 'owner') {
    return {
      ...profile,
      subscriptionPlan: 'owner',
      subscriptionActive: true,
      isVerified: true,
    };
  }
  return profile;
}
