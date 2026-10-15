import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { KycDocType, KycDocStatus, KYC_DOCUMENT_CONFIGS } from '@/types/kyc';
import { sendWebPushNotification, PushPayload } from '@/utils/webPush';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key'
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { documentId, driverId, docType, status, rejectionReason, adminNotes } = body;

    if (!documentId || !driverId || !docType || !status) {
      return NextResponse.json(
        { error: 'documentId, driverId, docType, and status are required' },
        { status: 400 }
      );
    }

    if (status !== 'approved' && status !== 'rejected') {
      return NextResponse.json(
        { error: "status must be either 'approved' or 'rejected'" },
        { status: 400 }
      );
    }

    if (status === 'rejected' && (!rejectionReason || !rejectionReason.trim())) {
      return NextResponse.json(
        { error: 'A specific rejection reason is required when rejecting a document' },
        { status: 400 }
      );
    }

    const reviewedAt = new Date().toISOString();
    const reviewedBy = adminNotes || 'SOLO Compliance Officer';

    // 1. Update driver_documents record
    const { data: updatedDoc, error: docUpdateErr } = await supabase
      .from('driver_documents')
      .update({
        status,
        rejection_reason: status === 'rejected' ? rejectionReason : null,
        reviewed_at: reviewedAt,
        reviewed_by: reviewedBy,
        updated_at: reviewedAt,
      })
      .eq('id', documentId)
      .select()
      .single();

    if (docUpdateErr) {
      console.error('[AdminReviewDoc] Document update error:', docUpdateErr);
      return NextResponse.json({ error: docUpdateErr.message }, { status: 500 });
    }

    // 2. Fetch all driver documents to recalculate compliance status
    const { data: allDocs, error: allDocsErr } = await supabase
      .from('driver_documents')
      .select('doc_type, status')
      .eq('driver_id', driverId);

    if (allDocsErr) {
      console.warn('[AdminReviewDoc] Error fetching all docs:', allDocsErr.message);
    }

    const docs = allDocs || [];
    const hasLicenseFront = docs.some((d) => d.doc_type === 'license_front' && d.status === 'approved');
    const hasLicenseBack = docs.some((d) => d.doc_type === 'license_back' && d.status === 'approved');
    const hasPrdp = docs.some((d) => d.doc_type === 'prdp' && d.status === 'approved');
    const hasRoadworthy = docs.some((d) => d.doc_type === 'roadworthy' && d.status === 'approved');

    const allMandatoryApproved = hasLicenseFront && hasLicenseBack && hasPrdp && hasRoadworthy;

    // 3. Update driver_profiles compliance flags
    const { error: profileUpdateErr } = await supabase
      .from('driver_profiles')
      .update({
        has_license: hasLicenseFront && hasLicenseBack,
        has_prdp: hasPrdp,
        has_roadworthy: hasRoadworthy,
        is_verified: allMandatoryApproved,
        verification_notes: allMandatoryApproved
          ? 'Fully verified by SOLO Compliance'
          : status === 'rejected'
          ? `Document ${docType} rejected: ${rejectionReason}`
          : 'Pending review of remaining documents',
        updated_at: reviewedAt,
      })
      .eq('id', driverId);

    if (profileUpdateErr) {
      console.warn('[AdminReviewDoc] Profile update error:', profileUpdateErr.message);
    }

    // 4. Dispatch Web Push notification to driver if subscription exists
    try {
      const { data: pushSubs } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('user_id', driverId);

      const docConfig = KYC_DOCUMENT_CONFIGS[docType as KycDocType];
      const docTitle = docConfig?.title || docType;

      if (pushSubs && pushSubs.length > 0) {
        let pushPayload: PushPayload;
        if (allMandatoryApproved) {
          pushPayload = {
            title: "🎉 KYC Approved - You're Ready to Drive!",
            body: 'Your driver documents have been approved by SOLO Compliance. Go online to accept rides and keep 100% of your earnings!',
            role: 'driver',
            icon: '/driver-icon-192.png',
            url: '/driver',
            tag: 'kyc-approved',
          };
        } else if (status === 'rejected') {
          pushPayload = {
            title: 'KYC Document Update Needed ⚠️',
            body: `Your ${docTitle} was not approved: ${rejectionReason}. Tap here to re-upload.`,
            role: 'driver',
            icon: '/driver-icon-192.png',
            url: '/driver',
            tag: `kyc-rejected-${docType}`,
          };
        } else {
          pushPayload = {
            title: 'Document Approved ✓',
            body: `Your ${docTitle} was verified by SOLO Compliance.`,
            role: 'driver',
            icon: '/driver-icon-192.png',
            url: '/driver',
            tag: `kyc-partial-${docType}`,
          };
        }

        for (const sub of pushSubs) {
          await sendWebPushNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            pushPayload
          );
        }
      }
    } catch (pushErr) {
      console.warn('[AdminReviewDoc] Push notification dispatch warning:', pushErr);
    }

    return NextResponse.json({
      success: true,
      document: updatedDoc,
      isDriverVerified: allMandatoryApproved,
      message: allMandatoryApproved
        ? 'Document approved and driver is now fully verified!'
        : status === 'approved'
        ? 'Document approved successfully'
        : 'Document rejected with reason recorded',
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[AdminReviewDoc] Exception:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error reviewing document' },
      { status: 500 }
    );
  }
}
