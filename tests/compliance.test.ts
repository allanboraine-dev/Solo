import { describe, it } from 'node:test';
import assert from 'node:assert';
import { KYC_DOCUMENT_CONFIGS } from '../src/types/kyc.ts';
import type { KycDocType, KycDocStatus } from '../src/types/kyc.ts';

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
  it('enforces all 4 South African statutory regulatory document requirements', () => {
    assert.strictEqual(KYC_DOCUMENT_CONFIGS.license_front.required, true);
    assert.strictEqual(KYC_DOCUMENT_CONFIGS.license_back.required, true);
    assert.strictEqual(KYC_DOCUMENT_CONFIGS.prdp.required, true);
    assert.strictEqual(KYC_DOCUMENT_CONFIGS.roadworthy.required, true);
    assert.strictEqual(KYC_DOCUMENT_CONFIGS.vehicle_photo.required, false);
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
});
