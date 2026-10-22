/**
 * SOLO E-Hailing Platform: Fleet Management & B2B Partner Types
 * Designed for South African fleet operations, vehicle leasing, and multi-driver shift management.
 */

export type FleetSubscriptionTier = 'fleet_starter' | 'fleet_pro' | 'fleet_enterprise';
export type FleetSubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled';
export type VehicleOperationalStatus = 'online' | 'on_trip' | 'idle' | 'offline' | 'maintenance' | 'suspended';
export type ShiftType = 'full_time' | 'day_shift' | 'night_shift' | 'weekend';
export type SpeedpointDeviceType = 'yoco' | 'ikhokha' | 'nedbank_pos' | 'absa_pos' | 'standard_bank_pos' | 'capitec_pos' | 'cash_only';

export interface FleetSettlementBank {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  branchCode: string;
  accountType?: 'cheque' | 'current' | 'transmission' | 'savings';
}

export interface FleetProfile {
  id: string;
  ownerEmail: string;
  ownerPhone: string;
  companyName: string;
  registrationNumber?: string; // CIPRO / CIPC Registration No.
  vatNumber?: string; // SARS VAT Registration No.
  contactPerson: string;
  operatingCity: string;
  settlementBank?: FleetSettlementBank;
  subscriptionStatus: FleetSubscriptionStatus;
  subscriptionTier: FleetSubscriptionTier;
  activeVehiclesCount: number;
  trialEndsAt?: string;
  subscriptionRenewsAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FleetVehicle {
  id: string;
  fleetId: string;
  make: string;
  model: string;
  year: number;
  color: string;
  licensePlate: string;
  vin?: string;
  roadworthyExpiry?: string; // Certificate of Fitness (CoF) expiry date (YYYY-MM-DD)
  licenseDiscExpiry?: string; // Vehicle license disc expiry (YYYY-MM-DD)
  insuranceExpiry?: string; // Passenger Liability & Comprehensive Insurance expiry (YYYY-MM-DD)
  assignedDriverId?: string | null;
  assignedDriverName?: string | null;
  assignedDriverPhone?: string | null;
  shiftType?: ShiftType;
  rentalRateWeeklyZar?: number; // e.g., R2,200/week rental agreement
  currentStatus: VehicleOperationalStatus;
  currentLat?: number | null;
  currentLng?: number | null;
  speedpointType: SpeedpointDeviceType;
  speedpointTerminalId?: string; // e.g. Yoco Merchant/Terminal ID
  dispatchSuspended?: boolean; // Owner can toggle to hold vehicle dispatch (e.g. for rent default)
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FleetDriverAssignment {
  id: string;
  fleetId: string;
  vehicleId: string;
  driverId: string;
  driverName: string;
  driverPhone: string;
  prdpNumber?: string;
  shiftType: ShiftType;
  rentalRateWeeklyZar: number;
  assignedAt: string;
  releasedAt?: string;
  isActive: boolean;
  notes?: string;
}

export interface FleetShiftAudit {
  id: string;
  fleetId: string;
  vehicleId: string;
  licensePlate: string;
  driverId: string;
  driverName: string;
  shiftDate: string; // YYYY-MM-DD
  tripsCompleted: number;
  totalGrossZar: number;
  cashCollectedZar: number;
  speedpointCollectedZar: number;
  distanceKm: number;
  shiftHours: number;
  rentalTargetZar?: number;
  settlementStatus: 'pending' | 'settled' | 'disputed';
  notes?: string;
  createdAt: string;
}

export interface FleetPricingCalculation {
  vehicleCount: number;
  tierName: FleetSubscriptionTier;
  tierLabel: string;
  basePlatformFeeCents: number;
  basePlatformFeeZar: number;
  perVehicleCents: number;
  perVehicleZar: number;
  vehiclesSubtotalZar: number;
  subtotalZar: number;
  vatRatePercent: number; // 15% South African VAT
  vatAmountZar: number;
  totalMonthlyZar: number;
  savingsVsUberBoltZar: number; // Estimated savings vs 25% take-rate (based on R25k/mo benchmark)
}
