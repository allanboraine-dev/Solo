export type KycDocType = 
  | 'license_front'
  | 'license_back'
  | 'prdp'
  | 'roadworthy'
  | 'vehicle_photo';

export type KycDocStatus = 'pending' | 'approved' | 'rejected';

export interface DriverDocument {
  id: string;
  driver_id: string;
  doc_type: KycDocType;
  file_path: string;
  status: KycDocStatus;
  rejection_reason?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
  signedUrl?: string;
}

export interface KycDocumentConfig {
  type: KycDocType;
  title: string;
  description: string;
  required: boolean;
  acceptedFormats: string[];
  maxSizeMb: number;
}

export const KYC_DOCUMENT_CONFIGS: Record<KycDocType, KycDocumentConfig> = {
  license_front: {
    type: 'license_front',
    title: "Driver's License (Front)",
    description: "Clear photo or PDF of the front of your valid South African driver's license (Code B/EB).",
    required: true,
    acceptedFormats: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    maxSizeMb: 10,
  },
  license_back: {
    type: 'license_back',
    title: "Driver's License (Back)",
    description: "Photo of the back of your license card showing license codes and expiration date.",
    required: true,
    acceptedFormats: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    maxSizeMb: 10,
  },
  prdp: {
    type: 'prdp',
    title: "Professional Driving Permit (PrDP)",
    description: "Valid South African PrDP certificate or endorsed driver's license card.",
    required: true,
    acceptedFormats: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    maxSizeMb: 10,
  },
  roadworthy: {
    type: 'roadworthy',
    title: "Roadworthy Certificate (CoR)",
    description: "Certificate of Roadworthiness or recent 40-point safety inspection certificate.",
    required: true,
    acceptedFormats: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    maxSizeMb: 10,
  },
  vehicle_photo: {
    type: 'vehicle_photo',
    title: "Vehicle Photo (Plate Visible)",
    description: "Clear photo of your registered vehicle showing license plate and overall condition.",
    required: false,
    acceptedFormats: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeMb: 10,
  },
};
