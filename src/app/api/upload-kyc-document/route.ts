import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { KycDocType } from '@/types/kyc'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const driverId = formData.get('driverId') as string | null
    const docType = formData.get('docType') as KycDocType | null

    if (!driverId) {
      return NextResponse.json({ error: 'Driver ID is required' }, { status: 400 })
    }

    if (!docType || !['license_front', 'license_back', 'prdp', 'roadworthy', 'vehicle_photo'].includes(docType)) {
      return NextResponse.json({ error: 'Invalid or missing document type' }, { status: 400 })
    }

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: 'File size exceeds maximum limit of 10MB' }, { status: 400 })
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({ 
        error: `Unsupported file format (${file.type}). Allowed formats: JPEG, PNG, WEBP, or PDF` 
      }, { status: 400 })
    }

    const fileExt = file.name.split('.').pop()?.toLowerCase() || (file.type === 'application/pdf' ? 'pdf' : 'jpg')
    const fileName = `${docType}_${Date.now()}.${fileExt}`
    const storagePath = `${driverId}/${fileName}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // 1. Upload to Supabase Storage 'driver-documents' bucket
    const { error: uploadError } = await supabase.storage
      .from('driver-documents')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      throw new Error(`Storage upload failed: ${uploadError.message}`)
    }

    // 2. Upsert record into driver_documents table
    const { data: docRecord, error: dbError } = await supabase
      .from('driver_documents')
      .upsert(
        {
          driver_id: driverId,
          doc_type: docType,
          file_path: storagePath,
          status: 'pending',
          rejection_reason: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'driver_id,doc_type' }
      )
      .select()
      .single()

    if (dbError) {
      console.error('Database record error:', dbError)
      throw new Error(`Failed to record document metadata: ${dbError.message}`)
    }

    // 3. Update boolean compliance flags on driver_profiles
    const profileUpdates: Record<string, boolean> = {}
    if (docType === 'license_front' || docType === 'license_back') {
      profileUpdates.has_license = true
    } else if (docType === 'prdp') {
      profileUpdates.has_prdp = true
    } else if (docType === 'roadworthy') {
      profileUpdates.has_roadworthy = true
    }

    if (Object.keys(profileUpdates).length > 0) {
      await supabase
        .from('driver_profiles')
        .update(profileUpdates)
        .eq('id', driverId)
    }

    // 4. Generate a temporary signed URL (valid for 1 hour) for instant UI preview
    const { data: signedData } = await supabase.storage
      .from('driver-documents')
      .createSignedUrl(storagePath, 3600)

    return NextResponse.json({
      success: true,
      document: {
        ...docRecord,
        signedUrl: signedData?.signedUrl || null,
      },
      message: 'Document uploaded successfully and queued for verification',
    })
  } catch (error: unknown) {
    console.error('Upload KYC document route error:', error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
