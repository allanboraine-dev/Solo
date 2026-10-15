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
