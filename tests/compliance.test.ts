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
});
