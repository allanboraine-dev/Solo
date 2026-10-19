import type { DriverDocument, KycDocType, KycDocStatus } from '../types/kyc.ts';
import { isPlatformOwner } from './owner.ts';

export interface KycDriverProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  vehicleMake: string;
  vehicleModel: string;
  licensePlate: string;
  prdpNumber: string;
  isVerified: boolean;
  subscriptionPlan: 'trial' | 'paid' | 'owner' | 'expired';
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  cardLast4?: string | null;
  cardBrand?: string | null;
  cardExpMonth?: string | null;
  cardExpYear?: string | null;
  paystackSubscriptionCode?: string | null;
  paystackAuthorizationCode?: string | null;
  nextBillingDate?: string | null;
  cardCaptured?: boolean;
  createdAt: string;
  verificationNotes?: string | null;
}

export interface DriverSignupAlert {
  id: string;
  driverId: string;
  fullName: string;
  email: string;
  phone: string;
  vehicleMake: string;
  vehicleModel: string;
  licensePlate: string;
  prdpNumber?: string;
  createdAt: string;
  read?: boolean;
}

// In-memory persistent collections across Next.js API lifecycle (real registered drivers only)
const memoryDrivers = new Map<string, KycDriverProfile>();
const memoryDocuments = new Map<string, Map<KycDocType, DriverDocument>>();
const memorySignupAlerts: DriverSignupAlert[] = [];
const purgedDriverIds = new Set<string>();

export function isDriverPurged(driverId: string): boolean {
  return purgedDriverIds.has(driverId);
}

const MANDATORY_DOC_TYPES: KycDocType[] = ['license_front', 'license_back', 'prdp', 'roadworthy'];

/**
 * Record a new driver signup alert for the command centre
 */
export function recordDriverSignupAlert(
  alert: Omit<DriverSignupAlert, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
): DriverSignupAlert {
  const newAlert: DriverSignupAlert = {
    id: alert.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `alert-${Date.now()}`),
    driverId: alert.driverId,
    fullName: alert.fullName || 'New Driver',
    email: alert.email || '',
    phone: alert.phone || '',
    vehicleMake: alert.vehicleMake || '',
    vehicleModel: alert.vehicleModel || '',
    licensePlate: alert.licensePlate || '',
    prdpNumber: alert.prdpNumber || '',
    createdAt: alert.createdAt || new Date().toISOString(),
    read: false,
  };

  memorySignupAlerts.unshift(newAlert);
  if (memorySignupAlerts.length > 100) {
    memorySignupAlerts.length = 100;
  }
  return newAlert;
}

/**
 * Retrieve recent driver signup alerts
 */
export function getRecentDriverSignupAlerts(limit = 30): DriverSignupAlert[] {
  return memorySignupAlerts.slice(0, limit);
}

/**
 * Mark a driver signup alert as acknowledged / read
 */
export function markDriverSignupAlertRead(alertId: string): void {
  const found = memorySignupAlerts.find((a) => a.id === alertId);
  if (found) {
    found.read = true;
  }
}

/**
 * Register or update driver profile in the in-memory store
 */
export function saveKycDriverProfile(profile: Partial<KycDriverProfile> & { id: string }): KycDriverProfile {
  purgedDriverIds.delete(profile.id);
  const existing = memoryDrivers.get(profile.id);
  const isOwner = isPlatformOwner(profile.email || existing?.email || '');

  const updated: KycDriverProfile = {
    id: profile.id,
    fullName: profile.fullName || existing?.fullName || 'Driver',
    email: profile.email || existing?.email || '',
    phone: profile.phone || existing?.phone || '',
    vehicleMake: profile.vehicleMake || existing?.vehicleMake || '',
    vehicleModel: profile.vehicleModel || existing?.vehicleModel || '',
    licensePlate: profile.licensePlate || existing?.licensePlate || '',
    prdpNumber: profile.prdpNumber || existing?.prdpNumber || '',
    isVerified: isOwner || (profile.isVerified !== undefined ? profile.isVerified : existing?.isVerified ?? false),
    subscriptionPlan: isOwner ? 'owner' : (profile.subscriptionPlan || existing?.subscriptionPlan || 'trial'),
    trialStartedAt: profile.trialStartedAt !== undefined ? profile.trialStartedAt : (existing?.trialStartedAt || new Date().toISOString()),
    trialEndsAt: profile.trialEndsAt !== undefined ? profile.trialEndsAt : (existing?.trialEndsAt || null),
    cardLast4: profile.cardLast4 !== undefined ? profile.cardLast4 : (existing?.cardLast4 || null),
    cardBrand: profile.cardBrand !== undefined ? profile.cardBrand : (existing?.cardBrand || null),
    cardExpMonth: profile.cardExpMonth !== undefined ? profile.cardExpMonth : (existing?.cardExpMonth || null),
    cardExpYear: profile.cardExpYear !== undefined ? profile.cardExpYear : (existing?.cardExpYear || null),
    paystackSubscriptionCode: profile.paystackSubscriptionCode !== undefined ? profile.paystackSubscriptionCode : (existing?.paystackSubscriptionCode || null),
    paystackAuthorizationCode: profile.paystackAuthorizationCode !== undefined ? profile.paystackAuthorizationCode : (existing?.paystackAuthorizationCode || null),
    nextBillingDate: profile.nextBillingDate !== undefined ? profile.nextBillingDate : (existing?.nextBillingDate || null),
    cardCaptured: isOwner ? true : (profile.cardCaptured !== undefined ? profile.cardCaptured : (existing?.cardCaptured ?? false)),
    createdAt: existing?.createdAt || profile.createdAt || new Date().toISOString(),
    verificationNotes: profile.verificationNotes !== undefined ? profile.verificationNotes : (existing?.verificationNotes || null),
  };

  memoryDrivers.set(profile.id, updated);
  return updated;
}

/**
 * Retrieve driver profile from store
 */
export function getKycDriverProfile(id: string): KycDriverProfile | undefined {
  return memoryDrivers.get(id);
}

/**
 * Retrieve all registered drivers
 */
export function getAllKycDriverProfiles(): KycDriverProfile[] {
  return Array.from(memoryDrivers.values());
}

/**
 * Save an uploaded KYC document for a driver
 */
export function saveKycDocument(doc: DriverDocument): DriverDocument {
  if (!memoryDocuments.has(doc.driver_id)) {
    memoryDocuments.set(doc.driver_id, new Map());
  }

  const driverMap = memoryDocuments.get(doc.driver_id)!;
  const existing = driverMap.get(doc.doc_type);

  const mergedDoc: DriverDocument = {
    id: doc.id || existing?.id || crypto.randomUUID(),
    driver_id: doc.driver_id,
    doc_type: doc.doc_type,
    file_path: doc.file_path || existing?.file_path || `${doc.driver_id}/${doc.doc_type}.jpg`,
    status: doc.status || existing?.status || 'pending',
    rejection_reason: doc.status === 'rejected' ? (doc.rejection_reason || existing?.rejection_reason || null) : null,
    reviewed_at: doc.reviewed_at || existing?.reviewed_at || null,
    reviewed_by: doc.reviewed_by || existing?.reviewed_by || null,
    created_at: existing?.created_at || doc.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    signedUrl: doc.signedUrl || existing?.signedUrl,
  };

  driverMap.set(doc.doc_type, mergedDoc);

  // If driver does not exist yet, initialize a basic record
  if (!memoryDrivers.has(doc.driver_id)) {
    saveKycDriverProfile({ id: doc.driver_id });
  }

  return mergedDoc;
}

/**
 * Retrieve all documents for a specific driver
 */
export function getKycDocumentsForDriver(driverId: string): DriverDocument[] {
  const driverMap = memoryDocuments.get(driverId);
  if (!driverMap) return [];
  return Array.from(driverMap.values());
}

/**
 * Retrieve all documents across all drivers
 */
export function getAllKycDocuments(): DriverDocument[] {
  const all: DriverDocument[] = [];
  memoryDocuments.forEach((driverMap) => {
    driverMap.forEach((doc) => {
      all.push(doc);
    });
  });
  return all;
}

/**
 * Review/update the status of an individual document
 */
export function updateKycDocumentStatus(
  driverId: string,
  docType: KycDocType,
  status: KycDocStatus,
  rejectionReason?: string | null,
  reviewedBy?: string | null
): { document: DriverDocument; isAllApproved: boolean } {
  let driverMap = memoryDocuments.get(driverId);
  if (!driverMap) {
    driverMap = new Map();
    memoryDocuments.set(driverId, driverMap);
  }

  const existing = driverMap.get(docType);
  const now = new Date().toISOString();

  const updatedDoc: DriverDocument = {
    id: existing?.id || crypto.randomUUID(),
    driver_id: driverId,
    doc_type: docType,
    file_path: existing?.file_path || `${driverId}/${docType}.jpg`,
    status,
    rejection_reason: status === 'rejected' ? (rejectionReason || null) : null,
    reviewed_at: now,
    reviewed_by: reviewedBy || null,
    created_at: existing?.created_at || now,
    updated_at: now,
    signedUrl: existing?.signedUrl,
  };

  driverMap.set(docType, updatedDoc);

  // Check if all mandatory documents are now approved
  const allDocs = Array.from(driverMap.values());
  const isAllApproved = MANDATORY_DOC_TYPES.every((type) =>
    allDocs.some((d) => d.doc_type === type && d.status === 'approved')
  );

  if (isAllApproved) {
    const driver = memoryDrivers.get(driverId);
    if (driver) {
      driver.isVerified = true;
      driver.verificationNotes = 'Approved and verified by SOLO Compliance Officer';
    }
  }

  return { document: updatedDoc, isAllApproved };
}

/**
 * Approve all documents for a driver at once
 */
export function approveAllKycDocuments(
  driverId: string,
  reviewedBy?: string | null
): { documents: DriverDocument[]; isVerified: boolean } {
  let driverMap = memoryDocuments.get(driverId);
  if (!driverMap) {
    driverMap = new Map();
    memoryDocuments.set(driverId, driverMap);
  }

  const now = new Date().toISOString();

  // Ensure all 4 mandatory docs exist as approved
  for (const type of MANDATORY_DOC_TYPES) {
    const existing = driverMap.get(type);
    driverMap.set(type, {
      id: existing?.id || crypto.randomUUID(),
      driver_id: driverId,
      doc_type: type,
      file_path: existing?.file_path || `${driverId}/${type}.jpg`,
      status: 'approved',
      rejection_reason: null,
      reviewed_at: now,
      reviewed_by: reviewedBy || null,
      created_at: existing?.created_at || now,
      updated_at: now,
      signedUrl: existing?.signedUrl,
    });
  }

  // Also approve vehicle_photo if present
  const vehiclePhoto = driverMap.get('vehicle_photo');
  if (vehiclePhoto) {
    vehiclePhoto.status = 'approved';
    vehiclePhoto.rejection_reason = null;
    vehiclePhoto.reviewed_at = now;
    vehiclePhoto.reviewed_by = reviewedBy || null;
    vehiclePhoto.updated_at = now;
  }

  // Mark driver verified
  const driver = memoryDrivers.get(driverId) || saveKycDriverProfile({ id: driverId });
  driver.isVerified = true;
  driver.verificationNotes = 'All statutory compliance documents verified and approved';

  return {
    documents: Array.from(driverMap.values()),
    isVerified: true,
  };
}

/**
 * Completely purge a bogus or test driver registration, documents, and related signup alerts from the store
 */
export function deleteKycDriverProfile(driverId: string): boolean {
  purgedDriverIds.add(driverId);
  const hadDriver = memoryDrivers.delete(driverId);
  memoryDocuments.delete(driverId);

  // Also remove any signup alerts for this driver
  for (let i = memorySignupAlerts.length - 1; i >= 0; i--) {
    if (memorySignupAlerts[i].driverId === driverId) {
      memorySignupAlerts.splice(i, 1);
    }
  }

  return hadDriver;
}

/**
 * Reset store (for unit tests)
 */
export function resetKycStore(): void {
  memoryDrivers.clear();
  memoryDocuments.clear();
  memorySignupAlerts.length = 0;
  purgedDriverIds.clear();
}
