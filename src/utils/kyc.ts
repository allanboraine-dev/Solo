import type { DriverDocument, KycDocType } from '../types/kyc.ts'
import { KYC_DOCUMENT_CONFIGS } from '../types/kyc.ts'

export interface UploadResult {
  success: boolean;
  document?: DriverDocument;
  error?: string;
}

export interface DriverMetadata {
  fullName?: string;
  email?: string;
  phone?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  licensePlate?: string;
  prdpNumber?: string;
  expiresAt?: string;
}

export const DOC_EXPIRY_WARNING_DAYS = 30

export interface DocumentExpiryState {
  state: 'valid' | 'expiring_soon' | 'expired';
  daysRemaining: number | null;
  expiresAt: string | null;
}

export function getDocumentExpiryState(
  doc?: Pick<DriverDocument, 'status' | 'expires_at'> | null,
  nowMs: number = Date.now()
): DocumentExpiryState {
  if (!doc) {
    return { state: 'valid', daysRemaining: null, expiresAt: null }
  }
  if (doc.status === 'expired') {
    return { state: 'expired', daysRemaining: 0, expiresAt: doc.expires_at || null }
  }
  if (!doc.expires_at) {
    return { state: 'valid', daysRemaining: null, expiresAt: null }
  }
  const expiryMs = new Date(doc.expires_at).getTime()
  if (Number.isNaN(expiryMs)) {
    return { state: 'valid', daysRemaining: null, expiresAt: null }
  }
  const diffDays = Math.ceil((expiryMs - nowMs) / (24 * 60 * 60 * 1000))
  if (diffDays <= 0) {
    return { state: 'expired', daysRemaining: diffDays, expiresAt: doc.expires_at }
  }
  if (diffDays <= DOC_EXPIRY_WARNING_DAYS) {
    return { state: 'expiring_soon', daysRemaining: diffDays, expiresAt: doc.expires_at }
  }
  return { state: 'valid', daysRemaining: diffDays, expiresAt: doc.expires_at }
}

export interface KycComplianceEvaluation {
  canGoOnline: boolean;
  isBlocked: boolean;
  expiredDocs: Array<{
    docType: KycDocType;
    title: string;
    expiresAt: string;
    daysOverdue: number;
  }>;
  expiringSoonDocs: Array<{
    docType: KycDocType;
    title: string;
    expiresAt: string;
    daysRemaining: number;
  }>;
  rejectedDocs: Array<{
    docType: KycDocType;
    title: string;
    reason?: string | null;
  }>;
}

export function evaluateDriverKycCompliance(
  documents: DriverDocument[],
  isOwner: boolean = false,
  nowMs: number = Date.now()
): KycComplianceEvaluation {
  if (isOwner) {
    return {
      canGoOnline: true,
      isBlocked: false,
      expiredDocs: [],
      expiringSoonDocs: [],
      rejectedDocs: [],
    }
  }

  const expiredDocs: KycComplianceEvaluation['expiredDocs'] = []
  const expiringSoonDocs: KycComplianceEvaluation['expiringSoonDocs'] = []
  const rejectedDocs: KycComplianceEvaluation['rejectedDocs'] = []

  for (const doc of documents || []) {
    const config = KYC_DOCUMENT_CONFIGS[doc.doc_type]
    const title = config?.title || doc.doc_type

    if (doc.status === 'rejected') {
      rejectedDocs.push({
        docType: doc.doc_type,
        title,
        reason: doc.rejection_reason,
      })
      continue
    }

    const expiry = getDocumentExpiryState(doc, nowMs)
    if (expiry.state === 'expired') {
      expiredDocs.push({
        docType: doc.doc_type,
        title,
        expiresAt: expiry.expiresAt || doc.updated_at || new Date(nowMs).toISOString(),
        daysOverdue: Math.abs(expiry.daysRemaining || 0),
      })
    } else if (expiry.state === 'expiring_soon' && expiry.daysRemaining !== null && expiry.expiresAt) {
      expiringSoonDocs.push({
        docType: doc.doc_type,
        title,
        expiresAt: expiry.expiresAt,
        daysRemaining: expiry.daysRemaining,
      })
    }
  }

  const isBlocked = expiredDocs.length > 0 || rejectedDocs.length > 0
  return {
    canGoOnline: !isBlocked,
    isBlocked,
    expiredDocs,
    expiringSoonDocs,
    rejectedDocs,
  }
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
  file: File,
  metadata?: DriverMetadata
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

    if (metadata) {
      if (metadata.fullName) formData.append('fullName', metadata.fullName)
      if (metadata.email) formData.append('email', metadata.email)
      if (metadata.phone) formData.append('phone', metadata.phone)
      if (metadata.vehicleMake) formData.append('vehicleMake', metadata.vehicleMake)
      if (metadata.vehicleModel) formData.append('vehicleModel', metadata.vehicleModel)
      if (metadata.licensePlate) formData.append('licensePlate', metadata.licensePlate)
      if (metadata.prdpNumber) formData.append('prdpNumber', metadata.prdpNumber)
      if (metadata.expiresAt) formData.append('expiresAt', metadata.expiresAt)
    }

    const res = await fetch('/api/upload-kyc-document', {
      method: 'POST',
      body: formData,
    })

    const data = await res.json()
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Upload failed' }
    }

    // Cache locally for client-side resilience
    if (typeof window !== 'undefined' && data.document) {
      try {
        const storageKey = `driver_kyc_documents_${driverId}`
        const existing: DriverDocument[] = JSON.parse(localStorage.getItem(storageKey) || '[]')
        const filtered = existing.filter((d) => d.doc_type !== docType)
        filtered.push(data.document)
        localStorage.setItem(storageKey, JSON.stringify(filtered))
      } catch (cacheErr) {
        console.warn('Could not cache document locally:', cacheErr)
      }
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
  let serverDocs: DriverDocument[] = []
  let isVerified = false
  let verificationNotes: string | null = null

  try {
    const res = await fetch(`/api/driver-documents?driverId=${encodeURIComponent(driverId)}`)
    const data = await res.json()
    if (res.ok && data.success) {
      serverDocs = data.documents || []
      isVerified = !!data.isVerified
      verificationNotes = data.verificationNotes || null
    }
  } catch (err) {
    console.error('Error fetching driver KYC documents from server:', err)
  }

  // Merge with locally stored documents
  if (typeof window !== 'undefined') {
    try {
      const storageKey = `driver_kyc_documents_${driverId}`
      const localStr = localStorage.getItem(storageKey)
      if (localStr) {
        const localDocs: DriverDocument[] = JSON.parse(localStr)
        const map = new Map<KycDocType, DriverDocument>()
        for (const d of localDocs) {
          map.set(d.doc_type, d)
        }
        for (const d of serverDocs) {
          map.set(d.doc_type, d)
        }
        serverDocs = Array.from(map.values())
      }

      // Check profile verification status in mock_driver_profile
      const profileStr = localStorage.getItem('mock_driver_profile')
      if (profileStr) {
        const p = JSON.parse(profileStr)
        if (p.id === driverId && p.isVerified) {
          isVerified = true
        }
      }
    } catch {}
  }

  return { documents: serverDocs, isVerified, verificationNotes }
}
