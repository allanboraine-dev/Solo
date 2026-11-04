import { describe, it } from 'node:test';
import assert from 'node:assert';
import { KYC_DOCUMENT_CONFIGS, type DriverDocument } from '../src/types/kyc.ts';
import { validateKycFile, getDocumentExpiryState, evaluateDriverKycCompliance } from '../src/utils/kyc.ts';
import { evaluateInTripSafetyCheckIn } from '../src/utils/safetyDispatch.ts';

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

  it('flags expiring documents within 30 days and blocks driver access when any document is expired', () => {
    const now = Date.now();
    const expiredDisc: DriverDocument = {
      id: 'doc-1',
      driver_id: 'driver-1',
      doc_type: 'license_disc',
      file_path: 'driver-1/disc.jpg',
      status: 'approved',
      expires_at: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(), // Expired 3 days ago
      created_at: new Date(now - 368 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(now - 368 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const expiringPrdp: DriverDocument = {
      id: 'doc-2',
      driver_id: 'driver-1',
      doc_type: 'prdp',
      file_path: 'driver-1/prdp.jpg',
      status: 'approved',
      expires_at: new Date(now + 12 * 24 * 60 * 60 * 1000).toISOString(), // 12 days remaining
      created_at: new Date(now - 700 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(now - 700 * 24 * 60 * 60 * 1000).toISOString(),
    };

    assert.strictEqual(getDocumentExpiryState(expiredDisc, now).state, 'expired');
    assert.strictEqual(getDocumentExpiryState(expiringPrdp, now).state, 'expiring_soon');

    const blockedEval = evaluateDriverKycCompliance([expiredDisc, expiringPrdp], false, now);
    assert.strictEqual(blockedEval.isBlocked, true, 'Expired license disc must block driver from going online');
    assert.strictEqual(blockedEval.canGoOnline, false);
    assert.strictEqual(blockedEval.expiredDocs.length, 1);
    assert.strictEqual(blockedEval.expiredDocs[0].docType, 'license_disc');
    assert.strictEqual(blockedEval.expiringSoonDocs.length, 1);
    assert.strictEqual(blockedEval.expiringSoonDocs[0].docType, 'prdp');

    // Once driver uploads a renewed license disc, access is restored while retaining the 12-day PrDP reminder
    const renewedDisc: DriverDocument = {
      ...expiredDisc,
      expires_at: new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const unblockedEval = evaluateDriverKycCompliance([renewedDisc, expiringPrdp], false, now);
    assert.strictEqual(unblockedEval.isBlocked, false, 'Renewed document must unblock driver');
    assert.strictEqual(unblockedEval.canGoOnline, true);
    assert.strictEqual(unblockedEval.expiringSoonDocs.length, 1);
  });

  it('triggers proactive rider safety check-in on route corridor deviation or long unscheduled stop', () => {
    // Kimberley pickup (-28.7282, 24.7499) -> dropoff (-28.7419, 24.7623)
    const normalProgress = evaluateInTripSafetyCheckIn({
      tripStatus: 'in_progress',
      currentLat: -28.735,
      currentLng: 24.756,
      pickupLat: -28.7282,
      pickupLng: 24.7499,
      dropoffLat: -28.7419,
      dropoffLng: 24.7623,
      stationarySeconds: 30,
    });
    assert.strictEqual(normalProgress.shouldPromptCheckIn, false);

    // Deviated > 3km away from corridor
    const deviatedProgress = evaluateInTripSafetyCheckIn({
      tripStatus: 'in_progress',
      currentLat: -28.785,
      currentLng: 24.81,
      pickupLat: -28.7282,
      pickupLng: 24.7499,
      dropoffLat: -28.7419,
      dropoffLng: 24.7623,
    });
    assert.strictEqual(deviatedProgress.shouldPromptCheckIn, true);
    assert.strictEqual(deviatedProgress.reason, 'route_deviation');
  });
});
