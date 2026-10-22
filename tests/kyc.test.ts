import { describe, it } from 'node:test';
import assert from 'node:assert';
import { KYC_DOCUMENT_CONFIGS } from '../src/types/kyc.ts';
import { validateKycFile } from '../src/utils/kyc.ts';

describe('Driver KYC & Compliance Validation Suite', () => {
  it('defines required South African regulatory document configurations', () => {
    assert.strictEqual(KYC_DOCUMENT_CONFIGS.driver_selfie.required, true);
    assert.strictEqual(KYC_DOCUMENT_CONFIGS.license_front.required, true);
    assert.strictEqual(KYC_DOCUMENT_CONFIGS.license_back.required, true);
    assert.strictEqual(KYC_DOCUMENT_CONFIGS.prdp.required, true);
    assert.strictEqual(KYC_DOCUMENT_CONFIGS.license_disc.required, true);
    assert.strictEqual(KYC_DOCUMENT_CONFIGS.vehicle_photo.required, true);
    assert.strictEqual(KYC_DOCUMENT_CONFIGS.roadworthy.required, true);
  });

  it('validates compliant document files (JPEG, PNG, WEBP, PDF under 10MB)', () => {
    // Mock valid File object
    const validPdf = {
      name: 'prdp_certificate.pdf',
      type: 'application/pdf',
      size: 2 * 1024 * 1024, // 2MB
    } as unknown as File;

    const resPdf = validateKycFile(validPdf, 'prdp');
    assert.strictEqual(resPdf.valid, true);

    const validJpg = {
      name: 'drivers_license.jpg',
      type: 'image/jpeg',
      size: 4.5 * 1024 * 1024, // 4.5MB
    } as unknown as File;

    const resJpg = validateKycFile(validJpg, 'license_front');
    assert.strictEqual(resJpg.valid, true);
  });

  it('rejects files exceeding the 10MB size limit', () => {
    const oversizedFile = {
      name: 'huge_scan.pdf',
      type: 'application/pdf',
      size: 15 * 1024 * 1024, // 15MB
    } as unknown as File;

    const res = validateKycFile(oversizedFile, 'roadworthy');
    assert.strictEqual(res.valid, false);
    assert.ok(res.error?.includes('10MB'));
  });

  it('rejects unauthorized or unsafe MIME types', () => {
    const maliciousFile = {
      name: 'trojan.exe',
      type: 'application/x-msdownload',
      size: 500 * 1024,
    } as unknown as File;

    const res = validateKycFile(maliciousFile, 'license_front');
    assert.strictEqual(res.valid, false);
    assert.ok(res.error?.includes('Allowed formats'));

    const videoFile = {
      name: 'dashcam.mp4',
      type: 'video/mp4',
      size: 5 * 1024 * 1024,
    } as unknown as File;

    const resVideo = validateKycFile(videoFile, 'vehicle_photo');
    assert.strictEqual(resVideo.valid, false);
  });
});
