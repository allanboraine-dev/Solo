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
  createdAt: string;
  verificationNotes?: string | null;
}

// In-memory persistent collections across Next.js API lifecycle
const memoryDrivers = new Map<string, KycDriverProfile>();
const memoryDocuments = new Map<string, Map<KycDocType, DriverDocument>>();

const MANDATORY_DOC_TYPES: KycDocType[] = ['license_front', 'license_back', 'prdp', 'roadworthy'];

/**
 * Register or update driver profile in the in-memory store
 */
export function saveKycDriverProfile(profile: Partial<KycDriverProfile> & { id: string }): KycDriverProfile {
  const existing = memoryDrivers.get(profile.id);
  const isOwner = isPlatformOwner(profile.email || existing?.email || '');

  const updated: KycDriverProfile = {
    id: profile.id,
    fullName: profile.fullName || existing?.fullName || 'Driver',
    email: profile.email || existing?.email || '',
    phone: profile.phone || existing?.phone || '',
    vehicleMake: profile.vehicleMake || existing?.vehicleMake || 'Toyota',
    vehicleModel: profile.vehicleModel || existing?.vehicleModel || 'Corolla Quest',
    licensePlate: profile.licensePlate || existing?.licensePlate || '',
    prdpNumber: profile.prdpNumber || existing?.prdpNumber || '',
    isVerified: isOwner || (profile.isVerified !== undefined ? profile.isVerified : existing?.isVerified ?? false),
    subscriptionPlan: isOwner ? 'owner' : (profile.subscriptionPlan || existing?.subscriptionPlan || 'trial'),
    trialStartedAt: profile.trialStartedAt !== undefined ? profile.trialStartedAt : (existing?.trialStartedAt || new Date().toISOString()),
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
  for (const driverMap of memoryDocuments.values()) {
    all.push(...driverMap.values());
  }
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
 * Reset store (for unit tests)
 */
export function resetKycStore(): void {
  memoryDrivers.clear();
  memoryDocuments.clear();
}
