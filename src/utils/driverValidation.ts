import { formatPhoneNumber, isValidSAPhone } from './phone.ts';

export { isValidSAPhone, formatPhoneNumber };

export interface DuplicateCheckParams {
  email?: string | null;
  phone?: string | null;
  licensePlate?: string | null;
  prdpNumber?: string | null;
  driverId?: string | null;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  field?: 'email' | 'phone' | 'licensePlate' | 'prdpNumber';
  message?: string;
}

/**
 * Normalizes email by trimming and converting to lowercase.
 */
export function normalizeEmail(email?: string | null): string {
  if (!email) return '';
  return email.trim().toLowerCase();
}

/**
 * Normalizes South African or international phone number to E.164.
 */
export function normalizePhone(phone?: string | null): string {
  if (!phone) return '';
  const trimmed = phone.trim();
  if (!trimmed) return '';
  try {
    return formatPhoneNumber(trimmed);
  } catch {
    return trimmed.replace(/[^\d+]/g, '');
  }
}

/**
 * Normalizes vehicle license plate by stripping spaces, hyphens, and converting to uppercase.
 * Example: 'CA 123-456' -> 'CA123456'
 */
export function normalizeLicensePlate(plate?: string | null): string {
  if (!plate) return '';
  return plate.trim().toUpperCase().replace(/[\s\-_.]/g, '');
}

/**
 * Normalizes PrDP permit number by stripping spaces, hyphens, and converting to uppercase.
 * Example: 'PRDP-987654' -> 'PRDP987654'
 */
export function normalizePrdpNumber(prdp?: string | null): string {
  if (!prdp) return '';
  return prdp.trim().toUpperCase().replace(/[\s\-_.]/g, '');
}

/**
 * Checks if a candidate driver registration conflicts with any existing driver records.
 * Compares normalized email, phone, license plate, and PrDP number.
 */
export function checkDriverDuplicatesInMemory(
  params: DuplicateCheckParams,
  existingDrivers: Array<{
    id?: string | null;
    email?: string | null;
    phone?: string | null;
    licensePlate?: string | null;
    license_plate?: string | null;
    prdpNumber?: string | null;
    prdp_number?: string | null;
  }>
): DuplicateCheckResult {
  const normEmail = normalizeEmail(params.email);
  const normPhone = normalizePhone(params.phone);
  const normPlate = normalizeLicensePlate(params.licensePlate);
  const normPrdp = normalizePrdpNumber(params.prdpNumber);
  const driverId = params.driverId || null;

  for (const driver of existingDrivers) {
    if (!driver) continue;
    // Skip if comparing against the driver's own existing record
    if (driverId && driver.id && String(driver.id) === String(driverId)) {
      continue;
    }

    // 1. Email check
    if (normEmail) {
      const existingEmail = normalizeEmail(driver.email);
      if (existingEmail && existingEmail === normEmail) {
        return {
          isDuplicate: true,
          field: 'email',
          message: 'An account with this email address already exists. Please sign in on the Driver Login page.',
        };
      }
    }

    // 2. Phone check
    if (normPhone) {
      const existingPhone = normalizePhone(driver.phone);
      if (existingPhone && existingPhone === normPhone) {
        return {
          isDuplicate: true,
          field: 'phone',
          message: `The phone number (${params.phone}) is already registered to another driver. Please sign in or use your registered number.`,
        };
      }
    }

    // 3. Vehicle License Plate check
    if (normPlate) {
      const existingPlate = normalizeLicensePlate(driver.licensePlate || driver.license_plate);
      if (existingPlate && existingPlate === normPlate) {
        return {
          isDuplicate: true,
          field: 'licensePlate',
          message: `The vehicle license plate "${params.licensePlate?.trim().toUpperCase()}" is already registered to an existing driver.`,
        };
      }
    }

    // 4. PrDP Number check
    if (normPrdp) {
      const existingPrdp = normalizePrdpNumber(driver.prdpNumber || driver.prdp_number);
      if (existingPrdp && existingPrdp === normPrdp) {
        return {
          isDuplicate: true,
          field: 'prdpNumber',
          message: `The PrDP permit number "${params.prdpNumber?.trim().toUpperCase()}" is already registered to an existing driver.`,
        };
      }
    }
  }

  return { isDuplicate: false };
}
