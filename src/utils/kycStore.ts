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

const generateSampleDocSvg = (title: string, subtitle: string, licenseNo: string) =>
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380"><rect width="600" height="380" fill="%2318181b" rx="20"/><rect x="20" y="20" width="560" height="340" fill="%2327272a" rx="16" stroke="%233f3f46" stroke-width="2"/><text x="50" y="70" fill="%2310b981" font-family="sans-serif" font-size="16" font-weight="bold">REPUBLIC OF SOUTH AFRICA • DEPT OF TRANSPORT</text><text x="50" y="110" fill="%23ffffff" font-family="sans-serif" font-size="22" font-weight="bold">${encodeURIComponent(title)}</text><text x="50" y="145" fill="%23a1a1aa" font-family="sans-serif" font-size="15">${encodeURIComponent(subtitle)}</text><line x1="50" y1="165" x2="550" y2="165" stroke="%2352525b" stroke-width="2"/><rect x="50" y="185" width="95" height="115" fill="%233f3f46" rx="8"/><circle cx="97" cy="230" r="22" fill="%2371717a"/><path d="M68 285 C68 265, 126 265, 126 285 Z" fill="%2371717a"/><text x="170" y="210" fill="%23e4e4e7" font-family="sans-serif" font-size="13">DOCUMENT NO: ${encodeURIComponent(licenseNo)}</text><text x="170" y="240" fill="%23e4e4e7" font-family="sans-serif" font-size="13">NATIONAL LAND TRANSPORT ACT COMPLIANT</text><text x="170" y="270" fill="%2310b981" font-family="sans-serif" font-size="13">STATUS: SUBMITTED FOR COMPLIANCE VERIFICATION</text></svg>`;

export const DEFAULT_SOLO_DRIVERS: KycDriverProfile[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    fullName: 'Allan Boraine',
    email: 'allanboraine@gmail.com',
    phone: '+27 82 000 0001',
    vehicleMake: 'Mercedes-Benz',
    vehicleModel: 'C200 Avantgarde',
    licensePlate: 'CA 100-001',
    prdpNumber: 'PRDP-ZA-0001',
    isVerified: true,
    subscriptionPlan: 'owner',
    createdAt: '2026-01-01T00:00:00.000Z',
    verificationNotes: 'Platform Founder - Lifetime Verified Clearance',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    fullName: 'Sipho Dlamini',
    email: 'sipho.dlamini@soloride.co.za',
    phone: '+27 82 482 9910',
    vehicleMake: 'Toyota',
    vehicleModel: 'Corolla Quest 1.6',
    licensePlate: 'NC 482-910',
    prdpNumber: 'PRDP-NC-2025',
    isVerified: false,
    subscriptionPlan: 'trial',
    createdAt: '2026-10-14T08:30:00.000Z',
    verificationNotes: 'Statutory documents submitted - ready for manager review',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    fullName: 'Thabo Mokoena',
    email: 'thabo.mokoena@soloride.co.za',
    phone: '+27 83 892 1000',
    vehicleMake: 'Volkswagen',
    vehicleModel: 'Polo Sedan 1.4 Trendline',
    licensePlate: 'GP 892-100',
    prdpNumber: 'PRDP-GP-2026',
    isVerified: false,
    subscriptionPlan: 'trial',
    createdAt: '2026-10-15T11:15:00.000Z',
    verificationNotes: 'Pending compliance officer verification',
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    fullName: 'Lerato Khumalo',
    email: 'lerato.khumalo@soloride.co.za',
    phone: '+27 84 554 3210',
    vehicleMake: 'Hyundai',
    vehicleModel: 'Grand i10 Sedan',
    licensePlate: 'CA 554-321',
    prdpNumber: 'PRDP-WC-8821',
    isVerified: true,
    subscriptionPlan: 'paid',
    createdAt: '2026-10-10T14:20:00.000Z',
    verificationNotes: 'Approved and verified by SOLO Compliance Officer',
  },
  {
    id: '00000000-0000-4000-8000-000000000005',
    fullName: 'Kagiso Ndlovu',
    email: 'kagiso.ndlovu@soloride.co.za',
    phone: '+27 71 332 9901',
    vehicleMake: 'Suzuki',
    vehicleModel: 'Ciaz 1.5 GL',
    licensePlate: 'ND 332-901',
    prdpNumber: 'PRDP-KZN-4412',
    isVerified: false,
    subscriptionPlan: 'trial',
    createdAt: '2026-10-16T16:45:00.000Z',
    verificationNotes: 'Registration started - pending documents upload',
  },
];

/**
 * Seed initial registered drivers and their documents if store is uninitialized
 */
export function seedDefaultKycDrivers(): void {
  for (const driver of DEFAULT_SOLO_DRIVERS) {
    if (!memoryDrivers.has(driver.id)) {
      memoryDrivers.set(driver.id, driver);
    }

    if (!memoryDocuments.has(driver.id)) {
      const docMap = new Map<KycDocType, DriverDocument>();
      const isVerified = driver.isVerified;

      // Seed documents for drivers with documents
      if (driver.id !== '00000000-0000-4000-8000-000000000005') {
        const docTypes: KycDocType[] = ['license_front', 'license_back', 'prdp', 'roadworthy'];
        for (const type of docTypes) {
          const title =
            type === 'license_front'
              ? "Driver's License (Front)"
              : type === 'license_back'
              ? "Driver's License (Back)"
              : type === 'prdp'
              ? 'Professional Driving Permit (PrDP)'
              : 'Certificate of Roadworthiness (CoR)';

          docMap.set(type, {
            id: `doc-${driver.id.slice(-4)}-${type}`,
            driver_id: driver.id,
            doc_type: type,
            file_path: `${driver.id}/${type}.png`,
            status: isVerified ? 'approved' : 'pending',
            rejection_reason: null,
            created_at: driver.createdAt,
            updated_at: driver.createdAt,
            signedUrl: generateSampleDocSvg(title, driver.fullName, driver.licensePlate),
          });
        }
      }

      memoryDocuments.set(driver.id, docMap);
    }
  }
}

// Automatically seed on module initialization
seedDefaultKycDrivers();

/**
 * Register or update driver profile in the in-memory store
 */
export function saveKycDriverProfile(profile: Partial<KycDriverProfile> & { id: string }): KycDriverProfile {
  seedDefaultKycDrivers();
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
  seedDefaultKycDrivers();
  return memoryDrivers.get(id);
}

/**
 * Retrieve all registered drivers
 */
export function getAllKycDriverProfiles(): KycDriverProfile[] {
  seedDefaultKycDrivers();
  return Array.from(memoryDrivers.values());
}

/**
 * Save an uploaded KYC document for a driver
 */
export function saveKycDocument(doc: DriverDocument): DriverDocument {
  seedDefaultKycDrivers();
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
  seedDefaultKycDrivers();
  const driverMap = memoryDocuments.get(driverId);
  if (!driverMap) return [];
  return Array.from(driverMap.values());
}

/**
 * Retrieve all documents across all drivers
 */
export function getAllKycDocuments(): DriverDocument[] {
  seedDefaultKycDrivers();
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
  seedDefaultKycDrivers();
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
  seedDefaultKycDrivers();
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
