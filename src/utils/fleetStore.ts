/**
 * ============================================================================
 * SOLO South African Fleet Operations & B2B Telematics Engine
 * ============================================================================
 * Engineered for South African fleet partners, taxi operators, and vehicle leasing.
 * Provides:
 *  1. Fleet SaaS Subscription pricing & SARS VAT breakdown (R749/vehicle base).
 *  2. Multi-car inventory management, telematics status, and remote dispatch holds.
 *  3. Shift-based driver pairing (day/night shifts) and double-shifting support.
 *  4. In-vehicle Speedpoint (Yoco / iKhokha) tracking and direct bank settlement.
 *  5. Shift Reconciliation Audits (Trips, Gross Fares, Cash vs Speedpoint breakdown).
 *  6. Compliance Watchdog (Roadworthy / CoF, License Disc, and PrDP expiry tracking).
 *  7. Fleet-wide subscription coverage verification (unlocks driver dispatch).
 * ============================================================================
 */

import type {
  FleetProfile,
  FleetVehicle,
  FleetShiftAudit,
  FleetPricingCalculation,
  FleetSubscriptionTier,
  VehicleOperationalStatus,
  ShiftType,
  FleetSettlementBank,
} from '../types/fleet.ts';
import { generateUuid, getSafeLocalStorageItem, setSafeLocalStorageItem, safeJsonParse } from './session.ts';

// Fleet Pricing Constants (South African Rand ZAR)
// Option C: R770.00 Base Fleet Hub License + R499.00 / vehicle / month
export const FLEET_PRICING = {
  BASE_PLATFORM_FEE_CENTS: 77000, // R770.00 ZAR Fleet Hub Base License
  PER_VEHICLE_CENTS: 49900,       // R499.00 ZAR per active vehicle slot
  VAT_RATE: 0.15,                 // 15% South African VAT
  UBER_BOLT_MONTHLY_BENCHMARK_GROSS_ZAR: 25000, // R25,000 gross per car
  UBER_BOLT_TAKE_RATE: 0.25,      // 25% legacy commission
} as const;

/**
 * Global Testing Switch: Set to true to disable payment requirements during fleet testing.
 * When true:
 *  - Registration is 100% free with immediate full access.
 *  - Paystack checkouts run in zero-charge simulation mode without touching credit cards.
 * Set back to `false` when ready to go live with real Paystack billing.
 */
export const DISABLE_FLEET_PAYMENT_FOR_TESTING = true;

/**
 * Calculates monthly fleet billing with South African VAT and savings vs Uber/Bolt.
 * Pricing Model: R770/mo Base Fleet Hub License + R499/vehicle/mo active dispatch.
 */
export function calculateFleetMonthlyBilling(vehicleCount: number): FleetPricingCalculation {
  const count = Math.max(1, Math.floor(vehicleCount || 1));
  
  const basePlatformFeeCents = FLEET_PRICING.BASE_PLATFORM_FEE_CENTS;
  const basePlatformFeeZar = basePlatformFeeCents / 100; // R770.00
  const perVehicleCents = FLEET_PRICING.PER_VEHICLE_CENTS;
  const perVehicleZar = perVehicleCents / 100; // R499.00

  const vehiclesSubtotalZar = Math.round(count * perVehicleZar * 100) / 100;
  const subtotalZar = Math.round((basePlatformFeeZar + vehiclesSubtotalZar) * 100) / 100;
  const vatAmountZar = Math.round(subtotalZar * FLEET_PRICING.VAT_RATE * 100) / 100;
  const totalMonthlyZar = Math.round((subtotalZar + vatAmountZar) * 100) / 100;

  // Monthly savings vs Uber/Bolt 25% take-rate (R6,250/car/mo commission vs SOLO fee)
  const legacyCommissionPerCar = FLEET_PRICING.UBER_BOLT_MONTHLY_BENCHMARK_GROSS_ZAR * FLEET_PRICING.UBER_BOLT_TAKE_RATE;
  const totalLegacyCommission = count * legacyCommissionPerCar;
  const savingsVsUberBoltZar = Math.max(0, Math.round(totalLegacyCommission - totalMonthlyZar));

  const tierName: FleetSubscriptionTier = count >= 15 ? 'fleet_enterprise' : count >= 5 ? 'fleet_pro' : 'fleet_starter';
  const tierLabel = `Fleet Hub (R770 base + R499/car)`;

  return {
    vehicleCount: count,
    tierName,
    tierLabel,
    basePlatformFeeCents,
    basePlatformFeeZar,
    perVehicleCents,
    perVehicleZar,
    vehiclesSubtotalZar,
    subtotalZar,
    vatRatePercent: 15,
    vatAmountZar,
    totalMonthlyZar,
    savingsVsUberBoltZar,
  };
}

/**
 * Compliance Watchdog: Checks document expiration dates.
 * Returns: 'valid' | 'expiring_soon' (within 30 days) | 'expired'
 */
export function checkComplianceExpiry(dateString?: string | null): {
  status: 'valid' | 'expiring_soon' | 'expired' | 'missing';
  daysRemaining: number | null;
  label: string;
} {
  if (!dateString) {
    return { status: 'missing', daysRemaining: null, label: 'Missing Document' };
  }

  try {
    const target = new Date(dateString);
    if (isNaN(target.getTime())) {
      return { status: 'missing', daysRemaining: null, label: 'Invalid Date' };
    }

    const now = new Date();
    const diffMs = target.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysRemaining < 0) {
      return {
        status: 'expired',
        daysRemaining,
        label: `Expired ${Math.abs(daysRemaining)} days ago`,
      };
    }

    if (daysRemaining <= 30) {
      return {
        status: 'expiring_soon',
        daysRemaining,
        label: `Expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`,
      };
    }

    return {
      status: 'valid',
      daysRemaining,
      label: `Valid (${daysRemaining} days remaining)`,
    };
  } catch {
    return { status: 'missing', daysRemaining: null, label: 'Unknown' };
  }
}

// Storage Keys
const STORAGE_KEY_FLEET_PROFILES = 'solo_fleet_profiles';
const STORAGE_KEY_FLEET_VEHICLES = 'solo_fleet_vehicles';
const STORAGE_KEY_FLEET_AUDITS = 'solo_fleet_audits';

// In-Memory Fallbacks for Serverless & Testing
let memoryFleetProfiles: FleetProfile[] = [];
let memoryFleetVehicles: FleetVehicle[] = [];
let memoryFleetAudits: FleetShiftAudit[] = [];

/**
 * Initializes default fleet seed for demonstration or test environments.
 * When forceReset is true, bypasses existing profile check and recreates clean demo data.
 */
export function seedDefaultFleetIfNeeded(forceReset = false): FleetProfile {
  if (!forceReset) {
    const existing = getAllFleetProfiles();
    const existingApex = existing.find((f) => f.id === 'fleet-apex-capetown');
    if (existingApex) {
      return existingApex;
    }
    if (existing.length > 0) {
      return existing[0];
    }
  }

  const defaultFleet: FleetProfile = {
    id: 'fleet-apex-capetown',
    ownerEmail: 'fleet@apexlogistics.co.za',
    ownerPhone: '+27 82 555 0199',
    companyName: 'Apex Fleet Logistics (Pty) Ltd',
    registrationNumber: '2022/491823/07',
    vatNumber: '4820291847',
    contactPerson: 'Sipho Ndlovu',
    operatingCity: 'Cape Town',
    settlementBank: {
      bankName: 'First National Bank (FNB)',
      accountHolder: 'Apex Fleet Logistics Pty Ltd',
      accountNumber: '62849102948',
      branchCode: '250655',
      accountType: 'current',
    },
    subscriptionStatus: 'active',
    subscriptionTier: 'fleet_starter',
    activeVehiclesCount: 3,
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const now = new Date();
  const thirtyDaysAhead = new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const ninetyDaysAhead = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const fiveDaysExpired = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const defaultVehicles: FleetVehicle[] = [
    {
      id: 'veh-001',
      fleetId: defaultFleet.id,
      make: 'Toyota',
      model: 'Corolla Quest 1.8 Exclusive',
      year: 2022,
      color: 'Glacier White',
      licensePlate: 'CA 892-149',
      vin: 'AHTBB123498765432',
      roadworthyExpiry: ninetyDaysAhead,
      licenseDiscExpiry: ninetyDaysAhead,
      insuranceExpiry: ninetyDaysAhead,
      assignedDriverId: 'driver-thabo-01',
      assignedDriverName: 'Thabo Mthembu',
      assignedDriverPhone: '+27 71 234 5678',
      shiftType: 'day_shift',
      rentalRateWeeklyZar: 2400,
      currentStatus: 'on_trip',
      currentLat: -33.9249,
      currentLng: 18.4241,
      speedpointType: 'yoco',
      speedpointTerminalId: 'YOCO-APEX-01',
      dispatchSuspended: false,
      notes: 'Dedicated Cape Town CBD / Atlantic Seaboard route',
      createdAt: defaultFleet.createdAt,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'veh-002',
      fleetId: defaultFleet.id,
      make: 'Suzuki',
      model: 'Ertiga 1.5 GL (7-Seater)',
      year: 2023,
      color: 'Silky Silver',
      licensePlate: 'CA 314-882',
      vin: 'MA3FBB98765432109',
      roadworthyExpiry: thirtyDaysAhead, // Expiring soon (<30 days)
      licenseDiscExpiry: thirtyDaysAhead,
      insuranceExpiry: ninetyDaysAhead,
      assignedDriverId: 'driver-kabelo-02',
      assignedDriverName: 'Kabelo Dlamini',
      assignedDriverPhone: '+27 83 987 6543',
      shiftType: 'full_time',
      rentalRateWeeklyZar: 2600,
      currentStatus: 'online',
      currentLat: -33.9715,
      currentLng: 18.4682,
      speedpointType: 'ikhokha',
      speedpointTerminalId: 'IKH-APEX-02',
      dispatchSuspended: false,
      notes: 'High capacity airport shuttle vehicle',
      createdAt: defaultFleet.createdAt,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'veh-003',
      fleetId: defaultFleet.id,
      make: 'Toyota',
      model: 'Starlet 1.5 XR',
      year: 2021,
      color: 'Shadow Grey',
      licensePlate: 'CA 551-903',
      vin: 'AHTCC564738291029',
      roadworthyExpiry: fiveDaysExpired, // Expired test case
      licenseDiscExpiry: ninetyDaysAhead,
      insuranceExpiry: ninetyDaysAhead,
      assignedDriverId: null,
      assignedDriverName: null,
      assignedDriverPhone: null,
      shiftType: undefined,
      rentalRateWeeklyZar: 2100,
      currentStatus: 'idle',
      currentLat: -33.8942,
      currentLng: 18.5122,
      speedpointType: 'yoco',
      speedpointTerminalId: 'YOCO-APEX-03',
      dispatchSuspended: false,
      notes: 'Awaiting night-shift driver assignment',
      createdAt: defaultFleet.createdAt,
      updatedAt: new Date().toISOString(),
    },
  ];

  const defaultAudits: FleetShiftAudit[] = [
    {
      id: 'audit-001',
      fleetId: defaultFleet.id,
      vehicleId: 'veh-001',
      licensePlate: 'CA 892-149',
      driverId: 'driver-thabo-01',
      driverName: 'Thabo Mthembu',
      shiftDate: new Date().toISOString().slice(0, 10),
      tripsCompleted: 14,
      totalGrossZar: 1850,
      cashCollectedZar: 620,
      speedpointCollectedZar: 1230,
      distanceKm: 142.5,
      shiftHours: 9.5,
      rentalTargetZar: 480, // Daily target for R2,400/week (5-day)
      settlementStatus: 'settled',
      notes: 'Speedpoint settlement confirmed via Yoco portal',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'audit-002',
      fleetId: defaultFleet.id,
      vehicleId: 'veh-002',
      licensePlate: 'CA 314-882',
      driverId: 'driver-kabelo-02',
      driverName: 'Kabelo Dlamini',
      shiftDate: new Date().toISOString().slice(0, 10),
      tripsCompleted: 11,
      totalGrossZar: 1620,
      cashCollectedZar: 780,
      speedpointCollectedZar: 840,
      distanceKm: 168.0,
      shiftHours: 8.0,
      rentalTargetZar: 520,
      settlementStatus: 'pending',
      notes: 'Cash remittance pending evening check-in',
      createdAt: new Date().toISOString(),
    },
  ];

  saveFleetProfile(defaultFleet);
  for (const v of defaultVehicles) {
    saveFleetVehicle(v);
  }
  for (const a of defaultAudits) {
    recordFleetShiftAudit(a);
  }

  return defaultFleet;
}

/**
 * Resets the default demo fleet (Apex Logistics Cape Town) and its associated vehicles and audits
 * back to the pristine initial state, clearing any test vehicles or modifications that were just added.
 */
export function resetDemoFleet(): FleetProfile {
  const defaultFleetId = 'fleet-apex-capetown';

  // 1. Purge existing demo vehicles and audits
  const remainingVehicles = getAllFleetVehicles().filter((v) => v.fleetId !== defaultFleetId);
  memoryFleetVehicles = remainingVehicles;
  if (typeof window !== 'undefined') {
    setSafeLocalStorageItem(STORAGE_KEY_FLEET_VEHICLES, JSON.stringify(remainingVehicles));
  }

  const remainingAudits = getAllFleetAudits().filter((a) => a.fleetId !== defaultFleetId);
  memoryFleetAudits = remainingAudits;
  if (typeof window !== 'undefined') {
    setSafeLocalStorageItem(STORAGE_KEY_FLEET_AUDITS, JSON.stringify(remainingAudits));
  }

  const remainingProfiles = getAllFleetProfiles().filter((f) => f.id !== defaultFleetId);
  memoryFleetProfiles = remainingProfiles;
  if (typeof window !== 'undefined') {
    setSafeLocalStorageItem(STORAGE_KEY_FLEET_PROFILES, JSON.stringify(remainingProfiles));
  }

  // 2. Re-seed clean demo fleet
  const cleanDemo = seedDefaultFleetIfNeeded(true);
  setActiveFleetSession(cleanDemo.id);
  return cleanDemo;
}

// ----------------------------------------------------------------------------
// Profile Operations
// ----------------------------------------------------------------------------

export function getAllFleetProfiles(): FleetProfile[] {
  if (typeof window === 'undefined') {
    return memoryFleetProfiles;
  }
  const raw = getSafeLocalStorageItem(STORAGE_KEY_FLEET_PROFILES);
  const parsed = safeJsonParse<FleetProfile[]>(raw, []);
  return parsed.length > 0 ? parsed : memoryFleetProfiles;
}

export function getFleetProfile(fleetIdOrEmail: string): FleetProfile | null {
  const all = getAllFleetProfiles();
  const clean = (fleetIdOrEmail || '').trim().toLowerCase();
  return (
    all.find(
      (f) =>
        f.id.toLowerCase() === clean ||
        f.ownerEmail.toLowerCase() === clean ||
        f.companyName.toLowerCase() === clean
    ) || null
  );
}

export function saveFleetProfile(profile: FleetProfile): FleetProfile {
  const all = getAllFleetProfiles();
  const existingIdx = all.findIndex((f) => f.id === profile.id);
  const updated = {
    ...profile,
    updatedAt: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    all[existingIdx] = updated;
  } else {
    all.unshift(updated);
  }

  memoryFleetProfiles = all;
  if (typeof window !== 'undefined') {
    setSafeLocalStorageItem(STORAGE_KEY_FLEET_PROFILES, JSON.stringify(all));
  }
  return updated;
}

// ----------------------------------------------------------------------------
// Active Session & Authentication
// ----------------------------------------------------------------------------

const STORAGE_KEY_ACTIVE_FLEET_ID = 'solo_active_fleet_id';
let memoryActiveFleetId: string | null = null;

export function getActiveFleetProfile(): FleetProfile | null {
  const activeId = typeof window !== 'undefined'
    ? getSafeLocalStorageItem(STORAGE_KEY_ACTIVE_FLEET_ID)
    : memoryActiveFleetId;

  if (activeId) {
    const found = getFleetProfile(activeId);
    if (found) return found;
  }
  return null;
}

export function setActiveFleetSession(fleetId: string): void {
  memoryActiveFleetId = fleetId;
  if (typeof window !== 'undefined') {
    setSafeLocalStorageItem(STORAGE_KEY_ACTIVE_FLEET_ID, fleetId);
  }
}

export function clearActiveFleetSession(): void {
  memoryActiveFleetId = null;
  if (typeof window !== 'undefined') {
    setSafeLocalStorageItem(STORAGE_KEY_ACTIVE_FLEET_ID, '');
  }
}

export function registerFleetProfile(params: {
  companyName: string;
  contactPerson: string;
  ownerEmail: string;
  ownerPhone: string;
  operatingCity: string;
  registrationNumber?: string;
  vatNumber?: string;
  settlementBank?: FleetSettlementBank;
  estimatedVehicles?: number;
}): FleetProfile {
  const newFleet: FleetProfile = {
    id: `fleet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ownerEmail: params.ownerEmail.trim().toLowerCase(),
    ownerPhone: params.ownerPhone.trim(),
    companyName: params.companyName.trim(),
    registrationNumber: params.registrationNumber?.trim() || undefined,
    vatNumber: params.vatNumber?.trim() || undefined,
    contactPerson: params.contactPerson.trim(),
    operatingCity: params.operatingCity.trim(),
    settlementBank: params.settlementBank,
    subscriptionStatus: 'trial',
    subscriptionTier: (params.estimatedVehicles || 0) >= 15 ? 'fleet_enterprise' : (params.estimatedVehicles || 0) >= 5 ? 'fleet_pro' : 'fleet_starter',
    activeVehiclesCount: 0,
    trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveFleetProfile(newFleet);
  setActiveFleetSession(newFleet.id);
  return newFleet;
}

export function activateFleetSubscription(
  fleetId: string,
  details?: {
    paymentReference?: string;
    amountZar?: number;
    cardLast4?: string;
    cardBrand?: string;
  }
): FleetProfile | null {
  const fleet = getFleetProfile(fleetId);
  if (!fleet) return null;

  const thirtyDaysAhead = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  fleet.subscriptionStatus = 'active';
  fleet.subscriptionRenewsAt = thirtyDaysAhead;
  if (details?.paymentReference) fleet.lastPaymentReference = details.paymentReference;
  if (details?.amountZar) fleet.lastPaymentAmountZar = details.amountZar;
  if (details?.cardLast4) fleet.cardLast4 = details.cardLast4;
  if (details?.cardBrand) fleet.cardBrand = details.cardBrand;

  saveFleetProfile(fleet);
  return fleet;
}

export function loginFleetProfile(identifier: string): FleetProfile | null {
  const clean = (identifier || '').trim().toLowerCase();
  if (!clean) return null;

  const cleanDigits = clean.replace(/[^\d]/g, '');
  const all = getAllFleetProfiles();
  const matched = all.find((f) => {
    if (f.id.toLowerCase() === clean) return true;
    if (f.ownerEmail.toLowerCase() === clean) return true;
    if (f.companyName.toLowerCase() === clean) return true;
    if (cleanDigits.length >= 7) {
      const fleetPhoneDigits = f.ownerPhone.replace(/[^\d]/g, '');
      if (fleetPhoneDigits.includes(cleanDigits) || cleanDigits.includes(fleetPhoneDigits)) {
        return true;
      }
    }
    return false;
  });

  if (matched) {
    setActiveFleetSession(matched.id);
    return matched;
  }
  return null;
}

// ----------------------------------------------------------------------------
// Vehicle Operations
// ----------------------------------------------------------------------------

export function getAllFleetVehicles(): FleetVehicle[] {
  if (typeof window === 'undefined') {
    return memoryFleetVehicles;
  }
  const raw = getSafeLocalStorageItem(STORAGE_KEY_FLEET_VEHICLES);
  const parsed = safeJsonParse<FleetVehicle[]>(raw, []);
  return parsed.length > 0 ? parsed : memoryFleetVehicles;
}

export function getFleetVehicles(fleetId: string): FleetVehicle[] {
  const all = getAllFleetVehicles();
  return all.filter((v) => v.fleetId === fleetId);
}

export function saveFleetVehicle(vehicle: FleetVehicle): FleetVehicle {
  const all = getAllFleetVehicles();
  const existingIdx = all.findIndex((v) => v.id === vehicle.id);
  const updated: FleetVehicle = {
    ...vehicle,
    id: vehicle.id || generateUuid(),
    updatedAt: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    all[existingIdx] = updated;
  } else {
    all.unshift(updated);
  }

  memoryFleetVehicles = all;
  if (typeof window !== 'undefined') {
    setSafeLocalStorageItem(STORAGE_KEY_FLEET_VEHICLES, JSON.stringify(all));
  }

  // Update activeVehiclesCount on fleet profile
  const fleet = getFleetProfile(vehicle.fleetId);
  if (fleet) {
    const fleetVehicles = all.filter((v) => v.fleetId === vehicle.fleetId);
    fleet.activeVehiclesCount = fleetVehicles.length;
    saveFleetProfile(fleet);
  }

  return updated;
}

export function deleteFleetVehicle(fleetId: string, vehicleId: string): boolean {
  const all = getAllFleetVehicles();
  const filtered = all.filter((v) => !(v.fleetId === fleetId && v.id === vehicleId));
  if (filtered.length === all.length) return false;

  memoryFleetVehicles = filtered;
  if (typeof window !== 'undefined') {
    setSafeLocalStorageItem(STORAGE_KEY_FLEET_VEHICLES, JSON.stringify(filtered));
  }

  // Update active vehicle count
  const fleet = getFleetProfile(fleetId);
  if (fleet) {
    fleet.activeVehiclesCount = filtered.filter((v) => v.fleetId === fleetId).length;
    saveFleetProfile(fleet);
  }
  return true;
}

/**
 * Pairs a driver to a fleet vehicle and assigns their shift type.
 */
export function assignDriverToVehicle(
  fleetId: string,
  vehicleId: string,
  driver: {
    id: string;
    name: string;
    phone: string;
    shiftType?: ShiftType;
    rentalRateWeeklyZar?: number;
  }
): FleetVehicle | null {
  const vehicles = getAllFleetVehicles();
  const target = vehicles.find((v) => v.fleetId === fleetId && v.id === vehicleId);
  if (!target) return null;

  target.assignedDriverId = driver.id;
  target.assignedDriverName = driver.name;
  target.assignedDriverPhone = driver.phone;
  target.shiftType = driver.shiftType || 'full_time';
  if (driver.rentalRateWeeklyZar !== undefined) {
    target.rentalRateWeeklyZar = driver.rentalRateWeeklyZar;
  }
  target.currentStatus = 'online';
  target.updatedAt = new Date().toISOString();

  saveFleetVehicle(target);
  return target;
}

/**
 * Unpairs a driver from a vehicle (e.g., end of shift or driver departure).
 */
export function unassignDriverFromVehicle(fleetId: string, vehicleId: string): FleetVehicle | null {
  const vehicles = getAllFleetVehicles();
  const target = vehicles.find((v) => v.fleetId === fleetId && v.id === vehicleId);
  if (!target) return null;

  target.assignedDriverId = null;
  target.assignedDriverName = null;
  target.assignedDriverPhone = null;
  target.currentStatus = 'idle';
  target.updatedAt = new Date().toISOString();

  saveFleetVehicle(target);
  return target;
}

/**
 * Toggles remote dispatch suspension (e.g. if driver defaults on rental or vehicle needs service).
 */
export function toggleVehicleDispatchSuspension(
  fleetId: string,
  vehicleId: string,
  suspended: boolean,
  reason?: string
): FleetVehicle | null {
  const vehicles = getAllFleetVehicles();
  const target = vehicles.find((v) => v.fleetId === fleetId && v.id === vehicleId);
  if (!target) return null;

  target.dispatchSuspended = suspended;
  target.currentStatus = suspended ? 'suspended' : target.assignedDriverId ? 'online' : 'idle';
  if (reason) {
    target.notes = reason;
  }
  target.updatedAt = new Date().toISOString();

  saveFleetVehicle(target);
  return target;
}

// ----------------------------------------------------------------------------
// Shift & Financial Reconciliation Audits
// ----------------------------------------------------------------------------

export function getAllFleetAudits(): FleetShiftAudit[] {
  if (typeof window === 'undefined') {
    return memoryFleetAudits;
  }
  const raw = getSafeLocalStorageItem(STORAGE_KEY_FLEET_AUDITS);
  const parsed = safeJsonParse<FleetShiftAudit[]>(raw, []);
  return parsed.length > 0 ? parsed : memoryFleetAudits;
}

export function getFleetShiftAudits(fleetId: string, vehicleId?: string): FleetShiftAudit[] {
  const all = getAllFleetAudits();
  return all.filter((a) => a.fleetId === fleetId && (!vehicleId || a.vehicleId === vehicleId));
}

export function recordFleetShiftAudit(audit: FleetShiftAudit): FleetShiftAudit {
  const all = getAllFleetAudits();
  const existingIdx = audit.id ? all.findIndex((a) => a.id === audit.id) : -1;
  const newAudit: FleetShiftAudit = {
    ...audit,
    id: audit.id || generateUuid(),
    createdAt: audit.createdAt || new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    all[existingIdx] = newAudit;
  } else {
    all.unshift(newAudit);
  }

  memoryFleetAudits = all;
  if (typeof window !== 'undefined') {
    setSafeLocalStorageItem(STORAGE_KEY_FLEET_AUDITS, JSON.stringify(all));
  }
  return newAudit;
}

/**
 * Automatically records or increments a completed trip's earnings into the daily FleetShiftAudit
 * for the fleet vehicle/driver, making live daily earnings immediately visible to the Fleet Manager.
 */
export function recordCompletedTripToFleetAudit(params: {
  driverId?: string | null;
  driverName?: string | null;
  licensePlate?: string | null;
  fareAmountZar: number;
  paymentMethod: 'cash' | 'in_app' | 'speedpoint' | string;
  distanceKm?: number;
}): FleetShiftAudit | null {
  const coverage = checkVehicleFleetCoverage({
    driverId: params.driverId,
    licensePlate: params.licensePlate,
  });

  if (!coverage.isCovered || !coverage.fleetId || !coverage.vehicle) {
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);
  const existingAudits = getFleetShiftAudits(coverage.fleetId, coverage.vehicle.id);
  const todayAudit = existingAudits.find(
    (a) => a.shiftDate === today && a.vehicleId === coverage.vehicle!.id
  );

  const isCash = params.paymentMethod === 'cash';
  const fare = Math.max(0, Number(params.fareAmountZar) || 0);
  const distance = Math.max(0, Number(params.distanceKm) || 0);

  if (todayAudit) {
    // Increment existing shift audit for today
    todayAudit.tripsCompleted += 1;
    todayAudit.totalGrossZar += fare;
    if (isCash) {
      todayAudit.cashCollectedZar += fare;
    } else {
      todayAudit.speedpointCollectedZar += fare;
    }
    todayAudit.distanceKm = Math.round((todayAudit.distanceKm + distance) * 10) / 10;
    return recordFleetShiftAudit(todayAudit);
  }

  // Create initial shift audit for today
  const newAudit: FleetShiftAudit = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    fleetId: coverage.fleetId,
    vehicleId: coverage.vehicle.id,
    licensePlate: coverage.vehicle.licensePlate,
    driverId: params.driverId || coverage.vehicle.assignedDriverId || 'driver-live',
    driverName: params.driverName || coverage.vehicle.assignedDriverName || 'Assigned Driver',
    shiftDate: today,
    tripsCompleted: 1,
    totalGrossZar: fare,
    cashCollectedZar: isCash ? fare : 0,
    speedpointCollectedZar: isCash ? 0 : fare,
    distanceKm: distance,
    shiftHours: 1,
    rentalTargetZar: Math.round((coverage.vehicle.rentalRateWeeklyZar || 2400) / 5),
    settlementStatus: 'pending',
    createdAt: new Date().toISOString(),
  };

  return recordFleetShiftAudit(newAudit);
}

// ----------------------------------------------------------------------------
// Driver Fleet Subscription Coverage Engine
// ----------------------------------------------------------------------------

/**
 * Checks whether a given driver profile or vehicle license plate is covered
 * under an active Fleet Subscription.
 * If covered, the driver is granted full dispatch privileges without personal Paystack billing.
 */
export function checkVehicleFleetCoverage(identifier: {
  driverId?: string | null;
  licensePlate?: string | null;
}): {
  isCovered: boolean;
  fleetId?: string;
  fleetName?: string;
  vehicle?: FleetVehicle;
  dispatchSuspended?: boolean;
  reason?: string;
} {
  const vehicles = getAllFleetVehicles();
  const cleanPlate = identifier.licensePlate?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

  const matched = vehicles.find((v) => {
    if (identifier.driverId && v.assignedDriverId === identifier.driverId) {
      return true;
    }
    if (cleanPlate && v.licensePlate.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === cleanPlate) {
      return true;
    }
    return false;
  });

  if (!matched) {
    return { isCovered: false };
  }

  const fleet = getFleetProfile(matched.fleetId);
  const isFleetActive = !fleet || fleet.subscriptionStatus === 'active' || fleet.subscriptionStatus === 'trial';

  if (!isFleetActive) {
    return {
      isCovered: false,
      reason: 'Fleet subscription is past due. Please contact your fleet manager.',
    };
  }

  if (matched.dispatchSuspended) {
    return {
      isCovered: false,
      dispatchSuspended: true,
      fleetName: fleet?.companyName,
      reason: matched.notes || 'Vehicle dispatch temporarily paused by fleet manager.',
    };
  }

  return {
    isCovered: true,
    fleetId: matched.fleetId,
    fleetName: fleet?.companyName || 'SOLO Partner Fleet',
    vehicle: matched,
    dispatchSuspended: false,
  };
}
