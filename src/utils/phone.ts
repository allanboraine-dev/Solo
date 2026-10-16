/**
 * Formats South African and international phone numbers into E.164 format (+27...)
 */
export function formatPhoneNumber(phone: string, defaultCountryCode: string = '27'): string {
  // Strip all non-numeric characters except leading +
  let cleaned = phone.trim().replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  // Remove leading zeros (e.g. 082 -> 82)
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }

  // If already starts with country code without plus (e.g. 2782...)
  if (cleaned.startsWith(defaultCountryCode)) {
    return `+${cleaned}`;
  }

  return `+${defaultCountryCode}${cleaned}`;
}

/**
 * Validates South African phone numbers (must be 9 digits after country code)
 */
export function isValidSAPhone(phone: string): boolean {
  const formatted = formatPhoneNumber(phone);
  // E.164 South Africa regex: +27 followed by 9 digits
  const saRegex = /^\+27[1-9]\d{8}$/;
  return saRegex.test(formatted);
}

/**
 * Generates a 6-digit numeric verification code for WhatsApp Click-to-Verify
 */
export function generateWhatsAppOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Builds a zero-cost WhatsApp Deep-Link (wa.me) verification URL.
 * Removes any dependency on Twilio or paid third-party SMS gateways.
 */
export function buildWhatsAppVerificationUrl(
  phone: string,
  fullName: string,
  otpCode: string,
  platformWhatsAppNumber?: string
): string {
  const e164 = formatPhoneNumber(phone);
  const targetNumber = (
    platformWhatsAppNumber ||
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SOLO_WHATSAPP_NUMBER) ||
    e164
  ).replace(/[^\d]/g, '');

  const cleanName = fullName.trim() || 'SOLO Rider';
  const message = [
    `🛡️ *SOLO Ride — WhatsApp Verification*`,
    `👤 Rider: ${cleanName}`,
    `📱 Mobile: ${e164}`,
    `🔑 Verification Code: *${otpCode}*`,
    ``,
    `Send this message in WhatsApp to confirm your SOLO Rider session (Zero-Commission Platform).`,
  ].join('\n');

  return `https://wa.me/${targetNumber}?text=${encodeURIComponent(message)}`;
}

/**
 * Builds a WhatsApp Deep-Link (wa.me) URL for sharing live trip status & safety PIN with family or friends
 */
export function buildWhatsAppTripShareUrl(trip: {
  id: string;
  pickup_location: string;
  dropoff_location: string;
  verification_pin?: string;
  fare_amount?: number;
}): string {
  const message = [
    `🚗 *SOLO Live Trip Safety Share*`,
    `📍 From: ${trip.pickup_location}`,
    `🏁 To: ${trip.dropoff_location}`,
    trip.verification_pin ? `🛡️ Boarding PIN: *${trip.verification_pin}*` : null,
    trip.fare_amount ? `💳 Metered Fare: R${trip.fare_amount} (0% Commission)` : null,
    `🆔 Trip Reference: ${trip.id.substring(0, 8).toUpperCase()}`,
  ]
    .filter(Boolean)
    .join('\n');

  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

