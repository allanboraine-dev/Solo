import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const driverId = url.searchParams.get('driverId') || url.searchParams.get('driver_id')

    if (!driverId) {
      return NextResponse.json({ error: 'Driver ID is required' }, { status: 400 })
    }

    // Fetch documents from database
    const { data: documents, error } = await supabase
      .from('driver_documents')
      .select('*')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: true })

    if (error) {
      throw error
    }

    // Generate signed URLs for each document so driver can securely view them
    const docsWithSignedUrls = await Promise.all(
      (documents || []).map(async (doc) => {
        try {
          const { data: signed } = await supabase.storage
            .from('driver-documents')
            .createSignedUrl(doc.file_path, 3600)
          return {
            ...doc,
            signedUrl: signed?.signedUrl || null,
          }
        } catch {
          return {
            ...doc,
            signedUrl: null,
          }
        }
      })
    )

    // Check profile verification status
    const { data: profile } = await supabase
      .from('driver_profiles')
      .select('is_verified, verification_notes')
      .eq('id', driverId)
      .single()

    return NextResponse.json({
      success: true,
      documents: docsWithSignedUrls,
      isVerified: !!profile?.is_verified,
      verificationNotes: profile?.verification_notes || null,
    })
  } catch (error: unknown) {
    console.error('Fetch driver documents error:', error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
