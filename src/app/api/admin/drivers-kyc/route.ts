import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DriverDocument, KycDocType, KYC_DOCUMENT_CONFIGS } from '@/types/kyc';
import { isPlatformOwner } from '@/utils/owner';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key'
);

export interface DriverKycSummary {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  vehicleMake: string;
  vehicleModel: string;
  licensePlate: string;
  prdpNumber: string;
  isVerified: boolean;
  subscriptionPlan: 'trial' | 'paid' | 'owner' | 'expired';
  trialStartedAt?: string | null;
  createdAt: string;
  documents: DriverDocument[];
  totalDocs: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  complianceStatus: 'verified' | 'pending_review' | 'rejected' | 'incomplete';
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filterStatus = searchParams.get('status') || 'all';
    const searchQuery = searchParams.get('search')?.toLowerCase().trim() || '';

    // Fetch driver profiles
    const { data: drivers, error: driverErr } = await supabase
      .from('driver_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (driverErr) {
      console.warn('[AdminKycAPI] Error fetching drivers:', driverErr.message);
    }

    let driverList = drivers || [];

    // Also fetch drivers from profiles table who may not yet have a driver_profiles row
    try {
      const { data: profileDrivers } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_type', 'driver');

      if (profileDrivers && profileDrivers.length > 0) {
        const existingIds = new Set(driverList.map((d: any) => d.id));
        for (const p of profileDrivers) {
          if (!existingIds.has(p.id)) {
            driverList.push({
              id: p.id,
              full_name: p.full_name,
              email: p.email || '',
              phone: p.phone || '',
              vehicle_make: '',
              vehicle_model: '',
              license_plate: '',
              prdp_number: '',
              is_verified: false,
              subscription_plan: 'trial',
              created_at: p.created_at || new Date().toISOString(),
            });
            existingIds.add(p.id);
          }
        }
      }
    } catch (e) {
      console.warn('[AdminKycAPI] Notice merging profile drivers:', e);
    }

    // Fetch all driver documents
    const { data: allDocs, error: docErr } = await supabase
      .from('driver_documents')
      .select('*')
      .order('created_at', { ascending: false });

    if (docErr) {
      console.warn('[AdminKycAPI] Error fetching driver documents:', docErr.message);
    }

    const docsByDriver: Record<string, DriverDocument[]> = {};
    for (const doc of allDocs || []) {
      if (!docsByDriver[doc.driver_id]) {
        docsByDriver[doc.driver_id] = [];
      }
      docsByDriver[doc.driver_id].push(doc);
    }

    // Assemble compliance summaries
    const summaries: DriverKycSummary[] = await Promise.all(
      driverList.map(async (driver) => {
        const rawDocs = docsByDriver[driver.id] || [];

        // Generate signed URLs for private bucket documents
        const docsWithUrls: DriverDocument[] = await Promise.all(
          rawDocs.map(async (doc) => {
            try {
              const { data: signed } = await supabase.storage
                .from('driver-documents')
                .createSignedUrl(doc.file_path, 3600);
              return {
                ...doc,
                signedUrl: signed?.signedUrl || undefined,
              };
            } catch {
              return doc;
            }
          })
        );

        const approvedCount = docsWithUrls.filter((d) => d.status === 'approved').length;
        const pendingCount = docsWithUrls.filter((d) => d.status === 'pending').length;
        const rejectedCount = docsWithUrls.filter((d) => d.status === 'rejected').length;

        // Check required documents: license_front, license_back, prdp, roadworthy
        const requiredDocTypes: KycDocType[] = ['license_front', 'license_back', 'prdp', 'roadworthy'];
        const allRequiredApproved = requiredDocTypes.every((type) =>
          docsWithUrls.some((d) => d.doc_type === type && d.status === 'approved')
        );

        const isOwner = isPlatformOwner(driver.email) || driver.subscription_plan === 'owner';
        let complianceStatus: DriverKycSummary['complianceStatus'] = 'incomplete';
        if (isOwner || driver.is_verified || allRequiredApproved) {
          complianceStatus = 'verified';
        } else if (pendingCount > 0) {
          complianceStatus = 'pending_review';
        } else if (rejectedCount > 0) {
          complianceStatus = 'rejected';
        } else {
          complianceStatus = 'incomplete';
        }

        return {
          id: driver.id,
          fullName: driver.full_name || 'Driver',
          phone: driver.phone || '',
          email: driver.email || '',
          vehicleMake: driver.vehicle_make || '',
          vehicleModel: driver.vehicle_model || '',
          licensePlate: driver.license_plate || '',
          prdpNumber: driver.prdp_number || '',
          isVerified: isOwner || driver.is_verified || allRequiredApproved,
          subscriptionPlan: isOwner ? 'owner' : (driver.subscription_plan || 'trial'),
          trialStartedAt: driver.trial_started_at || null,
          createdAt: driver.created_at || new Date().toISOString(),
          documents: docsWithUrls,
          totalDocs: docsWithUrls.length,
          approvedCount,
          pendingCount,
          rejectedCount,
          complianceStatus,
        };
      })
    );

    // Apply filtering
    let filtered = summaries;
    if (filterStatus !== 'all') {
      filtered = filtered.filter((d) => d.complianceStatus === filterStatus);
    }

    if (searchQuery) {
      filtered = filtered.filter((d) =>
        d.fullName.toLowerCase().includes(searchQuery) ||
        d.phone.toLowerCase().includes(searchQuery) ||
        d.email.toLowerCase().includes(searchQuery) ||
        d.licensePlate.toLowerCase().includes(searchQuery) ||
        d.prdpNumber.toLowerCase().includes(searchQuery) ||
        d.vehicleModel.toLowerCase().includes(searchQuery)
      );
    }

    // Platform KPI metrics
    const metrics = {
      totalDrivers: summaries.length,
      pendingReviewCount: summaries.filter((d) => d.complianceStatus === 'pending_review').length,
      verifiedCount: summaries.filter((d) => d.complianceStatus === 'verified').length,
      rejectedCount: summaries.filter((d) => d.complianceStatus === 'rejected').length,
      incompleteCount: summaries.filter((d) => d.complianceStatus === 'incomplete').length,
    };

    return NextResponse.json({
      success: true,
      drivers: filtered,
      metrics,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[AdminKycAPI] Exception:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch compliance records' },
      { status: 500 }
    );
  }
}
