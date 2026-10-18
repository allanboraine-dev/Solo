import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DriverDocument, KycDocType, KYC_DOCUMENT_CONFIGS } from '@/types/kyc';
import { isPlatformOwner } from '@/utils/owner';
import { getAllKycDriverProfiles, getAllKycDocuments, getRecentDriverSignupAlerts } from '@/utils/kycStore';

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

    // 1. Fetch driver profiles from Supabase
    let dbDrivers: any[] = [];
    try {
      const { data: drivers, error: driverErr } = await supabase
        .from('driver_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (driverErr) {
        console.warn('[AdminKycAPI] Error fetching drivers:', driverErr.message);
      } else if (drivers) {
        dbDrivers = drivers;
      }
    } catch (e) {
      console.warn('[AdminKycAPI] DB drivers notice:', e);
    }

    let driverList = [...dbDrivers];

    // 2. Also fetch drivers from profiles table who may not yet have a driver_profiles row
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

    // 3. Merge in-memory registered drivers from kycStore
    const memoryDrivers = getAllKycDriverProfiles();
    const existingIds = new Set(driverList.map((d: any) => d.id));
    for (const m of memoryDrivers) {
      if (!existingIds.has(m.id)) {
        driverList.push({
          id: m.id,
          full_name: m.fullName,
          email: m.email,
          phone: m.phone,
          vehicle_make: m.vehicleMake,
          vehicle_model: m.vehicleModel,
          license_plate: m.licensePlate,
          prdp_number: m.prdpNumber,
          is_verified: m.isVerified,
          subscription_plan: m.subscriptionPlan,
          trial_started_at: m.trialStartedAt,
          created_at: m.createdAt,
        });
        existingIds.add(m.id);
      } else {
        // If already exists in DB but memory has newer verification status or metadata, merge
        const idx = driverList.findIndex((d: any) => d.id === m.id);
        if (idx !== -1) {
          driverList[idx] = {
            ...driverList[idx],
            is_verified: driverList[idx].is_verified || m.isVerified,
            full_name: driverList[idx].full_name || m.fullName,
            phone: driverList[idx].phone || m.phone,
            vehicle_make: driverList[idx].vehicle_make || m.vehicleMake,
            vehicle_model: driverList[idx].vehicle_model || m.vehicleModel,
            license_plate: driverList[idx].license_plate || m.licensePlate,
          };
        }
      }
    }

    // 4. Fetch all driver documents from Supabase
    let dbDocs: DriverDocument[] = [];
    try {
      const { data: allDocs, error: docErr } = await supabase
        .from('driver_documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (docErr) {
        console.warn('[AdminKycAPI] Error fetching driver documents:', docErr.message);
      } else if (allDocs) {
        dbDocs = allDocs;
      }
    } catch (e) {
      console.warn('[AdminKycAPI] DB docs notice:', e);
    }

    // 5. Merge in-memory documents from kycStore
    const memoryDocs = getAllKycDocuments();
    const docsByDriver: Record<string, DriverDocument[]> = {};

    // Group memory docs first
    for (const doc of memoryDocs) {
      if (!docsByDriver[doc.driver_id]) {
        docsByDriver[doc.driver_id] = [];
      }
      docsByDriver[doc.driver_id].push(doc);
    }

    // Merge DB docs (preferring newer status while preserving signedUrl / previews)
    for (const doc of dbDocs) {
      if (!docsByDriver[doc.driver_id]) {
        docsByDriver[doc.driver_id] = [];
      }
      const existingIdx = docsByDriver[doc.driver_id].findIndex((d) => d.doc_type === doc.doc_type);
      if (existingIdx !== -1) {
        const existing = docsByDriver[doc.driver_id][existingIdx];
        docsByDriver[doc.driver_id][existingIdx] = {
          ...doc,
          signedUrl: existing.signedUrl || undefined,
        };
      } else {
        docsByDriver[doc.driver_id].push(doc);
      }
    }

    // 6. Assemble compliance summaries
    const summaries: DriverKycSummary[] = await Promise.all(
      driverList.map(async (driver) => {
        const rawDocs = docsByDriver[driver.id] || [];

        // Generate signed URLs for private bucket documents if not already provided
        const docsWithUrls: DriverDocument[] = await Promise.all(
          rawDocs.map(async (doc) => {
            if (doc.signedUrl) return doc;
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
      signupAlerts: getRecentDriverSignupAlerts(20),
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
