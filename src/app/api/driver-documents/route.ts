import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getKycDocumentsForDriver, getKycDriverProfile } from '@/utils/kycStore'
import { DriverDocument, KycDocType } from '@/types/kyc'
import { validateDriverAuthorization, createUnauthorizedResponse } from '@/utils/apiAuth'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key'
)

const MANDATORY_DOC_TYPES: KycDocType[] = ['license_front', 'license_back', 'prdp', 'roadworthy']

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const driverId = url.searchParams.get('driverId') || url.searchParams.get('driver_id')

    if (!driverId) {
      return NextResponse.json({ error: 'Driver ID is required' }, { status: 400 })
    }

    // BOLA Protection: Verify caller is this driver or authorized platform admin
    const auth = await validateDriverAuthorization(req, driverId)
    if (!auth.authorized) {
      return createUnauthorizedResponse(auth.reason || "Unauthorized to view this driver's documents", 403)
    }

    // 1. Fetch documents from database (gracefully handling missing tables/RLS)
    let dbDocuments: DriverDocument[] = []
    try {
      const { data, error } = await supabase
        .from('driver_documents')
        .select('*')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: true })

      if (!error && data) {
        dbDocuments = data
      }
    } catch (dbErr) {
      console.warn('[DriverDocumentsAPI] Supabase documents notice:', dbErr)
    }

    // 2. Fetch documents from memory kycStore
    const memoryDocs = getKycDocumentsForDriver(driverId)

    // 3. Merge: Database takes precedence, but memory fills in missing or offline docs & previews
    const mergedMap = new Map<KycDocType, DriverDocument>()
    for (const doc of memoryDocs) {
      mergedMap.set(doc.doc_type, doc)
    }
    for (const doc of dbDocuments) {
      const existing = mergedMap.get(doc.doc_type)
      mergedMap.set(doc.doc_type, {
        ...doc,
        signedUrl: existing?.signedUrl || undefined,
      })
    }

    // 4. Generate signed URLs for private bucket documents where preview is not already present
    const finalDocs: DriverDocument[] = await Promise.all(
      Array.from(mergedMap.values()).map(async (doc) => {
        if (doc.signedUrl) return doc
        try {
          const { data: signed } = await supabase.storage
            .from('driver-documents')
            .createSignedUrl(doc.file_path, 3600)
          return {
            ...doc,
            signedUrl: signed?.signedUrl || undefined,
          }
        } catch {
          return doc
        }
      })
    )

    // 5. Check profile verification status from DB & memory
    let isVerified = false
    let verificationNotes: string | null = null

    try {
      const { data: profile } = await supabase
        .from('driver_profiles')
        .select('is_verified, verification_notes')
        .eq('id', driverId)
        .maybeSingle()

      if (profile) {
        isVerified = !!profile.is_verified
        verificationNotes = profile.verification_notes || null
      }
    } catch (pErr) {
      console.warn('[DriverDocumentsAPI] Supabase profile notice:', pErr)
    }

    const memoryProfile = getKycDriverProfile(driverId)
    if (memoryProfile) {
      if (memoryProfile.isVerified) isVerified = true
      if (memoryProfile.verificationNotes && !verificationNotes) {
        verificationNotes = memoryProfile.verificationNotes
      }
    }

    // If all 4 statutory documents are approved, driver is verified
    const allMandatoryApproved = MANDATORY_DOC_TYPES.every((type) =>
      finalDocs.some((d) => d.doc_type === type && d.status === 'approved')
    )
    if (allMandatoryApproved) {
      isVerified = true
    }

    return NextResponse.json({
      success: true,
      documents: finalDocs,
      isVerified,
      verificationNotes,
    })
  } catch (error: unknown) {
    console.error('Fetch driver documents error:', error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
