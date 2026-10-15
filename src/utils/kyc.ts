import type { DriverDocument, KycDocType } from '../types/kyc.ts'
import { KYC_DOCUMENT_CONFIGS } from '../types/kyc.ts'

export interface UploadResult {
  success: boolean;
  document?: DriverDocument;
  error?: string;
}

export function validateKycFile(file: File, docType: KycDocType): { valid: boolean; error?: string } {
  const config = KYC_DOCUMENT_CONFIGS[docType]
  if (!config) {
    return { valid: false, error: 'Unknown document type' }
  }

  const maxBytes = config.maxSizeMb * 1024 * 1024
  if (file.size > maxBytes) {
    return { valid: false, error: `File exceeds maximum size of ${config.maxSizeMb}MB` }
  }

  if (!config.acceptedFormats.includes(file.type)) {
    return { valid: false, error: 'Allowed formats: JPG, PNG, WEBP, or PDF' }
  }

  return { valid: true }
}

export async function uploadDriverKycDocument(
  driverId: string,
  docType: KycDocType,
  file: File
): Promise<UploadResult> {
  const validation = validateKycFile(file, docType)
  if (!validation.valid) {
    return { success: false, error: validation.error }
  }

  try {
    const formData = new FormData()
    formData.append('driverId', driverId)
    formData.append('docType', docType)
    formData.append('file', file)

    const res = await fetch('/api/upload-kyc-document', {
      method: 'POST',
      body: formData,
    })

    const data = await res.json()
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Upload failed' }
    }

    return {
      success: true,
      document: data.document,
    }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message || 'Network error during upload' }
  }
}

export async function fetchDriverKycDocuments(
  driverId: string
): Promise<{ documents: DriverDocument[]; isVerified: boolean; verificationNotes: string | null }> {
  try {
    const res = await fetch(`/api/driver-documents?driverId=${encodeURIComponent(driverId)}`)
    const data = await res.json()
    if (res.ok && data.success) {
      return {
        documents: data.documents || [],
        isVerified: !!data.isVerified,
        verificationNotes: data.verificationNotes || null,
      }
    }
  } catch (err) {
    console.error('Error fetching driver KYC documents:', err)
  }

  return { documents: [], isVerified: false, verificationNotes: null }
}
