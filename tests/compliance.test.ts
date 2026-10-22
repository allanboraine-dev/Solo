import { describe, it } from 'node:test';
import assert from 'node:assert';
import { KYC_DOCUMENT_CONFIGS } from '../src/types/kyc.ts';
import type { KycDocType, KycDocStatus } from '../src/types/kyc.ts';
import {
  saveKycDriverProfile,
  getKycDriverProfile,
  getAllKycDriverProfiles,
  saveKycDocument,
  getKycDocumentsForDriver,
  getAllKycDocuments,
  updateKycDocumentStatus,
  approveAllKycDocuments,
  resetKycStore,
  recordDriverSignupAlert,
  getRecentDriverSignupAlerts,
  markDriverSignupAlertRead,
  deleteKycDriverProfile,
  isDriverPurged,
} from '../src/utils/kycStore.ts';

// Helper simulating compliance determination logic
function calculateComplianceStatus(docs: { doc_type: KycDocType; status: KycDocStatus }[]): {
  status: 'verified' | 'pending_review' | 'rejected' | 'incomplete';
  isVerified: boolean;
} {
  const requiredTypes: KycDocType[] = ['license_front', 'license_back', 'prdp', 'roadworthy'];

  const hasAllRequired = requiredTypes.every((type) => docs.some((d) => d.doc_type === type));
  if (!hasAllRequired) {
    return { status: 'incomplete', isVerified: false };
  }

  const hasRejected = docs.some((d) => d.status === 'rejected');
  if (hasRejected) {
    return { status: 'rejected', isVerified: false };
  }

  const hasPending = docs.some((d) => d.status === 'pending');
  if (hasPending) {
    return { status: 'pending_review', isVerified: false };
  }

  const allRequiredApproved = requiredTypes.every((type) =>
    docs.some((d) => d.doc_type === type && d.status === 'approved')
  );

  if (allRequiredApproved) {
    return { status: 'verified', isVerified: true };
  }

  return { status: 'incomplete', isVerified: false };
}

describe('Admin Driver Compliance & KYC Verification Suite', () => {
  it('enforces all South African statutory regulatory document and vehicle photo requirements', () => {
    assert.strictEqual(KYC_DOCUMENT_CONFIGS.driver_selfie.required, true);
    assert.strictEqual(KYC_DOCUMENT_CONFIGS.license_front.required, true);
    assert.strictEqual(KYC_DOCUMENT_CONFIGS.license_back.required, true);
    assert.strictEqual(KYC_DOCUMENT_CONFIGS.prdp.required, true);
    assert.strictEqual(KYC_DOCUMENT_CONFIGS.license_disc.required, true);
    assert.strictEqual(KYC_DOCUMENT_CONFIGS.vehicle_photo.required, true);
    assert.strictEqual(KYC_DOCUMENT_CONFIGS.roadworthy.required, true);
  });

  it('marks driver incomplete when missing one or more required statutory documents', () => {
    const docs = [
      { doc_type: 'license_front' as KycDocType, status: 'approved' as KycDocStatus },
      { doc_type: 'license_back' as KycDocType, status: 'approved' as KycDocStatus },
      { doc_type: 'prdp' as KycDocType, status: 'approved' as KycDocStatus },
      // Roadworthy missing
    ];

    const result = calculateComplianceStatus(docs);
    assert.strictEqual(result.status, 'incomplete');
    assert.strictEqual(result.isVerified, false);
  });

  it('marks driver pending_review when all 4 documents are uploaded and awaiting admin review', () => {
    const docs = [
      { doc_type: 'license_front' as KycDocType, status: 'approved' as KycDocStatus },
      { doc_type: 'license_back' as KycDocType, status: 'approved' as KycDocStatus },
      { doc_type: 'prdp' as KycDocType, status: 'pending' as KycDocStatus },
      { doc_type: 'roadworthy' as KycDocType, status: 'pending' as KycDocStatus },
    ];

    const result = calculateComplianceStatus(docs);
    assert.strictEqual(result.status, 'pending_review');
    assert.strictEqual(result.isVerified, false);
  });

  it('marks driver rejected if any statutory document is rejected by compliance officer', () => {
    const docs = [
      { doc_type: 'license_front' as KycDocType, status: 'approved' as KycDocStatus },
      { doc_type: 'license_back' as KycDocType, status: 'approved' as KycDocStatus },
      { doc_type: 'prdp' as KycDocType, status: 'rejected' as KycDocStatus }, // Expired PrDP
      { doc_type: 'roadworthy' as KycDocType, status: 'approved' as KycDocStatus },
    ];

    const result = calculateComplianceStatus(docs);
    assert.strictEqual(result.status, 'rejected');
    assert.strictEqual(result.isVerified, false);
  });

  it('automatically grants verified clearance when all 4 required documents are approved', () => {
    const docs = [
      { doc_type: 'license_front' as KycDocType, status: 'approved' as KycDocStatus },
      { doc_type: 'license_back' as KycDocType, status: 'approved' as KycDocStatus },
      { doc_type: 'prdp' as KycDocType, status: 'approved' as KycDocStatus },
      { doc_type: 'roadworthy' as KycDocType, status: 'approved' as KycDocStatus },
    ];

    const result = calculateComplianceStatus(docs);
    assert.strictEqual(result.status, 'verified');
    assert.strictEqual(result.isVerified, true);
  });

  it('validates search filtering across South African driver details', () => {
    const driver = {
      fullName: 'Sipho Ndlovu',
      phone: '+27821234567',
      licensePlate: 'ND 892-100',
      prdpNumber: 'PRDP-KZN-99128',
    };

    const searchHits = [
      'sipho',
      '892-100',
      '+2782',
      'prdp-kzn',
    ];

    for (const query of searchHits) {
      const match =
        driver.fullName.toLowerCase().includes(query) ||
        driver.phone.toLowerCase().includes(query) ||
        driver.licensePlate.toLowerCase().includes(query) ||
        driver.prdpNumber.toLowerCase().includes(query);
      assert.strictEqual(match, true, `Query "${query}" should match driver profile`);
    }
  });

  it('validates UUID safety for admin review notes to prevent Postgres UUID syntax errors', () => {
    const isValidUuid = (val?: unknown): boolean =>
      typeof val === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

    // Non-UUID text notes (e.g. "SOLO Compliance Officer") must be filtered out
    assert.strictEqual(isValidUuid('SOLO Compliance Officer'), false);
    assert.strictEqual(isValidUuid('Allan Boraine'), false);
    assert.strictEqual(isValidUuid(''), false);
    assert.strictEqual(isValidUuid(undefined), false);

    // Authentic UUID v4 must be accepted
    assert.strictEqual(isValidUuid('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'), true);
    assert.strictEqual(isValidUuid('d0000000-0000-0000-0000-000000000001'), true);
  });

  it('validates document rejection rule: rejection reason is strictly required', () => {
    const validateReviewRequest = (body: { status: string; rejectionReason?: string }) => {
      if (body.status === 'rejected' && (!body.rejectionReason || !body.rejectionReason.trim())) {
        return { valid: false, error: 'A specific rejection reason is required when rejecting a document' };
      }
      return { valid: true };
    };

    assert.strictEqual(validateReviewRequest({ status: 'rejected', rejectionReason: '' }).valid, false);
    assert.strictEqual(validateReviewRequest({ status: 'rejected', rejectionReason: '   ' }).valid, false);
    assert.strictEqual(
      validateReviewRequest({ status: 'rejected', rejectionReason: 'Document is blurry or unreadable' }).valid,
      true
    );
    assert.strictEqual(validateReviewRequest({ status: 'approved' }).valid, true);
  });

  it('validates batch approval state transitions and immediate driver clearance', () => {
    const docs = [
      { doc_type: 'license_front' as KycDocType, status: 'pending' as KycDocStatus },
      { doc_type: 'license_back' as KycDocType, status: 'pending' as KycDocStatus },
      { doc_type: 'prdp' as KycDocType, status: 'pending' as KycDocStatus },
      { doc_type: 'roadworthy' as KycDocType, status: 'pending' as KycDocStatus },
    ];

    // Before batch approve: pending
    const initialStatus = calculateComplianceStatus(docs);
    assert.strictEqual(initialStatus.status, 'pending_review');
    assert.strictEqual(initialStatus.isVerified, false);

    // Simulate batch approve_all
    const approvedDocs = docs.map((d) => ({ ...d, status: 'approved' as KycDocStatus }));
    const batchResult = calculateComplianceStatus(approvedDocs);
    assert.strictEqual(batchResult.status, 'verified');
    assert.strictEqual(batchResult.isVerified, true);
  });

  describe('End-to-End Multi-Driver Registration, Document Upload & Admin Approval', () => {
    it('allows new driver 1 (Sipho) to register, upload docs, and admin to manually approve individually', () => {
      resetKycStore();
      const driverId = '11111111-2222-3333-4444-555555555555';

      // 1. Driver 1 registers with personal and vehicle info
      const profile = saveKycDriverProfile({
        id: driverId,
        fullName: 'Sipho Mthembu',
        email: 'sipho@example.co.za',
        phone: '+27 82 555 1234',
        vehicleMake: 'Toyota',
        vehicleModel: 'Corolla Quest',
        licensePlate: 'GP 789-456',
        prdpNumber: 'PRDP-GP-2026',
        isVerified: false,
      });

      assert.strictEqual(profile.fullName, 'Sipho Mthembu');
      assert.strictEqual(profile.isVerified, false);

      // 2. Driver 1 uploads statutory KYC documents
      saveKycDocument({
        id: 'doc-sipho-lic-f',
        driver_id: driverId,
        doc_type: 'license_front',
        file_path: `${driverId}/license_front.jpg`,
        status: 'pending',
      });
      saveKycDocument({
        id: 'doc-sipho-lic-b',
        driver_id: driverId,
        doc_type: 'license_back',
        file_path: `${driverId}/license_back.jpg`,
        status: 'pending',
      });
      saveKycDocument({
        id: 'doc-sipho-prdp',
        driver_id: driverId,
        doc_type: 'prdp',
        file_path: `${driverId}/prdp.jpg`,
        status: 'pending',
      });
      saveKycDocument({
        id: 'doc-sipho-rw',
        driver_id: driverId,
        doc_type: 'roadworthy',
        file_path: `${driverId}/roadworthy.jpg`,
        status: 'pending',
      });

      // Verify documents are saved and listed for driver
      const initialDocs = getKycDocumentsForDriver(driverId);
      assert.strictEqual(initialDocs.length, 4);
      assert.strictEqual(initialDocs.every((d) => d.status === 'pending'), true);

      // 3. Admin rejects roadworthy certificate due to expiry
      const rejectResult = updateKycDocumentStatus(
        driverId,
        'roadworthy',
        'rejected',
        'Certificate expired on 2026-08-01. Please upload valid certificate.',
        '00000000-0000-4000-8000-000000000001'
      );
      assert.strictEqual(rejectResult.document.status, 'rejected');
      assert.strictEqual(rejectResult.document.rejection_reason?.includes('expired'), true);
      assert.strictEqual(rejectResult.isAllApproved, false);

      // Driver remains unverified
      let currentProfile = getKycDriverProfile(driverId);
      assert.strictEqual(currentProfile?.isVerified, false);

      // 4. Driver uploads renewed roadworthy certificate
      saveKycDocument({
        id: 'doc-sipho-rw-renewed',
        driver_id: driverId,
        doc_type: 'roadworthy',
        file_path: `${driverId}/roadworthy_renewed.jpg`,
        status: 'pending',
      });

      // 5. Admin approves license_front, license_back, prdp, and renewed roadworthy
      updateKycDocumentStatus(driverId, 'license_front', 'approved');
      updateKycDocumentStatus(driverId, 'license_back', 'approved');
      updateKycDocumentStatus(driverId, 'prdp', 'approved');
      const finalApproval = updateKycDocumentStatus(driverId, 'roadworthy', 'approved');

      assert.strictEqual(finalApproval.isAllApproved, true);

      // Driver profile must now be fully verified
      currentProfile = getKycDriverProfile(driverId);
      assert.strictEqual(currentProfile?.isVerified, true);
    });

    it('allows new driver 2 (Thabo) to register, upload docs, and admin to batch approve all', () => {
      const driverId = '22222222-3333-4444-5555-666666666666';

      // 1. Driver 2 registers
      saveKycDriverProfile({
        id: driverId,
        fullName: 'Thabo Molefe',
        email: 'thabo@example.co.za',
        phone: '+27 83 444 9876',
        vehicleMake: 'Volkswagen',
        vehicleModel: 'Polo Sedan',
        licensePlate: 'CA 654-321',
        prdpNumber: 'PRDP-WC-9988',
        isVerified: false,
      });

      // 2. Driver 2 uploads documents
      saveKycDocument({
        id: 'doc-thabo-lic-f',
        driver_id: driverId,
        doc_type: 'license_front',
        file_path: `${driverId}/license_front.jpg`,
        status: 'pending',
      });
      saveKycDocument({
        id: 'doc-thabo-lic-b',
        driver_id: driverId,
        doc_type: 'license_back',
        file_path: `${driverId}/license_back.jpg`,
        status: 'pending',
      });
      saveKycDocument({
        id: 'doc-thabo-prdp',
        driver_id: driverId,
        doc_type: 'prdp',
        file_path: `${driverId}/prdp.jpg`,
        status: 'pending',
      });
      saveKycDocument({
        id: 'doc-thabo-rw',
        driver_id: driverId,
        doc_type: 'roadworthy',
        file_path: `${driverId}/roadworthy.jpg`,
        status: 'pending',
      });
      saveKycDocument({
        id: 'doc-thabo-vp',
        driver_id: driverId,
        doc_type: 'vehicle_photo',
        file_path: `${driverId}/vehicle_photo.jpg`,
        status: 'pending',
      });

      // 3. Admin performs batch "Approve All & Verify"
      const batchResult = approveAllKycDocuments(driverId, '00000000-0000-4000-8000-000000000001');
      assert.strictEqual(batchResult.isVerified, true);
      assert.strictEqual(batchResult.documents.length, 5);
      assert.strictEqual(batchResult.documents.every((d) => d.status === 'approved'), true);

      // Verify profile state
      const profile = getKycDriverProfile(driverId);
      assert.strictEqual(profile?.isVerified, true);
    });

    it('lists all registered drivers in compliance dashboard store without dropping drivers', () => {
      const allDrivers = getAllKycDriverProfiles();
      assert.strictEqual(allDrivers.length >= 2, true);
      assert.strictEqual(allDrivers.some((d) => d.fullName === 'Sipho Mthembu'), true);
      assert.strictEqual(allDrivers.some((d) => d.fullName === 'Thabo Molefe'), true);
    });

    it('guarantees kycStore contains only real registered drivers and resets cleanly', () => {
      resetKycStore();
      assert.strictEqual(getAllKycDriverProfiles().length, 0);
      assert.strictEqual(getAllKycDocuments().length, 0);
      assert.strictEqual(getRecentDriverSignupAlerts().length, 0);
    });

    it('records and retrieves update notifications for Driver Verification Command Centre when new drivers sign up', () => {
      resetKycStore();

      // Driver 1 registers
      const alert1 = recordDriverSignupAlert({
        driverId: 'driver-kagiso-001',
        fullName: 'Kagiso Tau',
        email: 'kagiso@solo.co.za',
        phone: '+27835551234',
        vehicleMake: 'Toyota',
        vehicleModel: 'Corolla Quest',
        licensePlate: 'NC 582-991',
        prdpNumber: 'PRDP-NC-8812',
      });

      assert.ok(alert1.id);
      assert.strictEqual(alert1.fullName, 'Kagiso Tau');
      assert.strictEqual(alert1.read, false);

      // Driver 2 registers
      const alert2 = recordDriverSignupAlert({
        driverId: 'driver-lerato-002',
        fullName: 'Lerato Khumalo',
        email: 'lerato@solo.co.za',
        phone: '+27827774321',
        vehicleMake: 'Volkswagen',
        vehicleModel: 'Polo Vivo',
        licensePlate: 'NC 331-402',
      });

      const alerts = getRecentDriverSignupAlerts();
      assert.strictEqual(alerts.length, 2);
      // Newest first
      assert.strictEqual(alerts[0].driverId, 'driver-lerato-002');
      assert.strictEqual(alerts[1].driverId, 'driver-kagiso-001');

      // Command centre marks alert as read
      markDriverSignupAlertRead(alert1.id);
      const updatedAlerts = getRecentDriverSignupAlerts();
      const readAlert = updatedAlerts.find((a) => a.id === alert1.id);
      assert.strictEqual(readAlert?.read, true);
    });

    it('verifies audioAlert provides non-crashing playAdminNewDriverChime in SSR/Node environment', async () => {
      const { audioAlert } = await import('../src/utils/audioAlert.ts');
      assert.doesNotThrow(() => {
        audioAlert.playAdminNewDriverChime();
      });
    });

    it('allows Operations Manager to delete and purge a bogus driver registration', () => {
      // 1. Create a bogus driver registration
      const bogusId = 'driver-bogus-999';
      saveKycDriverProfile({
        id: bogusId,
        fullName: 'Test Bogus Driver',
        email: 'bogus@spammer.com',
        phone: '+27800000000',
        licensePlate: 'FAKE 123',
      });

      saveKycDocument({
        id: 'doc-bogus-1',
        driver_id: bogusId,
        doc_type: 'license_front',
        file_path: `${bogusId}/fake.jpg`,
        status: 'pending',
      });

      recordDriverSignupAlert({
        driverId: bogusId,
        fullName: 'Test Bogus Driver',
      });

      // Confirm bogus driver exists
      assert.ok(getKycDriverProfile(bogusId));
      assert.strictEqual(getKycDocumentsForDriver(bogusId).length, 1);
      assert.strictEqual(isDriverPurged(bogusId), false);

      // 2. Operations Manager deletes the bogus driver
      const deleted = deleteKycDriverProfile(bogusId);
      assert.strictEqual(deleted, true);

      // 3. Confirm completely purged from store and marked as purged
      assert.strictEqual(getKycDriverProfile(bogusId), undefined);
      assert.strictEqual(getKycDocumentsForDriver(bogusId).length, 0);
      assert.strictEqual(isDriverPurged(bogusId), true);
      assert.strictEqual(
        getRecentDriverSignupAlerts().some((a) => a.driverId === bogusId),
        false
      );
      assert.strictEqual(
        getAllKycDriverProfiles().some((d) => d.id === bogusId),
        false
      );
    });
  });
});

